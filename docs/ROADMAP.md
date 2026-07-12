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
- [x] Transfer search, filtering, and sorting

## Phase 3: Local security

- [x] Join PIN
- [x] Host-only join PIN visibility
- [x] File size limit
- [x] Transfer expiry
- [x] Auto cleanup job
- [x] Delete all transfers
- [x] Safer CORS config
- [x] Registered-device checks for private API routes
- [x] Store join PIN hash
- [x] Rotate join PIN after successful device join
- [x] Host-lockout protection for desktop identity actions

## Phase 4: Production polish

- [x] Serve React dist from Rust
- [x] Local IP detection
- [x] Better QR code join URL
- [x] Packaged-mode launcher scripts
- [x] Linux systemd service installer
- [x] Host recovery reset

## Phase 5: Persistence

- [x] Add SQLite dependency and migrations
- [x] Persist devices
- [x] Persist messages
- [x] Persist transfer metadata
- [x] Persist host device identity
- [x] Persist app settings
- [x] Message expiry
- [x] Decide whether to persist join PIN or join PIN hash
- [x] Restore non-expired transfer metadata on startup
- [x] Clean missing transfer files from metadata
- [x] Add database path configuration

## Phase 6: Desktop app direction

- [x] Add `src-tauri/`
- [x] Bundle backend as Tauri sidecar
- [x] Start backend sidecar from Tauri
- [x] Wait for `/api/health` before loading UI
- [x] Add tray menu
- [x] Add “Open Drop Den” action
- [x] Add “Copy Local URL” action
- [x] Add “Copy join URL” action
- [x] Support mobile-width desktop window resizing
- [x] Use dedicated desktop backend port
- [x] Package Linux build
- [x] Add custom frameless titlebar
- [x] Add compact desktop layout
- [x] Support native desktop drag-and-drop upload
- [x] Add desktop RPM cleanup script
- [x] Add Desktop Settings panel
- [x] Add collapsible desktop side panels
- [x] Add embedded panel layout for devices, settings, and messages
- [x] Add Open data folder action
- [x] Add Open transfers folder action
- [x] Add faster desktop dev workflow
- [x] Configurable desktop transfer storage directory
- [ ] Package Windows build
- [ ] Package macOS build

## Phase 7: Desktop maintenance and polish

- [x] Add desktop titlebar frontend reload action
- [x] Clear messages maintenance action
- [x] Reset host maintenance action
- [x] Desktop Settings hidden for non-host devices
- [x] Prevent host devices from clearing local identity directly
- [x] Prevent host devices from switching device directly
- [x] Improve maximized desktop layout
- [x] Clear transfers from Desktop Settings
- [x] Full desktop reset with strong confirmation
- [ ] Open logs or diagnostics view
- [x] Improve empty states after host reset
- [ ] Add dev/prod desktop troubleshooting checklist
- [ ] Add release checklist for RPM builds
- [ ] Add filtered ZIP download or advanced transfer filter drawer if needed

## Long-term ideas

- Configurable transfer expiry
- Message targeting
- Optional encryption-at-rest
- Local DNS/mDNS setup helper
- Desktop service manager UI
- Windows desktop packaging
- macOS desktop packaging
- Advanced transfer filters or filtered ZIP download
