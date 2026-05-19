# Development

## Requirements

- Rust stable
- Node.js LTS
- Yarn
- Cargo
- Tauri Linux system dependencies when working on the desktop wrapper

## Project shape

```txt
drop-den/
  backend/       Rust Axum backend
  frontend/      React + TypeScript browser UI
  docs/          Project documentation
  scripts/       Build, run, installer, and desktop helper scripts
  packaging/     System service files
  src-tauri/      Optional Tauri desktop wrapper
  storage/       Local development transfer storage
```

## Development mode

Development mode runs the backend and frontend separately.

### Run backend

```bash
cd backend
cargo run
```

Backend runs on:

```txt
http://localhost:8080
```

It also listens on all local network interfaces, so nearby devices can reach it through the host LAN IP.

### Run frontend

```bash
cd frontend
yarn install
yarn dev
```

Frontend dev server runs on:

```txt
http://localhost:5173
```

From another device on the same local network, open:

```txt
http://<pc-lan-ip>:5173
```

During development, Vite proxies `/api` and `/ws` to the Rust backend.

## Packaged mode

Packaged mode builds the React frontend and serves it from the Rust backend.

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

From another device on the same local network:

```txt
http://<pc-lan-ip>:8080
```

Optional custom port:

```bash
DROP_DEN_PORT=8081 ./scripts/run-packaged.sh
```

Optional friendly local name shown in the UI:

```bash
DROP_DEN_PUBLIC_NAME=drop-den.local ./scripts/run-packaged.sh
```

## Linux service mode

Drop Den can be installed as a background systemd service on Linux.

Install:

```bash
sudo ./scripts/install-linux.sh
```

If `cargo` is not found when running under `sudo`, make sure your normal user has a Rust default toolchain:

```bash
rustup default stable
```

Then rerun:

```bash
sudo ./scripts/install-linux.sh
```

The installer:

- builds the frontend
- builds the backend release binary
- installs the binary to `/usr/local/bin/drop-den`
- installs frontend assets to `/usr/local/share/drop-den/frontend/dist`
- creates `/etc/drop-den/drop-den.env`
- creates `/var/lib/drop-den`
- installs `drop-den.service`
- enables and starts the service

Default service environment:

```txt
DROP_DEN_MODE=packaged
DROP_DEN_PORT=8080
DROP_DEN_PUBLIC_NAME=drop-den.local
DROP_DEN_DATA_DIR=/var/lib/drop-den
DROP_DEN_DATABASE_PATH=/var/lib/drop-den/drop-den.sqlite
DROP_DEN_STORAGE_DIR=/var/lib/drop-den/transfers
DROP_DEN_FRONTEND_DIST=/usr/local/share/drop-den/frontend/dist
```

Manage service:

```bash
systemctl status drop-den
sudo systemctl restart drop-den
sudo systemctl stop drop-den
journalctl -u drop-den -f
```

Uninstall:

```bash
sudo ./scripts/uninstall-linux.sh
```

Saved data is kept at:

```txt
/var/lib/drop-den
```

To remove saved data manually:

```bash
sudo rm -rf /var/lib/drop-den
```

## Canonical LAN URL note

Use one canonical URL for normal app access:

```txt
http://<pc-lan-ip>:8080
```

Avoid switching between these during normal use:

```txt
http://localhost:8080
http://drop-den.local:8080
http://<pc-lan-ip>:8080
```

Browsers keep separate `localStorage` for each origin, so switching URLs can make the same browser appear as a different device.

## Backend persistence

The backend persists:

- registered devices
- host device identity
- join PIN hash
- app settings
- messages
- transfer metadata

Messages expire after 24 hours and are removed by the cleanup job.

Transfers expire after the configured transfer lifetime and are removed by the cleanup job. On startup, non-expired transfer metadata is restored from SQLite. Expired transfers and records whose files are missing are removed from SQLite.

Uploaded files remain stored on disk under the configured transfer storage directory.

Default development database path:

```txt
../storage/drop-den.sqlite
```

Default development transfer storage path:

```txt
../storage/transfers
```

Override paths:

```bash
DROP_DEN_DATA_DIR=/path/to/drop-den-data cargo run
```

