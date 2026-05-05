# Development

## Requirements

- Rust stable
- Node.js LTS
- npm, pnpm, or yarn

## Run backend

```bash
cd backend
cargo run
```

## Run frontend

```bash
cd frontend
npm install
npm run dev
```

## Test on a phone

1. Start the backend on the PC.
2. Find the PC's LAN IP address.
3. Make sure the phone is on the same Wi-Fi.
4. Open:

```txt
http://<pc-lan-ip>:8080
```

During frontend development, you can also test the Vite dev server, but the production direction is for Rust to serve the built frontend.

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

## Backend notes

This scaffold uses in-memory state for devices, messages, and transfer metadata. Uploaded files are stored on disk.

Later, you may replace in-memory state with SQLite.

## Frontend notes

The frontend uses:

- React
- TypeScript
- Vite
- Tailwind
- Zustand
- TanStack Query
- qrcode.react
