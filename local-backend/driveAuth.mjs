// One-time Google Drive sign-in for the Automatic Mode (personal Gmail accounts).
//
// A service account cannot upload bytes to a personal Drive (no storage quota),
// so we authorise the app as YOU, once, and store a refresh token. Run:
//
//   node local-backend/driveAuth.mjs
//
// Prereq: google-oauth-client.json next to this file — the JSON Google gives you
// when you create an OAuth client of type "Desktop app" (see DRIVE-SETUP.md).
//
// It opens a local loopback server, prints a Google consent URL, and on success
// writes google-oauth-token.json { refresh_token }. After that, uploads just work.

import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { oauthClientPath, oauthTokenPath, readOAuthClient } from "./driveUpload.mjs";

// Full drive scope so we can drop batch folders INSIDE your chosen parent folder
// (drive.file can't write into a folder you created by hand).
const SCOPE = "https://www.googleapis.com/auth/drive";

const client = readOAuthClient();
if (!client?.client_id || !client?.client_secret) {
  console.error(`\n❌ ${oauthClientPath} introuvable ou invalide.\n   Crée un client OAuth "Desktop app" (voir DRIVE-SETUP.md) et place le JSON ici.\n`);
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1`);
  if (!url.searchParams.get("code")) { res.writeHead(404).end(); return; }
  const code = url.searchParams.get("code");
  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: client.client_id,
        client_secret: client.client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const data = await resp.json();
    if (!data.refresh_token) throw new Error(JSON.stringify(data).slice(0, 300));
    fs.writeFileSync(oauthTokenPath, JSON.stringify({ refresh_token: data.refresh_token }, null, 2));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end("<h2>✅ Klimax connecté à Google Drive. Tu peux fermer cet onglet.</h2>");
    console.log(`\n✅ Connecté. Refresh token enregistré dans ${oauthTokenPath}\n`);
  } catch (e) {
    res.writeHead(500).end("Erreur: " + e.message);
    console.error("\n❌ Échec:", e.message, "\n");
  } finally {
    setTimeout(() => { server.close(); process.exit(0); }, 500);
  }
});

// FIXED port so the redirect URI is predictable: a "web" OAuth client requires it
// to be pre-registered (Authorized redirect URIs), and a "Desktop" client accepts
// any loopback anyway — so a fixed localhost port works for both. Override with
// KLIMAX_OAUTH_PORT if 42813 is taken.
const AUTH_PORT = Number(process.env.KLIMAX_OAUTH_PORT) || 42813;
let redirectUri;
server.listen(AUTH_PORT, "127.0.0.1", () => {
  const port = server.address().port;
  redirectUri = `http://localhost:${port}`;
  const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: crypto.randomBytes(8).toString("hex"),
  });
  console.log("\n👉 Ouvre cette URL dans ton navigateur et connecte-toi avec TON compte Google :\n\n" + authUrl + "\n");
  execFile("open", [authUrl]); // macOS: open it automatically (no shell — no interpolation)
});
