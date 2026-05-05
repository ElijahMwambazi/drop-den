# Drop Den

Drop Den is a local-only browser-based file and message transfer hub for nearby devices.

Run it on one host machine, open it from phones or PCs on the same local network, and move files, media, and text messages without accounts, cloud storage, or internet sharing.

## Project shape

```txt
drop-den/
  backend/       Rust Axum backend
  frontend/      React + TypeScript browser UI
  docs/          Project documentation
  storage/       Local development transfer storage
```

## MVP goals

- One host device runs the backend.
- Other devices join from a browser using the host LAN URL or QR code.
- Files move through the host device.
- Text messages are shared locally.
- WebSocket events keep devices updated.
- No cloud, no accounts, no external internet dependency.

## Development

### Backend

```bash
cd backend
cargo run
```

Backend runs on:

```txt
http://0.0.0.0:8080
```

From another device on the same network, open the host machine's LAN address, for example:

```txt
http://192.168.1.25:8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server runs on:

```txt
http://localhost:5173
```

During development, the frontend proxies `/api` and `/ws` to the Rust backend.

## Production direction

The intended production model is a single Rust binary that serves the built React frontend from `frontend/dist`.

```bash
cd frontend
npm run build
cd ../backend
cargo run --release
```

## Documentation

See:

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Development](docs/DEVELOPMENT.md)
- [Security](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
