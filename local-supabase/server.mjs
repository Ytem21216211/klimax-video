// Local Supabase-compatible shim.
// Listens on port 54321. Implements a subset of:
//   - GoTrue-compatible auth (/auth/v1/...)
//   - PostgREST-compatible database (/rest/v1/...)
//   - Storage-compatible file API (/storage/v1/...)
//
// Talks to a local Postgres database (klimax_local_supabase).
// Storage files are persisted under local-data/supabase-storage/<bucket>/<path>.

import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// ===== Config =====
const PORT = Number(process.env.KLIMAX_SUPABASE_PORT || 54321);
const DB_NAME = process.env.KLIMAX_SUPABASE_DB || "klimax_local_supabase";
const DB_USER = process.env.KLIMAX_SUPABASE_USER || "kzrr";
const DB_HOST = process.env.KLIMAX_SUPABASE_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.KLIMAX_SUPABASE_DB_PORT || 5432);
const DB_PASSWORD = process.env.KLIMAX_SUPABASE_PASSWORD || "";
const JWT_SECRET = process.env.KLIMAX_SUPABASE_JWT_SECRET || "klimax-local-supabase-dev-secret";
const ANON_KEY = process.env.KLIMAX_SUPABASE_ANON_KEY || "klimax-local-anon-key";
const SERVICE_ROLE_KEY = process.env.KLIMAX_SUPABASE_SERVICE_KEY || "klimax-local-service-key";
const STORAGE_ROOT = path.join(projectRoot, "local-data", "supabase-storage");

// ===== Database =====
export const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("[supabase-shim] pg pool error:", err.message);
});

const SCHEMA_HINT_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
function assertSafeIdent(name) {
  if (!SCHEMA_HINT_REGEX.test(name)) {
    throw new Error(`Unsafe identifier: ${name}`);
  }
}

