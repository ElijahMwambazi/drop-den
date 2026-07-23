# Roadmap

Concrete defects and verification work are tracked separately in
[Known issues and fixes](ISSUES.md).

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
- [x] Add progressive expansion and compact rows to the transfer list
- [x] Add desktop titlebar frontend reload action
- [x] Clear messages maintenance action
- [x] Reset host maintenance action
- [x] Add host-gated maintenance actions
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
- [x] Prototype and evaluate a shared-file inbox workflow
- [x] Add Android wrapper planning documents

## Phase 7: Core UX/Auth cleanup

- [x] Suppress private toasts before device registration
- [x] Split host settings from desktop runtime settings
- [x] Show host settings to any host device
- [x] Keep desktop runtime settings desktop-only
- [x] Prevent host identity lockout across all runtimes
- [x] Improve device setup copy
- [x] Add better suggested device names
- [x] Add segmented 6-digit join PIN input
- [x] Improve wrong-PIN and failed-join error states
- [x] Review whether non-desktop devices should remain allowed as host

Decision: keep host assignment runtime-neutral for now. Any supported browser or
desktop runtime may become host when no host is assigned.

## Phase 8: Android wrapper foundation

- [x] Confirm latest stable Android toolchain setup (SDK 36.1, AGP 9.2.1, Gradle 9.6.1, JDK 17+)
- [x] Make `android-wrapper` a buildable Android project
- [x] Add host selection screen
- [x] Validate LAN host URL with `/api/config`
- [x] Remember last working host
- [x] Load Drop Den UI in Android WebView
- [x] Add retry/change-host flow
- [x] Build debug APK

Android files must always be copied into bounded private app storage before a
network upload. This local staging layer remains required for safe URI handling,
offline retry, and process recovery.

## Phase 9: Shared-file inbox experiment

- [x] Implement bounded private backend inbox
- [x] Add SQLite inbox metadata
- [x] Add inbox storage folder separate from transfers
- [x] Add inbox expiry and cleanup
- [x] Add inbox size/count limits
- [x] Add frontend Shared Inbox panel
- [x] Add delete and clear inbox actions
- [x] Keep inbox private to current registered device

This phase was implemented and evaluated, then superseded by direct Android
publishing to Transfers. Its frontend panel, backend API, storage, cleanup, and
active database schema have been removed.

## Phase 10: Android direct sharing and onboarding

- [x] Add `ACTION_SEND` handling
- [x] Add `ACTION_SEND_MULTIPLE` handling
- [x] Stream Android `content://` URI files safely
- [x] Validate shared file names, MIME types, and sizes
- [x] Prototype upload of shared Android files to `/api/inbox` (superseded)
- [x] Prototype native upload progress/result screens (superseded by the in-app queue)
- [x] Add retry/change-host behavior for failed share uploads
- [x] Make the WebView resize around the Android keyboard
- [x] Add adaptive launcher icon resources
- [x] Correct launcher foreground safe-zone sizing
- [x] Add QR scanning to the host connection screen
- [x] Bridge the WebView file-upload control to Android's document picker
- [x] Upload staged Android files to `/api/transfers/upload`
- [x] Default Android share-sheet uploads to Everyone in the den
- [x] Open the main Drop Den UI immediately for shares with a remembered host
- [x] Show native Android share status in the existing upload queue
- [x] Remove native preparation, progress, and result screens from the normal share path
- [x] Make Android Back exit the registered main app instead of opening host setup
- [x] Verify direct transfer queue, retry, and host-change states
- [x] Verify single in-app file selection on Android
- [x] Verify multiple in-app file selection and picker cancellation on Android
- [x] Remove the frontend Shared Inbox panel
- [x] Remove backend inbox routes, metadata, storage, and cleanup
- [x] Remove obsolete inbox documentation and drop its active schema safely
- [x] Test Android share flow from Gallery
- [x] Test Android multi-file share flow from Samsung My Files
- [x] Test Android share flow from WhatsApp
- [x] Test Android share flow from Chrome
- [x] Test Android share flow from Firefox

Decision: selecting Drop Den in the Android share sheet is sufficient intent to
publish. Files still stage privately on Android for safety and recovery, but no
separate backend inbox or publish action should remain in the final workflow.
For a configured device, Drop Den opens its main interface immediately and
reports native share work in the same bounded upload queue used by in-app files.

The historical inbox migration remains immutable for existing SQLite migration
checksums; a forward migration drops its table during upgrade.

## Phase 11: Trusted beta hardening

- [x] Separate public device IDs from high-entropy session-token authentication
- [x] Store session-token digests and revoke sessions when devices are removed
- [x] Add a safe re-pair migration from legacy device-ID credentials
- [x] Authenticate WebSockets without URL session secrets
- [x] Filter realtime events by backend transfer policy
- [x] Centralize transfer list, download, review, delete, and event permissions
- [x] Remove stored filesystem paths from API and event payloads
- [x] Add short-lived scoped browser/Android download tickets
- [x] Restrict desktop local-path upload to desktop mode, loopback, and host
- [x] Canonicalize desktop paths and reject non-file inputs
- [x] Add configurable file, batch, storage, and metadata limits
- [x] Stream individual downloads and bound ZIP memory use
- [x] Add pairing and upload rate limits
- [x] Add negative authorization and redaction regression tests
- [x] Add backend, frontend, Android, and Tauri CI checks
- [x] Update API, architecture, security, and setup documentation

This milestone targets a trusted-household beta. LAN HTTP remains unsuitable
for hostile networks or direct public-internet exposure.

## Remaining trusted-beta risks

- [ ] Add TLS or another secure LAN transport before supporting hostile networks
- [ ] Decide whether pairing and upload rate-limit state must survive restarts
- [ ] Re-verify individual, ZIP, and targeted downloads on physical Android devices
- [ ] Add frontend unit/lint coverage and Android unit tests
- [ ] Evaluate resumable uploads for unreliable links and files near 1 GiB
- [ ] Complete installer signing and package smoke tests for public downloads
- [ ] Evaluate encryption at rest before storing sensitive transfers

## Future packaging

- [x] Add Windows-specific Tauri bundle configuration
- [x] Add a native Windows sidecar and NSIS build script
- [x] Add a manual Windows CI artifact workflow
- [ ] Build and smoke-test the NSIS installer on Windows
- [ ] Configure Windows code signing for public downloads
- [x] Add macOS-specific Tauri DMG configuration
- [x] Add a native macOS sidecar and DMG build script
- [x] Add Apple Silicon and Intel CI artifact workflows
- [ ] Build and smoke-test both DMGs on matching Macs
- [ ] Configure macOS Developer ID signing and notarization

## Long-term ideas

- [x] Configurable transfer expiry
- [ ] Message targeting
- [ ] Optional encryption-at-rest
- [ ] Local DNS/mDNS setup helper
- [ ] Desktop service manager UI
