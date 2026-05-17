# Development

## Requirements

- Rust stable
- Node.js LTS
- npm, pnpm, or yarn

## Project shape

```txt
drop-den/
  backend/       Rust Axum backend
  frontend/      React + TypeScript browser UI
  docs/          Project documentation
  scripts/       Build and packaged-mode launcher scripts
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
npm install
npm run dev
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

A friendly name such as `drop-den.local` only works if the host/network can resolve that name through mDNS, Avahi, or local DNS. The LAN IP fallback should still work.

## Packaged mode environment variables

```txt
DROP_DEN_MODE=packaged
DROP_DEN_PORT=8080
DROP_DEN_PUBLIC_NAME=drop-den.local
```

Examples:

```bash
DROP_DEN_MODE=packaged DROP_DEN_PORT=8080 DROP_DEN_PUBLIC_NAME=drop-den.local ./scripts/run-packaged.sh
```

```bash
DROP_DEN_MODE=packaged DROP_DEN_PORT=8081 DROP_DEN_PUBLIC_NAME=drop-den.local ./scripts/run-packaged.sh
```

## Port 80 note

Using:

```txt
http://drop-den
```

requires the app to listen on port `80`.

On Linux, normal user processes cannot bind to port `80` without extra permissions. For development and packaged testing, use port `8080`.

Later, a systemd service can grant the binary permission to bind to port `80` using `CAP_NET_BIND_SERVICE`.

## Test on a phone

1. Start Drop Den in development or packaged mode.
2. Make sure the phone is on the same Wi-Fi as the host machine.
3. Find the host LAN IP.
4. Open one of these:

Development mode:

```txt
http://<pc-lan-ip>:5173
```

Packaged mode:

```txt
http://<pc-lan-ip>:8080
```

The Join Card also displays a QR code and recommended join URL.

## Finding your LAN IP

Linux:

```bash
ip addr
```

Windows PowerShell:

```powershell
ipconfig
```

macOS:

```bash
ipconfig getifaddr en0
```

## Firewall notes

If another device cannot reach Drop Den, open the port being used.

Fedora/Linux example for port `8080`:

```bash
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --reload
```

For development mode, also open Vite’s port if needed:

```bash
sudo firewall-cmd --add-port=5173/tcp --permanent
sudo firewall-cmd --reload
```

For a custom packaged port:

```bash
sudo firewall-cmd --add-port=8081/tcp --permanent
sudo firewall-cmd --reload
```

## Local name notes

To use a local name such as:

```txt
http://drop-den.local:8080
```

the host must advertise or resolve that name.

On Fedora/Linux:

```bash
sudo dnf install avahi avahi-tools
sudo systemctl enable --now avahi-daemon
sudo hostnamectl set-hostname drop-den
sudo systemctl restart avahi-daemon
```

Test:

```bash
avahi-resolve-host-name drop-den.local
```

If `drop-den.local` does not work on Android or another device, use the LAN IP fallback.

## Backend notes

The backend uses:

- Rust
- Axum
- Tokio
- tower-http
- WebSocket events
- local disk storage for uploaded files

Current state is in-memory for:

- devices
- messages
- transfer metadata
- host device identity
- join PIN

Uploaded files are stored on disk under the configured storage directory.

The next major backend improvement is SQLite persistence.

## SQLite setup

Drop Den now creates a SQLite database during backend startup.

Default database path:

```txt
../storage/drop-den.sqlite
```

Default transfer storage path:

```txt
../storage/transfers
```

Override paths:

```txt
DROP_DEN_DATA_DIR=/path/to/drop-den-data cargo run
DROP_DEN_DATABASE_PATH=/path/to/drop-den.sqlite cargo run
DROP_DEN_STORAGE_DIR=/path/to/transfers cargo run
```

SQLite migrations and the database connection are set up.

The backend now persists:

- registered devices
- host device identity
- join PIN
- app settings
- messages
- transfer metadata

Messages expire after 24 hours and are removed by the cleanup job.

Transfers expire after the configured transfer lifetime and are removed by the cleanup job. On startup, non-expired transfer metadata is restored from SQLite. Expired transfers and records whose files are missing are removed from SQLite.

Uploaded files remain stored on disk under the configured transfer storage directory.

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

```txt
sudo systemctl restart drop-den
```

Open the canonical LAN URL and register the browser that should become host.

After recovery, remove DROP_DEN_RESET_HOST=1 from /etc/drop-den/drop-den.env and restart the service again.

This keeps existing devices, messages, transfers, and app data. It only clears the persisted host_device_id.

## Frontend notes

The frontend uses:

- React
- TypeScript
- Vite
- Tailwind
- Zustand
- TanStack Query
- qrcode.react

## Build checks

Frontend:

```bash
cd frontend
yarn build
```

or:

```bash
cd frontend
npm run build
```

Backend:

```bash
cd backend
cargo check
```

Release build:

```bash
cd backend
cargo build --release
```

## Common issues

### Port already in use

Error:

```txt
Address already in use
```

Find the process:

```bash
sudo lsof -i :8080
```

or:

```bash
sudo ss -ltnp | grep :8080
```

Then stop it or choose a different port:

```bash
DROP_DEN_PORT=8081 ./scripts/run-packaged.sh
```

### Permission denied on port 80

Error:

```txt
Permission denied (os error 13)
```

Use port `8080` for now:

```bash
DROP_DEN_PORT=8080 ./scripts/run-packaged.sh
```

Port `80` should be handled later through a systemd service or explicit bind capability.

### Phone can open LAN IP but not `drop-den.local`

The app is working. The issue is hostname resolution.

Use:

```txt
http://<pc-lan-ip>:8080
```

or configure Avahi/local DNS.