// ===== JWT (HS256) =====
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}
function signJwt(payload, expiresInSec = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = { iat: now, exp: now + expiresInSec, ...payload };
  const headerEnc = b64url(JSON.stringify(header));
  const bodyEnc = b64url(JSON.stringify(body));
  const data = `${headerEnc}.${bodyEnc}`;
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(data).digest();
  return `${data}.${b64url(sig)}`;
}
function verifyJwt(token) {
  try {
    const [headerEnc, bodyEnc, sig] = token.split(".");
    if (!headerEnc || !bodyEnc || !sig) return null;
    const data = `${headerEnc}.${bodyEnc}`;
    const expectedSig = b64url(crypto.createHmac("sha256", JWT_SECRET).update(data).digest());
    if (sig !== expectedSig) return null;
    const body = JSON.parse(b64urlDecode(bodyEnc).toString("utf8"));
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

function randomToken(bytes = 32) {
  return b64url(crypto.randomBytes(bytes));
}

// ===== Password hashing (PBKDF2) =====
function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, useSalt, 100_000, 32, "sha256").toString("hex");
  return `pbkdf2$${useSalt}$${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("pbkdf2$")) return false;
  const [, salt, hash] = stored.split("$");
  const candidate = crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

// ===== Auth helpers =====
function extractToken(req) {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}
async function userFromToken(token) {
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload || !payload.sub) return null;
  // Validate session still exists in the sessions table (logout invalidates it)
  const { rows: srows } = await pool.query(
    "SELECT 1 FROM auth.sessions WHERE access_token = $1 AND expires_at > NOW()",
    [token]
  );
  if (srows.length === 0) return null;
  const { rows } = await pool.query(
    "SELECT id, email, raw_user_meta_data, created_at, updated_at FROM auth.users WHERE id = $1",
    [payload.sub]
  );
  return rows[0] || null;
}
function userResponse(u) {
  if (!u) return null;
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: u.created_at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data || {},
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}
async function issueSession(user) {
  // Include a random jti so two sessions issued for the same user within the
  // same second (e.g. signup immediately followed by signin) don't produce an
  // identical JWT, which would collide on the sessions primary key.
  const access = signJwt({ sub: user.id, role: "authenticated", email: user.email, jti: randomToken(12) }, 3600);
  const refresh = randomToken(32);
  const expiresAt = new Date(Date.now() + 3600 * 1000);
  await pool.query(
    "INSERT INTO auth.sessions (access_token, refresh_token, user_id, expires_at) VALUES ($1, $2, $3, $4)",
    [access, refresh, user.id, expiresAt]
  );
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: 3600,
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    token_type: "bearer",
    user: userResponse(user),
  };
}

// ===== PostgREST query parsing =====
const RESTRICTED_TABLES = new Set([
  // auth/storage tables are managed through their own endpoints
]);

const PGROP = {
  eq: "=", neq: "<>", ne: "<>",
  gt: ">", gte: ">=", lt: "<", lte: "<=",
  like: "LIKE", ilike: "ILIKE",
  is: "IS",
  in: "IN", cs: "@>", cd: "<@",
  not: null,
};

function parsePostgRestQuery(query) {
  const filters = [];
  let select = "*";
  let order = null;
  let limit = null;
  let offset = null;
  for (const [rawKey, rawVal] of Object.entries(query)) {
    const key = rawKey;
    const val = String(rawVal);
    if (key === "select") {
      select = val;
      continue;
    }
    if (key === "order") {
      const parts = val.split(",").map((s) => s.trim()).filter(Boolean);
      order = parts.map((p) => {
        const [col, dir = "asc"] = p.split(".");
        assertSafeIdent(col);
        return `${col} ${dir.toLowerCase() === "desc" ? "DESC" : "ASC"}`;
      }).join(", ");
      continue;
    }
    if (key === "limit") {
      limit = parseInt(val, 10);
      if (!Number.isFinite(limit)) limit = null;
      continue;
    }
    if (key === "offset") {
      offset = parseInt(val, 10);
      if (!Number.isFinite(offset)) offset = null;
      continue;
    }
    // PostgREST syntax: col=op.value  (op is in the value, e.g. "eq.5", "in.(a,b,c)", "is.null")
    let col = key;
    let op = "eq";
    let rawOpVal = val;
    const vDot = val.indexOf(".");
    if (vDot > 0) {
      const opKey = val.slice(0, vDot);
      if (opKey in PGROP) {
        op = opKey;
        rawOpVal = val.slice(vDot + 1);
      }
    }
    assertSafeIdent(col);
    const opSql = PGROP[op];
    if (opSql == null) continue;
    if (op === "in") {
      // rawOpVal looks like "(a,b,c)" — strip parens
      const inner = rawOpVal.replace(/^\(/, "").replace(/\)$/, "");
      const arr = inner.split(",").map((s) => s.trim()).filter(Boolean);
      filters.push({ col, op, values: arr });
      continue;
    }
    if (op === "is") {
      const param = rawOpVal.toLowerCase() === "null" ? null : rawOpVal;
      filters.push({ col, op, param, values: [param] });
      continue;
    }
    filters.push({ col, op, param: rawOpVal, values: [rawOpVal] });
  }
  return { select, filters, order, limit, offset };
}

function selectColumns(select) {
  if (!select || select === "*") return "*";
  // PostgREST allows "col1,col2,rel(*)" - we only support plain col names + jsonb extraction "(*)"
  // Strip embedded-resource syntax: anything inside parens
  const cleaned = select
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\(.*\)$/, "").trim())
    .filter(Boolean)
    .map((s) => s.replace(/[^A-Za-z0-9_.*]/g, ""));
  const safe = cleaned.filter((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c) || c === "*");
  return safe.length ? safe.join(", ") : "*";
}

function buildWhere(filters, startParamIdx = 1) {
  const clauses = [];
  const params = [];
  let i = startParamIdx;
  for (const f of filters) {
    if (f.op === "in") {
      const placeholders = f.values.map(() => `$${i++}`).join(",");
      clauses.push(`${f.col} IN (${placeholders})`);
      params.push(...f.values);
    } else if (f.op === "is" && f.values[0] === null) {
      clauses.push(`${f.col} IS NULL`);
    } else {
      const op = PGROP[f.op];
      clauses.push(`${f.col} ${op} $${i++}`);
      params.push(f.values[0]);
    }
  }
  return { sql: clauses.length ? "WHERE " + clauses.join(" AND ") : "", params };
}

async function listTable(table, query, wantObject) {
  assertSafeIdent(table);
  const { select, filters, order, limit, offset } = parsePostgRestQuery(query);
  const cols = selectColumns(select);
  const where = buildWhere(filters, 1);
  const orderSql = order ? `ORDER BY ${order}` : "";
  const limitSql = limit != null ? `LIMIT ${Math.max(0, Math.min(10000, limit))}` : "";
  const offsetSql = offset != null ? `OFFSET ${Math.max(0, offset)}` : "";
  const sql = `SELECT ${cols} FROM public.${table} ${where.sql} ${orderSql} ${limitSql} ${offsetSql}`;
  const { rows } = await pool.query(sql, where.params);
  if (wantObject) {
    if (rows.length === 0) return { row: null, count: 0 };
    return { row: rows[0], count: rows.length };
  }
  return { rows, count: rows.length };
}

async function insertRows(table, payload) {
  assertSafeIdent(table);
  const arr = Array.isArray(payload) ? payload : [payload];
  if (arr.length === 0) return [];
  const cols = Object.keys(arr[0]);
  cols.forEach(assertSafeIdent);
  const valuesSql = arr.map((row, rowIdx) => {
    const start = rowIdx * cols.length + 1;
    return `(${cols.map((_, c) => `$${start + c}`).join(",")})`;
  }).join(",");
  const sql = `INSERT INTO public.${table} (${cols.join(",")}) VALUES ${valuesSql} RETURNING *`;
  const params = [];
  for (const row of arr) for (const c of cols) params.push(row[c] ?? null);
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function updateRows(table, payload, query) {
  assertSafeIdent(table);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("update body must be a single object");
  }
  const setCols = Object.keys(payload);
  if (setCols.length === 0) return [];
  setCols.forEach(assertSafeIdent);
  const { filters } = parsePostgRestQuery(query);
  const where = buildWhere(filters, setCols.length + 1);
  const setSql = setCols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const sql = `UPDATE public.${table} SET ${setSql} ${where.sql} RETURNING *`;
  const params = [...setCols.map((c) => payload[c] ?? null), ...where.params];
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function deleteRows(table, query) {
  assertSafeIdent(table);
  const { filters } = parsePostgRestQuery(query);
  const where = buildWhere(filters, 1);
  const sql = `DELETE FROM public.${table} ${where.sql}`;
  const { rowCount } = await pool.query(sql, where.params);
  return rowCount || 0;
}

// ===== App =====
const app = express();
// Restrict CORS to localhost front-ends (this shim holds auth sessions + the user's
// Postgres-backed data); `origin:true` let any visited website read it via the browser.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || LOCAL_ORIGIN.test(origin)),
  credentials: true,
  exposedHeaders: ["Content-Range", "Range"],
}));
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Health
app.get("/health", (_req, res) => res.json({ ok: true, db: DB_NAME, storage: STORAGE_ROOT }));

// -------------------------------------------------------------------------
// Auth endpoints (GoTrue-style)
// -------------------------------------------------------------------------
async function signUpHandler(req, res) {
  const { email, password, options } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  try {
    const existing = await pool.query("SELECT id FROM auth.users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "User already registered", code: "user_already_exists" });
    }
    const meta = (options && options.data) || {};
    const insert = await pool.query(
      `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
       VALUES ($1, $2, $3::jsonb) RETURNING id, email, raw_user_meta_data, created_at, updated_at`,
      [email.toLowerCase(), hashPassword(password), JSON.stringify(meta)]
    );
    const user = insert.rows[0];
    // Auto-create profile (matches Supabase handle_new_user trigger)
    const username = meta.username || email.split("@")[0];
    await pool.query(
      "INSERT INTO public.profiles (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [user.id, username]
    );
    const session = await issueSession(user);
    return res.status(200).json({ user: session.user, session });
  } catch (e) {
    console.error("[auth/signup]", e);
    return res.status(500).json({ error: e.message });
  }
}

app.post("/auth/v1/signup", signUpHandler);
app.post("/auth/v1/signup/", signUpHandler);

async function tokenHandler(req, res) {
  const grantType = (req.query.grant_type || "").toString();
  if (grantType === "password") {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "invalid_grant" });
    const { rows } = await pool.query("SELECT * FROM auth.users WHERE email = $1", [email.toLowerCase()]);
    const u = rows[0];
    if (!u || !verifyPassword(password, u.encrypted_password)) {
      return res.status(400).json({ error: "Invalid login credentials", code: "invalid_credentials" });
    }
    const session = await issueSession(u);
    return res.json(session);
  }
  if (grantType === "refresh_token") {
    const refresh = (req.body && req.body.refresh_token) || "";
    if (!refresh) return res.status(400).json({ error: "invalid_grant" });
    const { rows: srows } = await pool.query("SELECT * FROM auth.sessions WHERE refresh_token = $1", [refresh]);
    const s = srows[0];
    if (!s) return res.status(400).json({ error: "invalid_grant" });
    await pool.query("DELETE FROM auth.sessions WHERE access_token = $1", [s.access_token]);
    const { rows: urows } = await pool.query("SELECT * FROM auth.users WHERE id = $1", [s.user_id]);
    if (!urows[0]) return res.status(400).json({ error: "invalid_grant" });
    const session = await issueSession(urows[0]);
    return res.json(session);
  }
  return res.status(400).json({ error: "unsupported_grant_type" });
}

app.post("/auth/v1/token", tokenHandler);
app.post("/auth/v1/token/", tokenHandler);

async function userHandler(req, res) {
  const token = extractToken(req);
  const user = await userFromToken(token);
  if (!user) return res.status(401).json({ error: "not_authenticated" });
  if (req.method === "PUT" || req.method === "PATCH") {
    const body = req.body || {};
    if (body.password) {
      await pool.query("UPDATE auth.users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2", [
        hashPassword(body.password), user.id,
      ]);
    }
    if (body.email && body.email.toLowerCase() !== user.email) {
      await pool.query("UPDATE auth.users SET email = $1, updated_at = NOW() WHERE id = $2", [
        body.email.toLowerCase(), user.id,
      ]);
    }
    if (body.data) {
      const meta = { ...(user.raw_user_meta_data || {}), ...body.data };
      await pool.query("UPDATE auth.users SET raw_user_meta_data = $1::jsonb, updated_at = NOW() WHERE id = $2", [
        JSON.stringify(meta), user.id,
      ]);
    }
    const { rows } = await pool.query("SELECT * FROM auth.users WHERE id = $1", [user.id]);
    return res.json(userResponse(rows[0]));
  }
  return res.json(userResponse(user));
}
app.get("/auth/v1/user", userHandler);
app.get("/auth/v1/user/", userHandler);
app.put("/auth/v1/user", userHandler);
app.put("/auth/v1/user/", userHandler);

async function logoutHandler(req, res) {
  const token = extractToken(req);
  if (token) {
    await pool.query("DELETE FROM auth.sessions WHERE access_token = $1", [token]);
  }
  return res.json({});
}
app.post("/auth/v1/logout", logoutHandler);
app.post("/auth/v1/logout/", logoutHandler);

// -------------------------------------------------------------------------
// REST endpoints (PostgREST-style)
// -------------------------------------------------------------------------
function wantsSingleObject(req) {
  const a = (req.headers.accept || "").toLowerCase();
  return a.includes("application/vnd.pgrst.object+json");
}

async function listTablesRoute(_req, res) {
  const { rows } = await pool.query(`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  res.json(rows);
}
app.get("/rest/v1/", listTablesRoute);

