# Architecture

Drop Den is a local-first hub. The Rust/Axum host owns persistence, policy, and
file storage; React, Tauri, Android, and ordinary browsers are clients of the
same API.

```txt
Browser ───────┐
Tauri host UI ─┼─ HTTP/WebSocket ─> Axum host ─> SQLite + transfer storage
Android ───────┘
```

Files move through the host rather than directly between clients.

## Trust boundaries

### Public onboarding

`GET /api/config` exposes non-secret discovery metadata. `POST /api/devices`
creates the initial host or verifies the rotating join PIN. Successful pairing
returns a public device ID plus a separate raw session token.

### Authenticated den

Protected HTTP requests use bearer session tokens. The backend stores token
digests and maps them to devices. Device removal revokes that mapping.

WebSockets carry the session token in `Sec-WebSocket-Protocol`, not the URL.
The event broker attaches an audience to each event and sends targeted-transfer
events only to the host, sender, and recipient.

The frontend may still filter and sort for presentation, but it never defines
the security boundary. `backend/src/transfer_policy.rs` is the reusable
authority for list, download, review, delete, and event visibility.

### Downloads

Clients first request a five-minute, resource-scoped download ticket using
their bearer token. This permits normal browser links, media elements, and
Android Download Manager without putting the long-lived session token in a
URL. Individual files stream from disk. ZIP creation reads one source file at
a time into a temporary archive, then streams and removes it.

### Desktop privilege

The Tauri shell starts the same backend as a sidecar on `127.0.0.1:18080`.
Native drag/drop uses `/api/transfers/upload-local-paths`, which additionally
requires desktop mode, a loopback peer, and the host session. The server
canonicalizes each path. LAN clients cannot call this capability or retrieve
desktop runtime paths.

## Persistence

SQLite stores:

- public device metadata and hashed session tokens;
- host identity and settings;
- Argon2 join-PIN hash;
- message metadata;
- transfer metadata, including backend-only stored paths.

The raw join PIN exists only in runtime memory. The raw session token exists
only in the successful pairing response and client storage.

Files remain under the configured transfer directory. Startup removes expired
or missing metadata and orphaned storage. Migration 005 invalidates legacy
device-ID credentials and requires re-pairing.

## Delivery variants

- Server/package mode serves the built React application and LAN API.
- Tauri desktop mode starts the backend sidecar and compact desktop UI.
- Android loads the LAN UI in a WebView and stages `content://` shares in
  bounded private app storage before authenticated upload.

All variants assume a trusted LAN and host. They do not provide internet-grade
transport security.
