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

### DD-003: Android shares should publish directly to Transfers

- Priority: High
- Status: Open
- Area: Android sharing and backend simplification

The Shared Inbox adds an unnecessary user-visible step. Android share-sheet
files should become normal broadcast Transfers after safe local staging.

Acceptance checks:

- Keep bounded private Android staging for `content://` safety, offline retry,
  and process recovery.
- Upload staged files to `POST /api/transfers/upload` with the registered
  Android device identity.
- Default Android share-sheet uploads to **Everyone in the den**.
- Retain clear progress, result, retry, and change-host states.
- Verify direct sharing before removing the frontend Shared Inbox panel and
  backend inbox routes, storage, metadata, cleanup, and migration references.

### DD-004: Complete the Android share-source test matrix

- Priority: High
- Status: Open
- Area: Android release readiness
- Depends on: DD-003

Acceptance checks:

- Test one and multiple files from Gallery and Files.
- Test shares from WhatsApp, Chrome, and Firefox.
- Test an offline host, expired device registration, host change, cancellation,
  retry, and process restart.
- Confirm every successful upload appears once in Transfers.
- Confirm successful staging copies are removed and failed copies remain
  bounded and recoverable.

## Ready to verify

### DD-002: Android host connection needs QR scanning

- Priority: High
- Status: Verify
- Area: Android onboarding

The connection screen now offers a QR-only Google Code Scanner with auto-zoom.
Drop Den requests no camera permission itself; Google Play services owns the
scanner UI. Manual and remembered-host flows remain available.

Acceptance checks:

- Scan the host invite QR and confirm `/api/config` validation connects.
- Verify invalid content, cancellation, an unavailable host, and scanner module
  failure return useful feedback without hiding manual entry.
- Confirm scanned credentials, paths, queries, and fragments are rejected.

### DD-001: Android launcher mark is clipped

- Priority: High
- Status: Verify
- Area: Android packaging

The adaptive foreground is now packaged at the correct density instead of as a
density-independent 432 dp bitmap. This prevents Android from zooming and
clipping the padded artwork.

Acceptance checks:

- Verify the icon with circle, squircle, rounded-square, and themed masks.
- Confirm the mark remains recognizable at launcher and share-sheet sizes.

### DD-005: Toast content alignment on mobile

- Priority: Medium
- Status: Verify
- Area: Frontend

Toast cards now use centered vertical alignment, left-aligned message text, and
a horizontally centered mobile viewport. Verify short, wrapping, deduplicated,
success, information, and error notifications on Android and desktop.

## Resolved

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
detail; the user-visible Shared Inbox is scheduled for removal after direct
sharing is verified.