async function getTableRoute(req, res) {
  try {
    const wantObj = wantsSingleObject(req);
    const result = await listTable(req.params.table, req.query, wantObj);
    const rows = wantObj ? (result.row ? [result.row] : []) : result.rows;
    const count = result.count;
    res.set("Content-Range", `0-${Math.max(0, count - 1)}/${count}`);
    if (wantObj) {
      if (count === 0) return res.status(406).json({ error: "no rows" });
      return res.json(result.row);
    }
    return res.json(rows);
  } catch (e) {
    console.error("[rest GET]", req.params.table, e);
    return res.status(400).json({ error: e.message, code: e.code || "rest_error" });
  }
}
app.get("/rest/v1/:table", getTableRoute);
app.get("/rest/v1/:table/", getTableRoute);

async function postTableRoute(req, res) {
  try {
    const rows = await insertRows(req.params.table, req.body);
    const wantRep = (req.headers.prefer || "").toLowerCase().includes("return=representation");
    if (!wantRep) return res.status(204).end();
    const wantObj = wantsSingleObject(req);
    return res.status(201).json(wantObj ? (rows[0] || null) : rows);
  } catch (e) {
    console.error("[rest POST]", req.params.table, e);
    return res.status(400).json({ error: e.message, code: e.code || "rest_error" });
  }
}
app.post("/rest/v1/:table", postTableRoute);
app.post("/rest/v1/:table/", postTableRoute);

