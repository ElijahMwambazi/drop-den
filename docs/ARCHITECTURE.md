# Architecture

Drop Den is a local-only transfer hub.

```txt
Phone A  ──┐
Laptop   ──┼──> Host machine running Drop Den ──> Browser UI
Phone B  ──┘
```

The host machine runs the Rust backend. Every device, including the host itself, uses the browser UI.

## Core idea

Files and messages are not transferred directly between browsers in the current architecture. They move through the host backend:

```txt
Sender browser -> Rust backend -> Receiver browser
```

This makes the app easier to build, test, secure, and package.

## Components

### Rust backend

Responsibilities:

- Serve API routes.
- Serve the built React app in packaged mode.
- Register browser devices.
- Track the host device.
- Validate join PINs.
- Enforce registered-device access for private API routes.
- Store uploaded files in local storage.
- Store transfer metadata.
- Expose individual and ZIP download endpoints.
- Store local text messages.
- Broadcast WebSocket events.
- Clean up expired transfers.
- Detect LAN/friendly join URLs.

### React frontend

Responsibilities:

- Display the join URL and QR code.
- Show host-only join PIN controls.
- Register the current browser as a device.
- Hide private app sections until joined.
- Send files.
- Send text messages.
- Show connected devices.
- Allow the host to remove joined devices.
- Show available transfers.
- Support media previews.
- Support transfer targeting and accept/reject.
- Show realtime updates and toast notifications.

### Packaged mode

In packaged mode, the Rust backend serves the built frontend from:

```txt
frontend/dist
```

Users access the UI through the same Rust server:

```txt
http://localhost:8080
http://<host-lan-ip>:8080
```

A friendly local name can be displayed if configured:

```txt
http://drop-den.local:8080
```

## Recommended data flow

### Join flow

```txt
GET /api/config
POST /api/devices
```

The first registered device becomes the host device. Later devices must provide the join PIN.

### File upload

```txt
POST /api/transfers/upload
```

The sender uploads a multipart file to the backend. The backend stores it, creates transfer metadata, and broadcasts a `transfer_created` event.

### File download

```txt
GET /api/transfers/:id/download?device_id=<device-id>
```

The receiver downloads the file from the host backend. Expired or unaccepted targeted transfers are not downloadable.

### Download all

```txt
GET /api/transfers/download-all?device_id=<device-id>
```

The backend generates a ZIP of downloadable, non-expired transfers.

### Text message

```txt
POST /api/messages
```

The backend stores the message and broadcasts a `message_created` event.

### Realtime events

```txt
GET /ws
```

WebSockets are used for notifications and state refresh triggers, not for large file transfer.

## Current state model

SQLite setup is present and migrations run at backend startup.

The backend now persists:

- registered devices
- host device identity
- app settings
- join PIN
- messages

Messages expire after 24 hours and are removed by the cleanup job.

Current route behavior still uses in-memory state for:

- transfer metadata

Uploaded files are stored on disk.

The next persistence work is to wire transfer metadata into SQLite.

## Future persistence model

SQLite should move core metadata out of memory and into durable storage.

SQLite should persist:

- devices
- messages
- transfers
- settings
- host device identity
- join PIN hash or generated join secret

Files should remain on disk in a configured storage directory.

## Delivery variants

### Drop Den Server

Runs as a backend/server process and serves the browser UI.

Best for:

- Linux hosts
- home servers
- technical users
- LAN utility use

### Drop Den Desktop

Future Tauri wrapper around the same backend and frontend.

Recommended approach:

```txt
Tauri shell starts backend sidecar -> UI connects to local backend
```

This keeps Tauri optional while preserving one backend architecture.

## Local-only assumptions

- Devices are on the same LAN/Wi-Fi.
- The host machine is reachable by IP address or local name.
- The server binds to `0.0.0.0` for LAN access.
- Users should not expose the service to the public internet.
