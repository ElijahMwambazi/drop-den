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
- [x] Streamline Desktop Settings layout and action hierarchy
- [x] Compact joined-device hero, invite flow, and transfer controls across clients
- [x] Add bounded scrolling and compact rows to the transfer list
- [x] Add desktop titlebar frontend reload action
- [x] Clear messages maintenance action
- [x] Reset host maintenance action
- [x] Desktop Settings hidden for non-host devices
- [x] Prevent host devices from clearing local identity directly
- [x] Prevent host devices from switching device directly
- [x] Improve maximized desktop layout
- [x] Clear transfers from Desktop Settings
- [x] Full desktop reset with strong confirmation
- [x] Open logs or diagnostics view
- [x] Improve empty states after host reset
- [x] Add dev/prod desktop troubleshooting checklist
- [x] Add release checklist for RPM builds

## Completed mobile feasibility work

- [x] Investigate secure LAN origin and HTTPS options
- [x] Add a local HTTPS reverse-proxy test harness
- [x] Test Android PWA installation from the real LAN URL
- [x] Add PWA manifest, install icons, and static-shell service worker
- [x] Add Chrome/Firefox install and service-worker update UX
- [x] Select a native Android wrapper as the reliable share-target direction
- [x] Define shared-file inbox limits, cleanup, and recovery behavior
- [x] Add Android wrapper and shared-file inbox planning documents

## Phase 7: Core UX/Auth cleanup

- [ ] Suppress private toasts before device registration
- [ ] Split host settings from desktop runtime settings
- [ ] Show host settings to any host device
- [ ] Keep desktop runtime settings desktop-only
- [ ] Prevent host identity lockout across all runtimes
- [ ] Improve device setup copy
- [ ] Add better suggested device names
- [ ] Add segmented 6-digit join PIN input
- [ ] Improve wrong-PIN and failed-join error states
- [ ] Review whether non-desktop devices should remain allowed as host

## Phase 8: Android wrapper foundation

- [ ] Confirm Android SDK 35, Gradle, and JDK 17 setup
- [ ] Make `android-wrapper` a buildable Android project
- [ ] Add host selection screen
- [ ] Validate LAN host URL with `/api/config`
- [ ] Remember last working host
- [ ] Load Drop Den UI in Android WebView
- [ ] Add retry/change-host flow
- [ ] Build debug APK

Android wrapper work must use the shared inbox model. It must not bypass the
inbox by uploading shared files directly as public transfers.

## Phase 9: Shared-file inbox

- [ ] Implement bounded private backend inbox
- [ ] Add SQLite inbox metadata
- [ ] Add inbox storage folder separate from transfers
- [ ] Add inbox expiry and cleanup
- [ ] Add inbox size/count limits
- [ ] Add frontend Shared Inbox panel
- [ ] Add delete and clear inbox actions
- [ ] Keep inbox private to current registered device

## Phase 10: Android share integration

- [ ] Add `ACTION_SEND` handling
- [ ] Add `ACTION_SEND_MULTIPLE` handling
- [ ] Stream Android `content://` URI files safely
- [ ] Validate shared file names, MIME types, and sizes
- [ ] Upload shared Android files to `/api/inbox`
- [ ] Add upload result screen
- [ ] Add retry/change-host behavior for failed share uploads
- [ ] Test from Gallery, Files, WhatsApp, and browser share flows

## Phase 11: Inbox publishing

- [ ] Add publish inbox item as transfer
- [ ] Add send-to-all from inbox
- [ ] Add send-to-device from inbox
- [ ] Decide whether publishing removes or keeps inbox item
- [ ] Add filtered ZIP/download behavior if needed

## Future packaging

- [ ] Package Windows build
- [ ] Package macOS build

## Long-term ideas

- Configurable transfer expiry
- Message targeting
- Optional encryption-at-rest
- Local DNS/mDNS setup helper
- Desktop service manager UI