async function patchTableRoute(req, res) {
  try {
    const rows = await updateRows(req.params.table, req.body, req.query);
    const wantRep = (req.headers.prefer || "").toLowerCase().includes("return=representation");
    if (!wantRep) return res.status(204).end();
    return res.json(rows);
  } catch (e) {
    console.error("[rest PATCH]", req.params.table, e);
    return res.status(400).json({ error: e.message, code: e.code || "rest_error" });
  }
}
app.patch("/rest/v1/:table", patchTableRoute);
app.patch("/rest/v1/:table/", patchTableRoute);

async function deleteTableRoute(req, res) {
  try {
    const count = await deleteRows(req.params.table, req.query);
    res.set("Content-Range", `*/${count}`);
    return res.status(204).end();
  } catch (e) {
    console.error("[rest DELETE]", req.params.table, e);
    return res.status(400).json({ error: e.message, code: e.code || "rest_error" });
  }
}
app.delete("/rest/v1/:table", deleteTableRoute);
app.delete("/rest/v1/:table/", deleteTableRoute);

// -------------------------------------------------------------------------
// Storage endpoints
// -------------------------------------------------------------------------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

function bucketDir(bucket) {
  return path.join(STORAGE_ROOT, bucket);
}
function objectPath(bucket, objPath) {
  return path.join(bucketDir(bucket), objPath);
}
function splatToPath(req) {
  const s = req.params.splat;
  if (Array.isArray(s)) return s.join("/");
  return typeof s === "string" ? s : "";
}
async function ensureBucket(bucket) {
  const { rows } = await pool.query("SELECT 1 FROM storage.buckets WHERE id = $1", [bucket]);
  if (rows.length === 0) {
    await fsp.mkdir(bucketDir(bucket), { recursive: true });
    await pool.query("INSERT INTO storage.buckets (id, name, public) VALUES ($1, $1, true) ON CONFLICT (id) DO NOTHING", [bucket]);
  } else {
    await fsp.mkdir(bucketDir(bucket), { recursive: true });
  }
}

