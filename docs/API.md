# API

Development base URL:

```txt
http://localhost:8080
```

## Authentication

Device IDs are public metadata. Protected routes require the session token
issued only by a successful registration response:

```txt
Authorization: Bearer <session-token>
```

The old `X-Drop-Den-Device-Id` header and `device_id` download query are not
accepted.

Public routes:

```txt
GET  /api/health
GET  /api/config
POST /api/devices
```

All other API routes and `/ws` require authentication, except a download URL
that carries a valid short-lived download ticket.

## Devices

The first registration becomes host. Later registrations need the current PIN.
Names contain 1–64 characters.

```http
POST /api/devices
Content-Type: application/json

{"name":"Kitchen tablet","join_pin":"123456"}
```

The raw session token appears only in this response:

```json
{
  "id": "device-uuid",
  "name": "Kitchen tablet",
  "connected_at": "2026-07-23T10:00:00Z",
  "session_token": "high-entropy-secret"
}
```

Authenticated device lists contain only `id`, `name`, and `connected_at`.

```txt
GET    /api/devices
DELETE /api/devices/:id
```

The host may remove joined devices; a joined device may remove itself. Removal
revokes its session immediately.

## Config and host settings

```txt
GET /api/config
```

The route is public, but host-only fields (`is_host_device`, `join_pin`, and
desktop runtime paths) are populated only when a valid host bearer token is
present.

```txt
PATCH /api/host/settings
```

Host-only body:

```json
{"transfer_ttl_seconds":259200}
```

The allowed range is 3,600 seconds through 2,592,000 seconds.

## Transfers

```txt
GET    /api/transfers
POST   /api/transfers/upload
PATCH  /api/transfers/:id/accept
PATCH  /api/transfers/:id/reject
DELETE /api/transfers/:id
DELETE /api/transfers
```

Upload is multipart with one `file` and an optional `target_device_id`.
Sender identity always comes from the bearer token. The backend filters list
results and operations using the centralized transfer policy described in
[Security](SECURITY.md).

Serialized transfers never contain an absolute or relative storage path:

```json
{
  "id": "transfer-uuid",
  "filename": "photo.jpg",
  "mime_type": "image/jpeg",
  "size": 12345,
  "sender_device_id": "device-uuid",
  "target_device_id": null,
  "status": "available",
  "created_at": "2026-07-23T10:00:00Z",
  "expires_at": "2026-07-24T10:00:00Z"
}
```

Targeted transfers start `pending`. Only the recipient may accept or reject
them; they become downloadable after acceptance.

### Download tickets

Create a five-minute scoped ticket over an authenticated request:

```txt
POST /api/transfers/:id/download-ticket
POST /api/transfers/download-all-ticket
```

Response:

```json
{"ticket":"short-lived-secret","expires_at":"2026-07-23T10:05:00Z"}
```

Use it without a session token:

```txt
GET /api/transfers/:id/download?ticket=<ticket>
GET /api/transfers/download-all?ticket=<ticket>
```

Bearer authentication can also be used directly on the two GET routes.
Individual files and completed ZIP files are streamed. Unauthorized transfer
IDs return `404`.

### Desktop local paths

```txt
POST /api/transfers/upload-local-paths
```

This route is available only to the authenticated host over loopback while the
backend is in desktop mode:

```json
{
  "sender_device_id": "host-device-uuid",
  "target_device_id": null,
  "paths": ["/canonicalized/by/server"]
}
```

The sender field is compatibility metadata and must match the authenticated
host; it does not grant authority.

## Messages

```txt
GET    /api/messages
POST   /api/messages
DELETE /api/messages
```

Messages contain 1–2,000 characters. Clearing all messages is host-only.

## WebSocket

Connect to `/ws` with both WebSocket subprotocol values:

```txt
drop-den-v1
drop-den-auth.<session-token>
```

Missing, invalid, or revoked credentials are rejected. Event envelopes are:

```json
{"event_type":"transfer_created","payload":{}}
```

Transfer events are sent only to devices permitted to see the transfer and
never contain `stored_path` or session/download tokens.
