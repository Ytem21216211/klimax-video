# Klimax Local Supabase Shim

A local, self-hosted replacement for the Supabase service that the front-end
talks to. Implements the subset of the Supabase API the Klimax app actually
uses, backed by a real PostgreSQL database and the local filesystem.

## Why

By default, the front-end connects to Supabase for auth, database, and file
storage. For local development (and so the app works without an internet
connection or a Supabase project), this shim exposes the same API on
`http://127.0.0.1:54321` against a local Postgres database.

## What's implemented

### Auth (GoTrue-style)
- `POST /auth/v1/signup` — email + password registration. Returns user + session JWT.
- `POST /auth/v1/token?grant_type=password` — sign in.
- `POST /auth/v1/token?grant_type=refresh_token` — refresh.
- `POST /auth/v1/logout` — invalidates the session.
- `GET  /auth/v1/user` (Bearer) — returns the current user.
- `PUT  /auth/v1/user` (Bearer) — updates email/password/metadata.

Sessions are stored in the `auth.sessions` table. Access tokens are HS256 JWTs
signed with a local secret. Logout deletes the session row, so the JWT can no
longer be used.

### Database (PostgREST-style)
- `GET    /rest/v1/{table}` — list rows.
  - Filters: `?col=eq.value`, `?col=in.(a,b)`, `?col=is.null`, etc.
  - Shape: `?select=col1,col2` or `?select=*`.
  - Order: `?order=col.asc` or `?order=col.desc` (comma-separated for multi).
  - Pagination: `?limit=N&offset=N`.
  - Single object: `Accept: application/vnd.pgrst.object+json`.
- `POST   /rest/v1/{table}` — insert (set `Prefer: return=representation`).
- `PATCH  /rest/v1/{table}?col=eq.value` — update.
- `DELETE /rest/v1/{table}?col=eq.value` — delete.

All public tables from the upstream schema are created on first run. See
`init.sql` for the full DDL.

### Storage (Supabase Storage-style)
- `POST   /storage/v1/object/{bucket}/{path}` — multipart upload (`file` field)
  or raw body. Header `X-Upsert: true` to overwrite.
- `PUT    /storage/v1/object/{bucket}/{path}` — same as POST.
- `GET    /storage/v1/object/{bucket}/{path}` — download (requires auth).
- `GET    /storage/v1/object/public/{bucket}/{path}` — download from a public bucket.
- `POST   /storage/v1/object/sign/{bucket}/{path}` — body `{expiresIn: N}` → returns `{signedURL}`.
- `GET    /storage/v1/object/sign/{bucket}/{path}?token=...` — download via signed URL.
- `POST   /storage/v1/object/list/{bucket}` — body `{prefix, limit}`.
- `DELETE /storage/v1/object/{bucket}/{path}` or `POST .../delete` with body `{prefixes: [...]}`.

Buckets: `video-clips`, `voiceovers`, `exports` (public), `custom_fonts`. Files
land in `local-data/supabase-storage/{bucket}/{path}`.

## Setup

The shim auto-starts with `npm run backend` (mounted from
`local-backend/server.mjs`). Disable with `KLIMAX_SUPABASE_ENABLED=0`.

The Postgres database `klimax_local_supabase` is created on first run via
`init.sql` (idempotent: `CREATE TABLE IF NOT EXISTS`).

Requires a local Postgres on `127.0.0.1:5432` with a user that can create
databases. The default user is `kzrr`; override with
`KLIMAX_SUPABASE_USER`/`KLIMAX_SUPABASE_PASSWORD`/`KLIMAX_SUPABASE_HOST`.

The front-end is pointed at the shim via the `.env` file:
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=klimax-local-anon-key
```

## Files

- `server.mjs` — Express app: auth, REST, storage. Auto-listens on port 54321.
- `init.sql` — schema (run automatically on first start).
