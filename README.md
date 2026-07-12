# Drop Den

Drop Den is a local-only browser and desktop file/message transfer hub for nearby devices.

Run it on one host machine, open it from phones or PCs on the same local network, and move files, media, and text messages without accounts, cloud storage, or internet sharing.

## Current project status

Drop Den is beyond the basic MVP scaffold. It currently supports:

- Device registration with a join PIN.
- First registered device as the host device.
- Host-only join PIN visibility.
- Join PIN hashing and rotation after successful device joins.
- Host-only device removal.
- Host-only delete-all-transfers action.
- File upload with progress.
- Drag-and-drop and multiple file upload.
- Native desktop drag-and-drop upload in Tauri mode.
- File size limits.
- Transfer expiry and automatic cleanup.
- Image, video, and audio previews.
- Download individual files or all downloadable transfers as a ZIP.
- Device-targeted transfers.
- Transfer accept/reject flow.
- Transfer search, filtering, and sorting.
- Local text messages with sender identity.
- Message persistence and 24-hour message expiry.
- Clear messages maintenance action.
- Toast notifications and WebSocket refresh events.
- Registered-device header checks for private API routes.
- SQLite persistence for devices, messages, transfer metadata, app settings, and host identity.
- Rust serving the built React frontend in packaged mode.
- Local IP detection and better join URLs.
- Packaged-mode build/run scripts.
- Linux systemd service installer.
- Tauri desktop wrapper with backend sidecar.
- Compact frameless desktop window with custom titlebar.
- Desktop titlebar frontend reload action.
- Desktop tray actions for opening Drop Den, copying URLs, and quitting.
- Desktop Settings panel with runtime paths and maintenance actions.
- Host-only transfer cleanup from Desktop Settings.
- Full desktop data reset with typed confirmation.
- Open data folder and open transfers folder shortcuts.
- Configurable desktop transfer storage folder with writable-path validation.
- Collapsible desktop side panels for connected devices, settings, and messages.
- Host-lockout protection for desktop identity actions.

## Project shape

```txt
drop-den/
  backend/       Rust Axum backend
  frontend/      React + TypeScript browser UI
  docs/          Project documentation
  scripts/       Build, run, installer, and desktop helper scripts
  packaging/     System service files
  src-tauri/      Tauri desktop wrapper
  storage/       Local development transfer storage
```

## Core idea

Files and messages are not transferred directly between browsers. They move through the host machine:

```txt
sender browser -> host backend -> receiver browser
```

This keeps the system simple, local, and easy to reason about.

## Delivery modes

Drop Den currently supports two delivery modes.

### Drop Den Server

A browser/server version for technical users, home servers, and lightweight LAN use.

```txt
Rust backend + built React frontend + browser access
```

Server mode can run in development mode, packaged mode, or as a Linux systemd service.

### Drop Den Desktop

A Tauri desktop app that starts the Rust backend as a sidecar and loads the same React UI.

```txt
Tauri shell -> backend sidecar -> React UI
```

Desktop mode currently includes:

- Dedicated backend port `18080`.
- Compact frameless desktop window.
- Custom titlebar and tray menu.
- Open window, copy join URL, copy local URL, and quit tray actions.
- Native desktop drag-and-drop upload.
- Desktop Settings panel for runtime paths and maintenance actions.
- Open data folder and open transfers folder shortcuts.
- A configurable transfer storage folder; the database remains in managed app data.
- Collapsible side panels for connected devices, desktop settings, and messages.
- Host-lockout protection for local identity switching.

## Development mode

Run backend:

```bash
cd backend
cargo run
```

Run frontend:

```bash
cd frontend
yarn install
yarn dev
```

Open locally:

```txt
http://localhost:5173
```

Open from another device on the same LAN:

```txt
http://<host-lan-ip>:5173
```

## Desktop development mode

For Tauri desktop testing:

```bash
cd frontend
yarn desktop:dev:sidecar
```

This should build the frontend, prepare the backend sidecar, and start Tauri dev mode.

Desktop mode talks to:

