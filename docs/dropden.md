# Drop Den project overview

Drop Den is a local-only file and message transfer hub for nearby devices. One
host machine runs the backend and every participating device uses either the
browser interface, the desktop wrapper, or the Android wrapper.

This document contains the technical project overview formerly kept in the
root README. The root [README](../README.md) is intentionally written for
people evaluating or downloading Drop Den.

## Core model

Files and messages move through the host machine:

```txt
sender device -> Drop Den host -> receiving device
```

Drop Den does not currently use cloud storage, public sharing links, accounts,
or peer-to-peer WebRTC transfers.

## Current capabilities

### Devices and access

- The first registered device becomes the host device.
- Later devices join with a rotating six-digit PIN.
- Private API routes require a registered device identity.
- Host settings are available to the host on supported runtimes.
- Desktop runtime settings remain desktop-only.
- Host devices can remove joined devices and perform den-wide maintenance.

### Files and transfers

- Drag-and-drop and multi-file upload.
- Upload progress and a bounded upload queue.
- Broadcast or device-targeted transfers.
- Accept and reject flow for targeted transfers.
- Search, filtering, sorting, and bounded transfer-list scrolling.
- Image, video, and audio previews.
- Individual downloads and filtered ZIP downloads.
- Transfer expiry and automatic cleanup.
- Configurable desktop transfer storage.

### Messages and realtime updates

- Short local messages with sender identity.
- SQLite-backed message persistence and 24-hour expiry.
- WebSocket-driven query refresh and compact toast notifications.
- Host maintenance action for clearing messages.

### Desktop runtime

- Tauri wrapper with a bundled Rust backend sidecar.
- Frameless, rounded utility window with a custom titlebar.
- Compact responsive layout, collapsible panels, and status footer.
- Native drag-and-drop upload.
- Tray actions for opening Drop Den, copying URLs, and quitting.
- Runtime diagnostics, data-folder shortcuts, and reset actions.
- Linux desktop and RPM packaging workflow.

### Android runtime

- Native Android wrapper around the responsive web interface.
- Remembered, QR-scanned, and validated LAN host address.
- Single- and multi-file Android share intents.
- Bounded private on-device staging for safe `content://` URI handling,
  recovery, and retry.
- Adaptive Drop Den launcher icon.
- Soft-keyboard-aware WebView layout.

Android shares now use the invisible local staging layer and publish directly
to normal broadcast Transfers. The previous backend Shared Inbox remains only
as a temporary fallback and is scheduled for removal after physical-device
verification. See the [roadmap](ROADMAP.md) and [issue tracker](ISSUES.md).

## Repository layout

```txt
drop-den/
  android-wrapper/  Native Android wrapper
  backend/          Rust Axum backend
  docs/             Product, development, and operational documentation
  frontend/         React and TypeScript interface
  packaging/        System service packaging
  scripts/          Build, run, install, and desktop helper scripts
  src-tauri/        Tauri desktop wrapper
  storage/          Local development transfer storage
```

## Delivery modes

### Browser and server

The Rust backend serves the built React interface in packaged mode. Phones and
computers on the LAN connect through the host address.

```txt
Rust backend + React frontend + browser clients
```

This mode suits home servers, lightweight LAN installations, and technical
users who want a background service.

### Desktop

The Tauri application starts the backend as a sidecar and loads the same React
interface in a compact desktop window.

```txt
Tauri shell -> backend sidecar -> React interface
```

Desktop sidecar traffic uses loopback port `18080`. Other devices connect to
the LAN address advertised by the backend.

### Android

The Android app validates and remembers a Drop Den host, loads the responsive
interface in a WebView, and registers as an Android share target. Android files
are copied into private app storage before network upload so temporary URI
permissions, host outages, and process restarts can be handled safely.

## Local development

Run the backend:

```bash
cd backend
cargo run
```

Run the frontend:

```bash
cd frontend
yarn install
yarn dev
```

Open `http://localhost:5173` on the host or
`http://<host-lan-ip>:5173` from another LAN device.

For the full environment, testing, packaging, and Android instructions, use
the [development guide](DEVELOPMENT.md) and the
[Android wrapper guide](../android-wrapper/README.md).

## Packaged and service modes

Build and run the packaged server:

```bash
./scripts/build-packaged.sh
./scripts/run-packaged.sh
```

The default packaged URL is `http://localhost:8080`. Other devices use
`http://<host-lan-ip>:8080`.

Install the Linux background service:

```bash
sudo ./scripts/install-linux.sh
```

The uninstaller removes the service configuration and binary but deliberately
keeps saved data under `/var/lib/drop-den`.

## Documentation map

- [Architecture](ARCHITECTURE.md)
- [API](API.md)
- [Development](DEVELOPMENT.md)
- [Known issues and fixes](ISSUES.md)
- [Mobile integration findings](MOBILE_INTEGRATION.md)
- [Roadmap](ROADMAP.md)
- [Security](SECURITY.md)
- [Desktop troubleshooting](DESKTOP_TROUBLESHOOTING.md)
- [RPM release checklist](RPM_RELEASE_CHECKLIST.md)
