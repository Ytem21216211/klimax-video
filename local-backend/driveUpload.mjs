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

export const isDriveConfigured = () => Boolean(readKey()?.client_email && readKey()?.private_key);

const b64url = (input) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// OAuth2 access token via signed JWT (cached until ~5 min before expiry).
let tokenCache = { token: null, expiresAt: 0 };
const getAccessToken = async () => {
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

const httpsPut = (url, headers, bodyStream, contentLength) =>
  new Promise((resolve, reject) => {
    const req = https.request(url, { method: "PUT", headers: { ...headers, "Content-Length": contentLength } }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve({}); }
        } else {
          reject(new Error(`Drive upload ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on("error", reject);
    bodyStream.pipe(req);
  });

const uploadFile = async (filePath, fileName, folderId) => {
  const token = await getAccessToken();
  const { size } = await fsp.stat(filePath);
  // 1) open a resumable session
  const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify({ name: fileName, parents: [folderId] }),
  });
  if (!init.ok) throw new Error(`Session Drive refusée (${init.status}): ${(await init.text()).slice(0, 200)}`);
  const sessionUrl = init.headers.get("location");
  if (!sessionUrl) throw new Error("Session Drive sans URL.");
  // 2) stream the bytes
  return httpsPut(sessionUrl, { "Content-Type": "video/mp4" }, fs.createReadStream(filePath), size);
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