```txt
http://127.0.0.1:18080
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

## Linux background service

Install Drop Den as a background systemd service:

```bash
sudo ./scripts/install-linux.sh
```

If `cargo` is not found when running under `sudo`, first make sure your normal user has a Rust default toolchain:

```bash
rustup default stable
```

Then rerun:

```bash
sudo ./scripts/install-linux.sh
```

Check service status:

```bash
systemctl status drop-den
```

View logs:

```bash
journalctl -u drop-den -f
```

Default service URL:

```txt
http://localhost:8080
```

From another device on the same local network:

```txt
http://<host-lan-ip>:8080
```

Uninstall service:

```bash
sudo ./scripts/uninstall-linux.sh
```

The uninstaller removes the service, config, and binary. It does not delete saved data under:

```txt
/var/lib/drop-den
```

To remove saved data manually:

```bash
sudo rm -rf /var/lib/drop-den
```

## Documentation

See:

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Development](docs/DEVELOPMENT.md)
- [Security](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Codex Handoff](docs/CODEX_HANDOFF.md)# Drop Den

Drop Den is a local-only browser and desktop file/message transfer hub for nearby devices.

Run it on one host machine, open it from phones or PCs on the same local network, and move files, media, and text messages without accounts, cloud storage, or internet sharing.

## Current project status

Drop Den is beyond the basic MVP scaffold. It currently supports:

- Device registration with a join PIN.
- First registered device as the host device.
- Host-only join PIN visibility.
- Join PIN hashing and rotation after successful device joins.
- Host-only device removal.
- Host-only delete-all-transfers action.
- File upload with progress.
- Drag-and-drop and multiple file upload.
- Native desktop drag-and-drop upload in Tauri mode.
- File size limits.
- Transfer expiry and automatic cleanup.
- Image, video, and audio previews.
- Download individual files or all downloadable transfers as a ZIP.
- Device-targeted transfers.
- Transfer accept/reject flow.
- Transfer search, filtering, and sorting.
- Local text messages with sender identity.
- Message persistence and 24-hour message expiry.
- Clear messages maintenance action.
- Toast notifications and WebSocket refresh events.
- Registered-device header checks for private API routes.
- SQLite persistence for devices, messages, transfer metadata, app settings, and host identity.
- Rust serving the built React frontend in packaged mode.
- Local IP detection and better join URLs.
- Packaged-mode build/run scripts.
- Linux systemd service installer.
- Tauri desktop wrapper with backend sidecar.
- Compact frameless desktop window with custom titlebar.
- Desktop tray actions for opening Drop Den, copying URLs, and quitting.
- Desktop Settings panel with runtime paths and maintenance actions.
- Open data folder and open transfers folder shortcuts.
- Collapsible desktop side panels for connected devices, settings, and messages.
- Host-lockout protection for desktop identity actions.

## Project shape

```txt
drop-den/
  backend/       Rust Axum backend
  frontend/      React + TypeScript browser UI
  docs/          Project documentation
  scripts/       Build, run, installer, and desktop helper scripts
  packaging/     System service files
  src-tauri/      Tauri desktop wrapper
  storage/       Local development transfer storage
```

## Core idea

Files and messages are not transferred directly between browsers. They move through the host machine:

```txt
sender browser -> host backend -> receiver browser
```

This keeps the system simple, local, and easy to reason about.

## Delivery modes

Drop Den currently supports two delivery modes.

### Drop Den Server

A browser/server version for technical users, home servers, and lightweight LAN use.

```txt
Rust backend + built React frontend + browser access
```

Server mode can run in development mode, packaged mode, or as a Linux systemd service.

### Drop Den Desktop

A Tauri desktop app that starts the Rust backend as a sidecar and loads the same React UI.

```txt
Tauri shell -> backend sidecar -> React UI
```

Desktop mode currently includes:

- Dedicated backend port `18080`.
- Compact frameless desktop window.
- Custom titlebar and tray menu.
- Open window, copy join URL, copy local URL, and quit tray actions.
- Native desktop drag-and-drop upload.
- Desktop Settings panel for runtime paths and maintenance actions.
- Open data folder and open transfers folder shortcuts.
- Collapsible side panels for connected devices, desktop settings, and messages.
- Host-lockout protection for local identity switching.

## Development mode

Run backend:

```bash
cd backend
cargo run
```

Run frontend:

```bash
cd frontend
yarn install
yarn dev
```

Open locally:

```txt
http://localhost:5173
```

Open from another device on the same LAN:

```txt
http://<host-lan-ip>:5173
```

## Desktop development mode

For Tauri desktop testing:

```bash
cd frontend
yarn desktop:dev:sidecar
```

This should build the frontend, prepare the backend sidecar, and start Tauri dev mode.

Desktop mode talks to:

```txt
http://127.0.0.1:18080
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

## Linux background service

Install Drop Den as a background systemd service:

```bash
sudo ./scripts/install-linux.sh
```

If `cargo` is not found when running under `sudo`, first make sure your normal user has a Rust default toolchain:

```bash
rustup default stable
```

Then rerun:

```bash
sudo ./scripts/install-linux.sh
```

Check service status:

```bash
systemctl status drop-den
```

View logs:

```bash
journalctl -u drop-den -f
```

Default service URL:

```txt
http://localhost:8080
```

From another device on the same local network:

```txt
http://<host-lan-ip>:8080
```

Uninstall service:

```bash
sudo ./scripts/uninstall-linux.sh
```

The uninstaller removes the service, config, and binary. It does not delete saved data under:

```txt
/var/lib/drop-den
```

To remove saved data manually:

```bash
sudo rm -rf /var/lib/drop-den
```

## Documentation

See:

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Development](docs/DEVELOPMENT.md)
- [Security](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Codex Handoff](docs/CODEX_HANDOFF.md)
