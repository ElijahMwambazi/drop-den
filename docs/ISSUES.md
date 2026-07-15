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

### DD-001: Android launcher mark is clipped

- Priority: High
- Status: Open
- Area: Android packaging

The adaptive foreground fills too much of masked launcher shapes. On a
squircle launcher the roof reaches the upper edge and the lower outline is
visually cramped.

Acceptance checks:

- Increase the adaptive-icon safe padding without shrinking the legacy icon
  unnecessarily.
- Verify the icon with circle, squircle, rounded-square, and themed masks.
- Confirm the mark remains recognizable at launcher and share-sheet sizes.

### DD-002: Android host connection needs QR scanning

- Priority: High
- Status: Open
- Area: Android onboarding

The connection screen currently requires typing a LAN host address.

Acceptance checks:

- Add a **Scan host QR code** action alongside manual entry.
- Request camera access only when scanning begins.
- Accept only an `http://` or `https://` origin with no credentials, query, or
  fragment.
- Validate the scanned origin through `GET /api/config` before opening it.
- Show a useful invalid-code or unavailable-host error.
- Keep manual host entry and the remembered-host flow available.

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

