# Known issues and fixes

This file tracks concrete defects, verification work, and small product fixes.
Larger feature sequencing belongs in the [roadmap](ROADMAP.md).

Status values:

- **Open**: accepted work that has not been implemented.
- **In progress**: implementation has started.
- **Verify**: implemented and waiting for device or release testing.
- **Resolved**: implementation and acceptance checks are complete.
- **Superseded**: replaced by a newer product decision.

## Active

No active defects are currently recorded.

## Ready to verify

### DD-010: Android transfer downloads did not start

- Priority: High
- Status: Verify
- Area: Android WebView downloads
- Fixed: July 16, 2026

Android WebView does not save attachment responses without a native download
handler. The wrapper now accepts downloads only from the connected Drop Den
origin and hands them to Android's system Download Manager. Files are saved in
Downloads with the backend-provided filename. Android 8 and 9 request the
legacy storage permission only when the first download starts; newer Android
versions do not request it.

Acceptance checks:

- [ ] Download an available individual transfer and open it from the completed
  download notification.
- [ ] Confirm the file appears in Android's Downloads folder with its expected
  filename and content.
- [ ] Download the filtered ZIP and confirm it contains the visible downloadable
  transfers.
- [ ] Download an accepted targeted transfer as its recipient.
- [ ] On Android 8 or 9, grant storage access on the first attempt and confirm the
  pending download starts automatically.
- [ ] Confirm normal uploads, Android share-sheet publishing, and WebView
  navigation still work.

## Resolved

### DD-009: Android Back opened host setup from the registered app

- Priority: High
- Status: Resolved
- Area: Android navigation
- Fixed: July 16, 2026

Pressing Android Back from the registered main Drop Den interface now exits the
activity. It no longer treats Back as an implicit change-host action. Host setup
remains available after a connection failure and through explicit host-change
controls; Back can still leave an unregistered join flow.

### DD-003: Android shares should publish directly to Transfers

- Priority: High
- Status: Resolved
- Area: Android sharing and backend simplification
- Verified: July 16, 2026

The Shared Inbox adds an unnecessary user-visible step. Android share-sheet
files should become normal broadcast Transfers after safe local staging.

Direct publishing is implemented and verified across the physical-device test
matrix. The obsolete backend and frontend Shared Inbox have been removed. The
main Drop Den interface now opens immediately and shows native share work in
the existing upload queue instead of separate native progress/result screens.

Acceptance checks:

- [x] Keep bounded private Android staging for `content://` safety, offline retry,
  and process recovery.
- [x] Upload staged files to `POST /api/transfers/upload` with the registered
  Android device identity.
- [x] Default Android share-sheet uploads to **Everyone in the den**.
- [x] Show preparation, upload, success, and failure states in the existing
  **Send files** upload queue.
- [x] Keep retry and explicit change-host actions available for failures.
- [x] Remove the normal native preparation, progress, and result screens.
- [x] Remove the frontend panel, backend routes, storage, cleanup, and active
  inbox schema after confirming direct Gallery sharing.

### DD-004: Complete the Android share-source test matrix

- Priority: High
- Status: Resolved
- Area: Android release readiness
- Depends on: DD-003
- Verified: July 16, 2026

Acceptance checks:

- [x] Test a Gallery share and confirm it appears once in Transfers.
- [x] Test multiple files from Samsung My Files on Android 8.
- [x] Test a single file from Files.
- [x] Test shares from WhatsApp, Chrome, and Firefox.
- [x] Test an offline host, expired device registration, host change,
  cancellation, retry, and process restart.
- [x] Confirm every successful upload appears once in Transfers.
- [x] Confirm successful staging copies are removed and failed copies remain
  bounded and recoverable.

Physical-device result, July 16, 2026: Samsung My Files published two selected
documents with `2 published · 0 failed`. The backend contained exactly one
broadcast Transfer per filename, and Android private staging was empty after
success. The remaining matrix was confirmed manually on July 16, 2026.

### DD-008: Android in-app file picker did not open

- Priority: High
- Status: Resolved
- Area: Android WebView uploads
- Verified: July 16, 2026

The responsive frontend uses an HTML file input, but Android WebView does not
open a system picker for it without a native `WebChromeClient` bridge. The
wrapper now launches Android's document picker, returns single or multiple URI
selections to the WebView, and reports cancellation safely.

Acceptance checks:

- [x] Tap **Choose or drop files** inside the Android app and select one file.
- [x] Repeat with multiple files and confirm every selection enters the upload queue.
- [x] Cancel the picker and confirm the app remains usable with no empty upload.
- [x] Confirm Gallery share-sheet publishing still works independently.

### DD-002: Android host connection needs QR scanning

- Priority: High
- Status: Resolved
- Area: Android onboarding
- Verified: July 16, 2026

The connection screen now offers a QR-only Google Code Scanner with auto-zoom.
Drop Den requests no camera permission itself; Google Play services owns the
scanner UI. Manual and remembered-host flows remain available.

Acceptance checks:

- [x] Scan the host invite QR and confirm `/api/config` validation connects.
- [x] Verify invalid content, cancellation, an unavailable host, and scanner module
  failure return useful feedback without hiding manual entry.
- [x] Confirm scanned credentials, paths, queries, and fragments are rejected.

### DD-001: Android launcher mark is clipped

- Priority: High
- Status: Resolved
- Area: Android packaging
- Verified: July 16, 2026

The adaptive foreground is now packaged at the correct density instead of as a
density-independent 432 dp bitmap. This prevents Android from zooming and
clipping the padded artwork.

Acceptance checks:

- [x] Verify the icon with circle, squircle, rounded-square, and themed masks.
- [x] Confirm the mark remains recognizable at launcher and share-sheet sizes.

### DD-005: Toast content alignment on mobile

- Priority: Medium
- Status: Resolved
- Area: Frontend
- Verified: July 16, 2026

Toast cards now use centered vertical alignment, left-aligned message text, and
a horizontally centered mobile viewport. Short, wrapping, deduplicated,
success, information, and error notifications were verified on Android and
desktop.

### DD-006: Android keyboard covered the message composer

- Priority: High
- Status: Resolved
- Area: Android WebView and frontend
- Verified: July 15, 2026

The activity now resizes for the soft keyboard, the page uses a dynamic mobile
viewport, and the focused composer scrolls back into view after viewport
changes. Physical-device testing confirmed that WebView resizing works.

## Superseded

### DD-007: Publish items from Shared Inbox

- Status: Superseded
- Replaced by: DD-003

The planned inbox-publishing phase was replaced by direct Android publishing to
Transfers. The private Android staging mechanism remains an implementation
detail; the user-visible and backend Shared Inbox have been removed.