async function uploadHandler(req, res) {
  try {
    const bucket = req.params.bucket;
    const objPath = splatToPath(req);
    await ensureBucket(bucket);
    let fileBuf;
    let contentType;
    let upsert = (req.headers["x-upsert"] || "").toLowerCase() === "true";
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("multipart/form-data")) {
      await new Promise((resolve, reject) => {
        upload.single("file")(req, res, (err) => err ? reject(err) : resolve());
      });
      if (!req.file) return res.status(400).json({ error: "missing file" });
      fileBuf = req.file.buffer;
      contentType = req.file.mimetype;
    } else {
      fileBuf = req.body;
      contentType = req.headers["content-type"] || "application/octet-stream";
      if (!Buffer.isBuffer(fileBuf)) {
        if (typeof fileBuf === "string") fileBuf = Buffer.from(fileBuf);
        else fileBuf = Buffer.from(JSON.stringify(fileBuf || ""));
      }
    }
    const fullPath = objectPath(bucket, objPath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    if (!upsert && fs.existsSync(fullPath)) {
      return res.status(400).json({ error: "object already exists", code: "already_exists" });
    }
    await fsp.writeFile(fullPath, fileBuf);
    await pool.query(
      `INSERT INTO storage.objects (bucket_id, name, size_bytes, mime_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [bucket, objPath, fileBuf.length, contentType]
    );
    return res.status(200).json({ Key: `${bucket}/${objPath}`, Id: objPath });
  } catch (e) {
    console.error("[storage upload]", e);
    return res.status(500).json({ error: e.message });
  }
}

// Sign URL (POST) — must be registered before the generic POST upload route
const signedTokens = new Map();
async function signHandler(req, res) {
  const bucket = req.params.bucket;
  const objPath = splatToPath(req);
  const expiresIn = Number((req.body && req.body.expiresIn) || 3600);
  const token = randomToken(16);
  const expiresAt = Date.now() + expiresIn * 1000;
  const fullPath = objectPath(bucket, objPath);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Object not found" });
  signedTokens.set(token, { path: fullPath, expiresAt });
  const url = `http://127.0.0.1:${PORT}/storage/v1/object/sign/${bucket}/${objPath}?token=${token}`;
  return res.json({ signedURL: url });
}
app.post("/storage/v1/object/sign/:bucket/*splat", express.json(), signHandler);

async function signedDownloadHandler(req, res) {
  const bucket = req.params.bucket;
  const objPath = splatToPath(req);
  const token = req.query.token;
  const entry = signedTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Object not found" });
  }
  if (!fs.existsSync(entry.path)) return res.status(404).json({ error: "Object not found" });
  res.set("Content-Type", "application/octet-stream");
  res.send(await fsp.readFile(entry.path));
}
app.get("/storage/v1/object/sign/:bucket/*splat", signedDownloadHandler);

// Public bucket download — must be registered before generic GET download
async function publicHandler(req, res) {
  const bucket = req.params.bucket;
  const { rows } = await pool.query('SELECT "public" FROM storage.buckets WHERE id = $1', [bucket]);
  if (!rows[0] || !rows[0].public) return res.status(404).json({ error: "Object not found" });
  const objPath = splatToPath(req);
  const fullPath = objectPath(bucket, objPath);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Object not found" });
  res.set("Content-Type", "application/octet-stream");
  res.send(await fsp.readFile(fullPath));
}
app.get("/storage/v1/object/public/:bucket/*splat", publicHandler);

// List — must be registered before generic POST upload
async function listHandler(req, res) {
  try {
    const bucket = req.params.bucket;
    const { prefix = "", limit = 1000 } = req.body || {};
    const base = bucketDir(bucket);
    await fsp.mkdir(base, { recursive: true });
    const target = path.join(base, prefix);
    const out = [];
    const walk = (dir) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (out.length >= limit) return;
        const full = path.join(dir, e.name);
        const rel = path.relative(base, full).split(path.sep).join("/");
        if (e.isDirectory()) walk(full);
        else {
          const stat = fs.statSync(full);
          out.push({
            name: rel,
            id: rel,
            updated_at: stat.mtime.toISOString(),
            created_at: stat.birthtime.toISOString(),
            last_accessed_at: stat.atime.toISOString(),
            size: stat.size,
            metadata: {},
          });
        }
      }
    };
    walk(target);
    return res.json(out);
  } catch (e) {
    console.error("[storage list]", e);
    return res.status(500).json({ error: e.message });
  }
}
app.post("/storage/v1/object/list/:bucket", express.json(), listHandler);
app.post("/storage/v1/object/list/:bucket/", express.json(), listHandler);

