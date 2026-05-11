# Roadmap

## Phase 1: Basic local hub

- [x] Rust backend scaffold
- [x] React frontend scaffold
- [x] Device registration route
- [x] File upload route
- [x] File download route
- [x] Message route
- [x] WebSocket event route
- [x] QR join UI placeholder
- [x] Improve transfer progress
- [x] Add better device identity persistence

## Phase 2: Usability

- [x] Drag-and-drop upload
- [x] Multiple file upload
- [x] Image/video/audio previews
- [x] Download all as ZIP
- [x] Device targeting
- [x] Transfer accept/reject
- [x] Toast notifications
- [x] Polished message panel
- [x] Hide den features until device joins
- [x] Host can remove joined devices

## Phase 3: Local security

- [x] Join PIN
- [x] Host-only join PIN visibility
- [x] File size limit
- [x] Transfer expiry
- [x] Auto cleanup job
- [x] Delete all transfers
- [x] Safer CORS config
- [x] Registered-device checks for private API routes

## Phase 4: Production polish

- [x] Serve React dist from Rust
- [x] Local IP detection
- [x] Better QR code join URL
- [x] Packaged-mode launcher scripts
- [ ] Linux systemd service installer
- [ ] Configurable data and storage directories
- [ ] SQLite persistence
- [ ] Tauri wrapper optional

## Phase 5: Persistence

- [x] Add SQLite dependency and migrations
- [x] Persist devices
- [x] Persist messages
- [ ] Persist transfer metadata
- [x] Persist host device identity
- [x] Persist app settings
- [x] Message expiry
- [ ] Decide whether to persist join PIN or join PIN hash
- [ ] Restore non-expired transfer metadata on startup
- [ ] Clean missing transfer files from metadata
- [x] Add database path configuration

## Phase 6: Desktop app direction

- [ ] Add `src-tauri/`
- [ ] Bundle backend as Tauri sidecar
- [ ] Start backend sidecar from Tauri
- [ ] Wait for `/api/health` before loading UI
- [ ] Add tray menu
- [ ] Add “Open Drop Den” action
- [ ] Add “Copy join URL” action
- [ ] Package Linux build
- [ ] Package Windows build
- [ ] Package macOS build

## Long-term ideas

- Configurable transfer expiry
- Regenerate join PIN from host UI
- Clear all messages
- Message targeting
- Optional encryption-at-rest
- Better host dashboard/settings page
- Local DNS/mDNS setup helper
- Desktop service manager UI
