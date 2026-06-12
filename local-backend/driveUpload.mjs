// Google Drive upload for the Automatic Mode.
//
// Zero-dependency service-account auth: we sign the OAuth JWT ourselves with
// node:crypto (RS256) and call the Drive REST API with fetch. Each finished batch
// gets its OWN folder (named after the date + batch), every ready variant is
// uploaded into it, and the folder is made link-readable so the UI can show a
// clickable Drive link.
//
// The key lives in local-backend/google-service-account.json (gitignored). If the
// file is missing, isDriveConfigured() is false and the auto mode simply skips
// the upload step.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyPath = process.env.KLIMAX_GDRIVE_KEY || path.join(__dirname, "google-service-account.json");
// Service accounts have NO storage quota of their own — uploads must land inside a
// folder the USER owns and has shared (Editor) with the service-account email.
// Configure it in google-drive-config.json: { "parentFolderId": "<id du dossier>" }.
const configPath = process.env.KLIMAX_GDRIVE_CONFIG || path.join(__dirname, "google-drive-config.json");
const readParentFolderId = () => {
  const fromEnv = process.env.KLIMAX_GDRIVE_PARENT;
  if (fromEnv) return fromEnv;
  try { return JSON.parse(fs.readFileSync(configPath, "utf8")).parentFolderId || null; } catch { return null; }
};

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

// ---------------------------------------------------------------------------
// Auth: a personal Gmail Drive can ONLY receive bytes via a USER OAuth token
// (a service account has no storage quota, so its uploads 403). So we prefer an
// OAuth refresh token (google-oauth-token.json, produced by `node driveAuth.mjs`)
// and only fall back to the service account for Workspace/Shared-Drive setups.
// ---------------------------------------------------------------------------
export const oauthClientPath = process.env.KLIMAX_GDRIVE_OAUTH_CLIENT || path.join(__dirname, "google-oauth-client.json");
export const oauthTokenPath = process.env.KLIMAX_GDRIVE_OAUTH_TOKEN || path.join(__dirname, "google-oauth-token.json");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
export const readOAuthClient = () => {
  const raw = readJson(oauthClientPath);
  return raw?.installed || raw?.web || raw; // accept the file Google downloads verbatim
};
const hasOAuthUser = () => Boolean(readOAuthClient()?.client_id && readJson(oauthTokenPath)?.refresh_token);

let cachedKey = null;
const readKey = () => {
  if (cachedKey) return cachedKey;
  try {
    cachedKey = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  } catch {
    cachedKey = null;
  }
  return cachedKey;
};

export const isDriveConfigured = () => hasOAuthUser() || Boolean(readKey()?.client_email && readKey()?.private_key);
export const driveMode = () => (hasOAuthUser() ? "oauth" : isDriveConfigured() ? "service" : "off");

