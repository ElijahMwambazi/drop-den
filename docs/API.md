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

### Update host settings

```txt
PATCH /api/host/settings
X-Drop-Den-Device-Id: <host-device-id>
```

Updates den-wide settings. This route is restricted to the current host device.

```json
{
  "transfer_ttl_seconds": 259200
}
```

The transfer lifetime must be between 3,600 seconds (1 hour) and 2,592,000
seconds (30 days). It applies to new uploads only; existing transfers keep the
expiry timestamp assigned when they were created.

Response:

```json
{
  "transfer_ttl_seconds": 259200
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
