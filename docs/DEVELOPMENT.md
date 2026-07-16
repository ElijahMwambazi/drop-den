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
  src-tauri/      Tauri desktop wrapper
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

```bash
./scripts/build-packaged.sh
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

```bash
sudo ./scripts/install-linux.sh
```

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

Override paths:

```bash
DROP_DEN_DATA_DIR=/path/to/drop-den-data cargo run
DROP_DEN_DATABASE_PATH=/path/to/drop-den.sqlite cargo run
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

After recovery, remove `DROP_DEN_RESET_HOST=1` and restart again.

## Desktop wrapper mode

Drop Den includes a Tauri desktop wrapper.

Current desktop flow:

```txt
Tauri shell -> starts backend sidecar -> waits for /api/health -> opens React UI
```

Desktop sidecar mode uses a dedicated backend port:

```txt
http://127.0.0.1:18080
```

The desktop wrapper currently provides:

- compact frameless window
- custom titlebar
- titlebar frontend reload action
- tray menu
- backend sidecar startup/shutdown
- native desktop drag-and-drop upload
- Desktop Settings panel
- host-only transfer cleanup from Desktop Settings
- full desktop data reset with typed confirmation and an in-place backend restart
- desktop diagnostics view with backend health, runtime paths, and copyable report
- open data folder and open transfers folder actions
- configurable transfer storage folder persisted in `desktop-settings.json`
- collapsible side panels for connected devices, settings, and messages

Build the desktop app:

```bash
./scripts/build-desktop.sh
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

### Prepare Tauri sidecar

```bash
./scripts/prepare-tauri-sidecar.sh
```

This script detects the target triple, builds the backend release binary, copies it to `src-tauri/binaries/drop-den-backend-<target-triple>`, and marks it executable.

### Faster desktop development workflow

For most desktop work, use:

```bash
cd frontend
yarn desktop:dev:sidecar
```

This script should build the frontend once so `frontend/dist` exists for Tauri resource checks, prepare the backend sidecar binary, and start `tauri dev`.

If Tauri reports that `../frontend/dist` does not exist, run:

```bash
cd frontend
yarn build
yarn desktop:dev:sidecar
```

Avoid deleting `src-tauri/target` unless necessary. The first rebuild after deleting it is slow because Tauri, WebKit, and related Rust dependencies must be rebuilt.

### Build the Windows desktop installer

On 64-bit Windows with Node.js, Yarn, the stable MSVC Rust toolchain, and the
Microsoft C++ Build Tools installed, run from PowerShell:

```powershell
.\scripts\build-desktop-windows.ps1
```

This verifies the 64-bit Windows MSVC Rust host, builds the backend `.exe` for
`x86_64-pc-windows-msvc`, copies it to Tauri's target-triple sidecar name, and
creates an NSIS `-setup.exe` under
`src-tauri/target/release/bundle/nsis/`. The platform-specific
`src-tauri/tauri.windows.conf.json` overrides the Linux RPM target without
changing Linux packaging. See the
[Windows release checklist](./WINDOWS_RELEASE_CHECKLIST.md) before distribution.

### Build the macOS desktop installer

On macOS with Xcode Command Line Tools, Node.js, Yarn, and stable Rust installed,
run:

```bash
./scripts/build-desktop-macos.sh
```

The script detects the native Apple target, builds and copies the matching
backend sidecar, and creates a DMG under
`src-tauri/target/release/bundle/dmg/`. The manual GitHub Actions workflow builds
separate Apple Silicon and Intel artifacts. See the
[macOS release checklist](./MACOS_RELEASE_CHECKLIST.md) for real-device,
signing, and notarization requirements. Test builds default to ad-hoc signing;
set `APPLE_SIGNING_IDENTITY` to a Developer ID identity for release builds.

### Desktop dev data

For a clean dev desktop run:

```bash
pkill -f drop-den-backend
pkill -f drop-den-desktop
rm -rf /tmp/drop-den-dev
```

For installed desktop app data reset:

```bash
pkill -f drop-den-backend
pkill -f drop-den-desktop
rm -rf ~/.local/share/com.dropden.desktop ~/.local/share/com.dropden.app ~/.local/share/Drop\ Den
```

### Desktop host identity rule

Do not allow the host device to clear or switch away from its local identity directly.

If the current desktop device is host:

- disable `Clear local identity`
- disable `Switch device`
- use `Reset host` instead

Reason: if the backend still has a persisted `host_device_id` but the WebView loses the matching local device ID, the user can lose access to the host-only join PIN.

### Desktop folder shortcuts

Desktop Settings includes shortcuts for:

- Open data folder
- Open transfers folder

These are Tauri commands registered in `src-tauri/src/main.rs` and invoked from the frontend with:

```ts
invoke("open_data_folder");
invoke("open_transfers_folder");
```

Do not add these command names to `src-tauri/capabilities/default.json` as custom permissions. They are Rust invoke commands, not capability permission IDs.

### Tray actions

- Open Drop Den: shows and focuses the desktop window.
- Copy Join URL: copies the LAN join URL from `/api/config`.
- Copy Local URL: copies `http://127.0.0.1:18080`.
- Quit: stops the backend sidecar and exits the app.

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

Tauri shell check:

```bash
cd src-tauri
cargo check
```

Full desktop dev check:

```bash
cd frontend
yarn desktop:dev:sidecar
```

## Common issues

For the complete development and installed-RPM checklist, see [Desktop troubleshooting](./DESKTOP_TROUBLESHOOTING.md).

For release-candidate validation and publication, see the [RPM release checklist](./RPM_RELEASE_CHECKLIST.md).

For the Android PWA/native-wrapper decision and secure-LAN constraints, see [Mobile integration feasibility](./MOBILE_INTEGRATION.md).

### Port already in use

```bash
sudo lsof -i :8080
sudo ss -ltnp | grep :8080
```

### Desktop backend did not become ready

If Tauri fails with:

```txt
Drop Den backend did not become ready at http://127.0.0.1:18080
```

check for an existing backend process:

```bash
ss -ltnp | grep 18080
pkill -f drop-den-backend
pkill -f drop-den-desktop
```

Then reset dev data if needed:

```bash
rm -rf /tmp/drop-den-dev
```

### Tauri says `../frontend/dist` does not exist

Build the frontend once:

```bash
cd frontend
yarn build
yarn desktop:dev:sidecar
```

### Tauri says custom command permission is not found

Do not add custom invoke command names such as `open-data-folder` or `open-transfers-folder` to `src-tauri/capabilities/default.json`.

Register custom commands in Rust with:

```rust
.invoke_handler(tauri::generate_handler![
    open_data_folder,
    open_transfers_folder
])
```

Call them from the frontend with:

```ts
invoke("open_data_folder");
invoke("open_transfers_folder");
```

### Tauri says GLib/GObject/WebKit packages are missing

Install the Linux Tauri dependencies listed above.

### Tauri icon panic

Generate icons:

```bash
frontend/node_modules/.bin/tauri icon frontend/public/favicon.png
```
