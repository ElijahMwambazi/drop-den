# API

Base URL during development:

```txt
http://localhost:8080
```

From another LAN device in packaged mode:

```txt
http://<host-lan-ip>:8080
```

## Device authorization

Private den routes require a registered device identity.

Use this request header:

```txt
X-Drop-Den-Device-Id: <registered-device-id>
```

Browser download links may pass the current device ID as a query parameter:

```txt
GET /api/transfers/:id/download?device_id=<registered-device-id>
GET /api/transfers/download-all?device_id=<registered-device-id>
```

### Public routes

```txt
GET /api/health
GET /api/config
POST /api/devices
GET /ws
```

### Private routes

```txt
GET /api/devices
DELETE /api/devices/:id
GET /api/transfers
POST /api/transfers/upload
GET /api/transfers/download-all
GET /api/transfers/:id/download
PATCH /api/transfers/:id/accept
PATCH /api/transfers/:id/reject
DELETE /api/transfers/:id
DELETE /api/transfers
GET /api/messages
POST /api/messages
GET /api/inbox
POST /api/inbox
DELETE /api/inbox/:id
DELETE /api/inbox
```

## Health

```txt
GET /api/health
```

Response:

```json
{
  "status": "ok",
  "app": "drop-den"
}
```

## Config

```txt
GET /api/config
GET /api/config?device_id=<device-id>
```

Returns app metadata, join URL metadata, host-device status, limits, and optionally the join PIN.

The join PIN is only returned when the provided `device_id` belongs to the host device.

Example response:

```json
{
  "app_name": "Drop Den",
  "mode": "packaged",
  "port": 8080,
  "local_only": true,
  "public_name": "drop-den.local",
  "friendly_origin": "http://drop-den.local:8080",
  "lan_ip": "192.168.1.25",
  "lan_origin": "http://192.168.1.25:8080",
  "local_origin": "http://localhost:8080",
  "recommended_join_origin": "http://drop-den.local:8080",
  "has_host_device": true,
  "is_host_device": true,
  "join_pin": "123456",
  "max_upload_size_bytes": 262144000,
  "default_transfer_ttl_seconds": 86400
}
```

## Devices

```txt
GET /api/devices
POST /api/devices
DELETE /api/devices/:id
```

### Register first device

The first registered device becomes the host device and does not require a join PIN.

```json
{
  "name": "Elijah's Laptop"
}
```

### Register joined device

Later devices require the join PIN.

```json
{
  "name": "Samsung Phone",
  "join_pin": "123456"
}
```

### Device response

```json
{
  "id": "uuid",
  "name": "Samsung Phone",
  "connected_at": "2026-05-05T10:00:00Z"
}
```

### Remove device

```txt
DELETE /api/devices/:id
```

Only the host device can remove other devices. The host cannot remove itself through this action.

## Transfers

```txt
GET /api/transfers
POST /api/transfers/upload
GET /api/transfers/download-all
GET /api/transfers/:id/download
PATCH /api/transfers/:id/accept
PATCH /api/transfers/:id/reject
DELETE /api/transfers/:id
DELETE /api/transfers
```

### Upload

Upload uses multipart form data:

```txt
target_device_id=<optional uuid>
file=<binary>
```

The authenticated device header is used as the sender identity. The backend should not trust `sender_device_id` from multipart form data.

### Transfer object

```json
{
  "id": "uuid",
  "filename": "photo.jpg",
  "mime_type": "image/jpeg",
  "size": 12345,
  "sender_device_id": "uuid",
  "target_device_id": null,
  "status": "available",
  "stored_path": "../storage/transfers/uuid/photo.jpg",
  "created_at": "2026-05-05T10:00:00Z",
  "expires_at": "2026-05-06T10:00:00Z"
}
```

### Transfer statuses

```txt
available
pending
accepted
rejected
```

Broadcast transfers are immediately `available`.

Targeted transfers start as `pending` and become downloadable only after accept.
Only the target device can accept or reject a targeted transfer.

### Download

```txt
GET /api/transfers/:id/download?device_id=<registered-device-id>
```

Expired transfers return `410 Gone`.

Pending/rejected transfers return `403 Forbidden`.

Accepted targeted transfers can only be downloaded by their sender or target device.

### Download all as ZIP

```txt
GET /api/transfers/download-all?device_id=<registered-device-id>
```

Expired, non-downloadable, and targeted transfers belonging to other devices are excluded.

### Delete all transfers

```txt
DELETE /api/transfers
```

Deletes all transfer metadata and stored transfer files. Only the host device can use this route.

## Messages

```txt
GET /api/messages
POST /api/messages
```

Create message request:

```json
{
  "body": "Hello from my phone"
}
```

Message response:

```json
{
  "id": "uuid",
  "sender_device_id": "uuid",
  "body": "Hello from my phone",
  "created_at": "2026-05-05T10:00:00Z"
}
```

The authenticated device header is used as the sender identity.

## Shared inbox

> **Transitional API:** these routes remain in the current build but are
> scheduled for removal after Android shares publish reliably through
> `POST /api/transfers/upload`.

```txt
GET /api/inbox
POST /api/inbox
DELETE /api/inbox/:id
DELETE /api/inbox
```

The shared inbox is private to the registered device in
`X-Drop-Den-Device-Id`. Listing and clearing only affect that device. Deleting
an item owned by another device returns `404 Not Found`.

Upload one file per multipart request:

```txt
file=<binary>
```

Example item:

```json
{
  "id": "uuid",
  "filename": "photo.jpg",
  "mime_type": "image/jpeg",
  "size": 12345,
  "created_at": "2026-07-13T10:00:00Z",
  "expires_at": "2026-07-14T10:00:00Z"
}
```

Owner IDs and stored paths are intentionally omitted. Inbox files have no
public download route and do not become transfers until explicitly published.

Limits are 250 MiB per item, 50 retained items per device, 500 MiB total inbox
storage, and 24-hour retention. Limit errors use a JSON `code` and `message`.

## WebSocket

```txt
GET /ws
```

WebSocket events are used to refresh state and show notifications.

Event types:

```txt
device_registered
device_removed
transfer_created
transfer_updated
transfer_deleted
message_created
```

Example event:

```json
{
  "event_type": "transfer_created",
  "payload": {}
}
```
