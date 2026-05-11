# Drop Den

Drop Den is a local-only browser-based file and message transfer hub for nearby devices.

Run it on one host machine, open it from phones or PCs on the same local network, and move files, media, and text messages without accounts, cloud storage, or internet sharing.

## Current project status

Drop Den is now beyond the basic MVP scaffold. It currently supports:

- Device registration with a join PIN.
- First registered device as the host device.
- Host-only join PIN visibility.
- Host-only device removal.
- Host-only delete-all-transfers action.
- File upload with progress.
- Drag-and-drop and multiple file upload.
- File size limits.
- Transfer expiry and automatic cleanup.
- Image, video, and audio previews.
- Download individual files or all downloadable transfers as a ZIP.
- Device-targeted transfers.
- Transfer accept/reject flow.
- Local text messages with sender identity.
- Toast notifications and WebSocket refresh events.
- Registered-device header checks for private API routes.
- Rust serving the built React frontend in packaged mode.
- Local IP detection and better join URLs.
- Packaged-mode build/run scripts.

## Project shape

```txt
drop-den/
  backend/       Rust Axum backend
  frontend/      React + TypeScript browser UI
  docs/          Project documentation
  scripts/       Build and packaged-mode launcher scripts
  storage/       Local development transfer storage
```

## Core idea

Files and messages are not transferred directly between browsers. They move through the host machine:

```txt
sender browser -> host backend -> receiver browser
```

This keeps the system simple, local, and easy to reason about.

## Development mode

Run backend:

```bash
cd backend
cargo run
```

Run frontend:

```bash
cd frontend
npm install
npm run dev
```

Open locally:

```txt
http://localhost:5173
```

Open from another device on the same LAN:

```txt
http://<host-lan-ip>:5173
```

## Packaged mode

Build both frontend and backend:

```bash
./scripts/build-packaged.sh
```

Run Drop Den in packaged mode:

```bash
./scripts/run-packaged.sh
```

Default packaged URL:

```txt
http://localhost:8080
```

From another device:

```txt
http://<host-lan-ip>:8080
```

Optional custom port:

```bash
DROP_DEN_PORT=8081 ./scripts/run-packaged.sh
```

Optional friendly local name shown in the UI:

```bash
DROP_DEN_PUBLIC_NAME=drop-den.local ./scripts/run-packaged.sh
```

A friendly name such as `drop-den.local` requires mDNS, Avahi, or local DNS support on the host/network.

## Product direction

Drop Den should support two delivery modes:

### Drop Den Server

A browser/server version for technical users, home servers, and lightweight LAN use.

```txt
Rust backend + built React frontend + browser access
```

### Drop Den Desktop

A future desktop app version using Tauri.

```txt
Tauri shell + same React UI + backend sidecar
```

Both versions should share the same backend logic, frontend UI, storage model, and SQLite schema.

## Near-term direction

The next recommended implementation is SQLite persistence in the backend.

SQLite should persist:

- devices
- messages
- transfer metadata
- host device identity
- app settings
- join PIN or join PIN hash

Uploaded files should remain stored on disk.

## Documentation

See:

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Development](docs/DEVELOPMENT.md)
- [Security](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