```bash
DROP_DEN_DATABASE_PATH=/path/to/drop-den.sqlite cargo run
```

```bash
DROP_DEN_STORAGE_DIR=/path/to/transfers cargo run
```

## Host recovery

If the host browser identity is lost, clear the persisted host device and let the next registered browser become host.

Development:

```bash
DROP_DEN_RESET_HOST=1 cargo run
```

Linux service mode:

```bash
sudo nano /etc/drop-den/drop-den.env
```

Add temporarily:

```txt
DROP_DEN_RESET_HOST=1
```

Restart:

```bash
sudo systemctl restart drop-den
```

Open the canonical LAN URL and register the browser that should become host.

After recovery, remove `DROP_DEN_RESET_HOST=1` from `/etc/drop-den/drop-den.env` and restart the service again.

This keeps existing devices, messages, transfers, and app data. It only clears the persisted `host_device_id`.

## Desktop wrapper mode

Drop Den has an optional Tauri desktop wrapper.

Current desktop direction:

```txt
Tauri shell -> starts backend sidecar -> waits for /api/health -> opens React UI
```

Desktop sidecar mode uses a dedicated backend port:

```txt
http://127.0.0.1:18080
```

### Linux Tauri dependencies

On Fedora, install the required Tauri/WebKit/GTK development packages:

```bash
sudo dnf install \
  glib2-devel \
  gobject-introspection-devel \
  gtk3-devel \
  webkit2gtk4.1-devel \
  libsoup3-devel \
  javascriptcoregtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

If `webkit2gtk4.1-devel` is unavailable, try:

```bash
sudo dnf install webkit2gtk4.0-devel javascriptcoregtk4.0-devel libsoup-devel
```

Verify GLib is visible:

```bash
pkg-config --modversion glib-2.0
pkg-config --modversion gobject-2.0
```

### Prepare Tauri sidecar

Tauri expects the backend sidecar binary to exist under `src-tauri/binaries/` with the current Rust target triple in the filename.

Prepare it with:

```bash
./scripts/prepare-tauri-sidecar.sh
```

This script:

- detects the current Rust target triple
- builds the backend release binary
- copies it to `src-tauri/binaries/drop-den-backend-<target-triple>`
- marks it executable

On Linux x86_64, the sidecar path is:

```txt
src-tauri/binaries/drop-den-backend-x86_64-unknown-linux-gnu
```

### Run desktop dev mode

From the project root:

```bash
frontend/node_modules/.bin/tauri dev
```

Or from the frontend folder, if package scripts are configured:

```bash
cd frontend
yarn desktop:dev:sidecar
```

In desktop sidecar mode, Tauri:

- starts the backend sidecar
- sets desktop-specific data/storage paths
- waits for `/api/health`
- opens the React UI in a desktop window

## Build checks

Frontend:

```bash
cd frontend
yarn build
```

Backend:

```bash
cd backend
cargo check
```

Backend release build:

```bash
cd backend
cargo build --release
```

Tauri shell check:

```bash
cd src-tauri
cargo check
```

Full desktop dev check:

```bash
./scripts/prepare-tauri-sidecar.sh
frontend/node_modules/.bin/tauri dev
```

## Common issues

### Port already in use

```bash
sudo lsof -i :8080
sudo ss -ltnp | grep :8080
```

Then stop it or choose a different port:

```bash
DROP_DEN_PORT=8081 ./scripts/run-packaged.sh
```

### Permission denied on port 80

Use port `8080` for now:

```bash
DROP_DEN_PORT=8080 ./scripts/run-packaged.sh
```

### Phone can open LAN IP but not `drop-den.local`

Use:

```txt
http://<pc-lan-ip>:8080
```

or configure Avahi/local DNS.

### Tauri says sidecar binary does not exist

Prepare the sidecar:

```bash
./scripts/prepare-tauri-sidecar.sh
```

Then rerun:

```bash
frontend/node_modules/.bin/tauri dev
```

### Tauri says GLib/GObject/WebKit packages are missing

Install the Linux Tauri dependencies listed above.

### Tauri icon panic

Generate icons:

```bash
frontend/node_modules/.bin/tauri icon frontend/public/favicon.png
```

Or at minimum make sure this exists:

```txt
src-tauri/icons/icon.png
```
