# API

Base URL during development:

```txt
http://localhost:8080
```

From another LAN device:

```txt
http://<host-lan-ip>:8080
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
```

Returns host-facing metadata such as app name, port, and join URL placeholder.

## Devices

```txt
GET /api/devices
POST /api/devices
```

Example request:

```json
{
  "name": "Samsung Phone"
}
```

Example response:

```json
{
  "id": "uuid",
  "name": "Samsung Phone",
  "connected_at": "2026-05-05T10:00:00Z"
}
```

## Transfers

```txt
GET /api/transfers
POST /api/transfers/upload
GET /api/transfers/:id/download
DELETE /api/transfers/:id
```

Upload uses multipart form data:

```txt
file=<binary>
sender_device_id=<uuid>
target_device_id=<optional uuid>
```

## Messages

```txt
GET /api/messages
POST /api/messages
```

Example request:

```json
{
  "sender_device_id": "uuid",
  "body": "Hello from my phone"
}
```

## WebSocket

```txt
GET /ws
```

Event types:

```txt
device_registered
transfer_created
transfer_deleted
message_created
```
