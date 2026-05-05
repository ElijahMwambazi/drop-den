# Architecture

Drop Den is a local-only transfer hub.

```txt
Phone A  ──┐
Laptop   ──┼──> Host PC running Drop Den ──> Browser UI
Phone B  ──┘
```

The host device runs the Rust backend. Every device, including the host itself, uses the browser UI.

## Core idea

Files and messages are not transferred directly between browsers in the MVP. They move through the host backend:

```txt
Sender browser -> Rust backend -> Receiver browser
```

This makes the app easier to build, test, and reason about.

## Components

### Rust backend

Responsibilities:

- Serve API routes.
- Serve the React app in production.
- Register browser devices.
- Store uploaded files in local storage.
- Expose download endpoints.
- Store local text messages.
- Broadcast WebSocket events.
- Clean up expired transfers later.

### React frontend

Responsibilities:

- Display the host URL and QR code.
- Register the current browser as a device.
- Send files.
- Send text messages.
- Show connected devices.
- Show available transfers.
- Show realtime updates from the backend.

## Recommended data flow

### File upload

```txt
POST /api/transfers/upload
```

The sender uploads a multipart file to the backend. The backend stores it and broadcasts a `transfer_created` event.

### File download

```txt
GET /api/transfers/:id/download
```

The receiver downloads the file from the host backend.

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

## Local-only assumptions

- Devices are on the same LAN/Wi-Fi.
- The host machine is reachable by IP address.
- The server binds to `0.0.0.0:8080` during development.
- The UI should warn users not to expose the service publicly.