// Remove — must be registered before generic DELETE
async function removeHandler(req, res) {
  try {
    const bucket = req.params.bucket;
    const objPath = splatToPath(req);
    const ct = (req.headers["content-type"] || "").toLowerCase();
    let paths = [];
    if (ct.includes("application/json") && req.body) {
      if (Array.isArray(req.body.prefixes)) paths = req.body.prefixes;
      else if (Array.isArray(req.body.paths)) paths = req.body.paths;
    }
    if (objPath) paths.push(objPath);
    if (paths.length === 0) {
      return res.status(400).json({ error: "no paths provided" });
    }
    for (const p of paths) {
      const full = objectPath(bucket, p);
      if (fs.existsSync(full)) await fsp.unlink(full);
      await pool.query("DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2", [bucket, p]);
    }
    return res.json([]);
  } catch (e) {
    console.error("[storage remove]", e);
    return res.status(500).json({ error: e.message });
  }
}
app.delete("/storage/v1/object/:bucket/*splat", express.json(), removeHandler);
app.delete("/storage/v1/object/:bucket", express.json(), removeHandler);
app.post("/storage/v1/object/:bucket/delete", express.json(), removeHandler);
app.post("/storage/v1/object/remove/:bucket", express.json(), removeHandler);

// Generic upload + download — registered LAST so specific paths match first
app.post("/storage/v1/object/:bucket/*splat", uploadHandler);
app.post("/storage/v1/object/:bucket", uploadHandler);
app.put("/storage/v1/object/:bucket/*splat", uploadHandler);
app.put("/storage/v1/object/:bucket", uploadHandler);

