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

const createFolder = async (name) =>
  driveFetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });

// Anyone with the link can view — so the UI link works without a Google login.
const shareAnyoneReader = async (fileId) =>
  driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

// Multipart upload (metadata + bytes in one request) — fine for short-form videos.
const uploadFile = async (filePath, fileName, folderId) => {
  const boundary = `klimax-${crypto.randomBytes(8).toString("hex")}`;
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const fileBytes = await fsp.readFile(filePath);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
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