const b64url = (input) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// A user access token from the stored refresh token (preferred for personal Drive).
let userTokenCache = { token: null, expiresAt: 0 };
const getUserAccessToken = async () => {
  if (userTokenCache.token && Date.now() < userTokenCache.expiresAt - 120_000) return userTokenCache.token;
  const client = readOAuthClient();
  const { refresh_token } = readJson(oauthTokenPath) || {};
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) throw new Error(`Token OAuth refusé (HTTP ${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  userTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return userTokenCache.token;
};

// OAuth2 access token via signed JWT (cached until ~5 min before expiry).
let tokenCache = { token: null, expiresAt: 0 };
const getServiceAccessToken = async () => {
  const key = readKey();
  if (!key) throw new Error("Clé de service Google Drive absente.");
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300_000) return tokenCache.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: DRIVE_SCOPE,
    aud: key.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), key.private_key);
  const assertion = `${header}.${claims}.${b64url(signature)}`;

  const resp = await fetch(key.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!resp.ok) throw new Error(`Token Google refusé (HTTP ${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.token;
};

// Prefer the user token (personal Drive), fall back to the service account.
const getAccessToken = async () => (hasOAuthUser() ? getUserAccessToken() : getServiceAccessToken());

const driveFetch = async (url, options = {}) => {
  const token = await getAccessToken();
  const resp = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!resp.ok) throw new Error(`Drive API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
};

const createFolder = async (name) => {
  const parent = readParentFolderId();
  return driveFetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink&supportsAllDrives=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parent ? { parents: [parent] } : {}),
    }),
  });
};

// Anyone with the link can view — so the UI link works without a Google login.
const shareAnyoneReader = async (fileId) =>
  driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

// Resumable upload, STREAMED with node:https — Node's fetch chokes on multi-MB
// request bodies ("fetch failed"), a piped read stream has no size limit.
import https from "node:https";

// TRUE chunked resumable upload. A single monolithic PUT of a 35 MB body dies on a
// slow uplink (the previous hard 600 s timeout killed every big upload). Instead the
// resumable session is fed in 4 MiB chunks: each chunk is its own short request with
// its own timeout, Drive answers 308 + a Range header with what it stored, and a
// failed/timed-out chunk is retried from the server's confirmed offset — so progress
// is never lost and no single request has to survive for minutes.
const UPLOAD_CHUNK = 4 * 1024 * 1024; // multiple of 256 KiB as required by Drive
const CHUNK_TIMEOUT_MS = 300_000;

const putChunk = (url, buffer, start, total) =>
  new Promise((resolve, reject) => {
    const end = Math.min(start + UPLOAD_CHUNK, total);
    const chunk = buffer.subarray(start, end);
    const req = https.request(
      url,
      {
        method: "PUT",
        headers: {
          "Content-Length": chunk.length,
          "Content-Range": `bytes ${start}-${end - 1}/${total}`,
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { data += c; });
        res.on("end", () => resolve({ status: res.statusCode, body: data, range: res.headers.range }));
      }
    );
    req.setTimeout(CHUNK_TIMEOUT_MS, () => req.destroy(new Error(`chunk Drive expiré (${Math.round(CHUNK_TIMEOUT_MS / 1000)}s)`)));
    req.on("error", reject);
    req.end(chunk);
  });

// Ask the session where it stopped (PUT with empty body + Content-Range bytes */total).
// 308 + Range: bytes=0-N -> resume at N+1; 308 without Range -> nothing stored yet.
const querySessionOffset = (url, total) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "PUT", headers: { "Content-Length": 0, "Content-Range": `bytes */${total}` } },
      (res) => {
        res.resume();
        res.on("end", () => {
          const m = /bytes=0-(\d+)/.exec(res.headers.range || "");
          resolve(m ? Number(m[1]) + 1 : 0);
        });
      }
    );
    req.setTimeout(30_000, () => req.destroy(new Error("status Drive expiré")));
    req.on("error", reject);
    req.end();
  });

const uploadFile = async (filePath, fileName, folderId) => {
  const token = await getAccessToken();
  const buffer = await fsp.readFile(filePath);
  // 1) open a resumable session
  const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(buffer.length),
    },
    body: JSON.stringify({ name: fileName, parents: [folderId] }),
  });
  if (!init.ok) throw new Error(`Session Drive refusée (${init.status}): ${(await init.text()).slice(0, 200)}`);
  const sessionUrl = init.headers.get("location");
  if (!sessionUrl) throw new Error("Session Drive sans URL.");
  // 2) feed the session chunk by chunk, resuming from the server's offset on errors
  let offset = 0;
  let failures = 0;
  while (offset < buffer.length) {
    try {
      const res = await putChunk(sessionUrl, buffer, offset, buffer.length);
      if (res.status === 308) {
        const m = /bytes=0-(\d+)/.exec(res.range || "");
        offset = m ? Number(m[1]) + 1 : offset + UPLOAD_CHUNK;
        failures = 0;
      } else if (res.status >= 200 && res.status < 300) {
        try { return JSON.parse(res.body); } catch { return {}; }
      } else {
        throw new Error(`Drive upload ${res.status}: ${res.body.slice(0, 200)}`);
      }
    } catch (error) {
      failures += 1;
      if (failures > 3) throw error;
      // resync with what the server actually stored, then retry from there
      try { offset = await querySessionOffset(sessionUrl, buffer.length); } catch { /* keep offset */ }
    }
  }
  // All bytes sent but no 2xx seen (e.g. final 308 race): confirm completion.
  const fin = await putChunk(sessionUrl, buffer, Math.max(0, buffer.length - 1) - ((buffer.length - 1) % UPLOAD_CHUNK), buffer.length);
  if (fin.status >= 200 && fin.status < 300) { try { return JSON.parse(fin.body); } catch { return {}; } }
  throw new Error(`Drive upload incomplet (${fin.status})`);
};

// Upload a finished batch: one folder per import, all ready variants inside.
// Returns { folderId, folderLink, uploaded } — throws on a hard auth error.
export const uploadBatchToDrive = async ({ folderName, files, onProgress }) => {
  const folder = await createFolder(folderName);
  try { await shareAnyoneReader(folder.id); } catch { /* link still works for the account owner */ }
  let uploaded = 0;
  for (const file of files) {
    try {
      await uploadFile(file.path, file.name, folder.id);
      uploaded += 1;
      if (onProgress) onProgress(uploaded, files.length);
    } catch (error) {
      console.warn(`[drive] upload raté (${file.name}):`, error.message);
    }
  }
  return {
    folderId: folder.id,
    folderLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    uploaded,
    total: files.length,
  };
};