async function downloadHandler(req, res) {
  try {
    const bucket = req.params.bucket;
    const objPath = splatToPath(req);
    const fullPath = objectPath(bucket, objPath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "Object not found", code: "not_found" });
    }
    const buf = await fsp.readFile(fullPath);
    res.set("Content-Type", "application/octet-stream");
    res.set("Content-Length", String(buf.length));
    res.send(buf);
  } catch (e) {
    console.error("[storage download]", e);
    return res.status(500).json({ error: e.message });
  }
}
app.get("/storage/v1/object/:bucket/*splat", downloadHandler);

// -------------------------------------------------------------------------
// Bootstrap
// -------------------------------------------------------------------------
async function initBuckets() {
  await fsp.mkdir(STORAGE_ROOT, { recursive: true });
  const { rows } = await pool.query("SELECT id FROM storage.buckets");
  for (const r of rows) {
    await fsp.mkdir(bucketDir(r.id), { recursive: true });
  }
}

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log(`[supabase-shim] Connected to Postgres db=${DB_NAME} user=${DB_USER}`);
  } catch (e) {
    console.error("[supabase-shim] FATAL: cannot reach Postgres:", e.message);
    process.exit(1);
  }
  await initBuckets();
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[supabase-shim] listening on http://127.0.0.1:${PORT}`);
    console.log(`[supabase-shim]   POST /auth/v1/signup`);
    console.log(`[supabase-shim]   POST /auth/v1/token?grant_type=password`);
    console.log(`[supabase-shim]   GET  /auth/v1/user  (Bearer ...)`);
    console.log(`[supabase-shim]   POST /rest/v1/<table>`);
    console.log(`[supabase-shim]   GET  /rest/v1/<table>?col=eq.val&select=*&order=col.asc`);
    console.log(`[supabase-shim]   POST /storage/v1/object/<bucket>/<path>  (multipart 'file' OR raw body)`);
    console.log(`[supabase-shim]   GET  /storage/v1/object/<bucket>/<path>`);
    console.log(`[supabase-shim]   GET  /storage/v1/object/public/<bucket>/<path>`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((e) => {
    console.error("[supabase-shim] startup error:", e);
    process.exit(1);
  });
}

export { app, start };
