# Shared-file inbox contract

This contract defines how the Android wrapper temporarily holds files received
from the Android share sheet before the user uploads them to a Drop Den host.
It applies to the native wrapper. The existing Drop Den transfer API and server
storage behavior remain unchanged.

## Product rules

- Receiving a share never uploads automatically.
- The wrapper opens a review screen showing every pending file.
- The user can remove individual files, cancel the whole import, choose a
  destination, and explicitly start the upload.
- A pending share survives activity recreation, app backgrounding, and a
  temporary loss of the host connection.
- Pending files are private application data and must not be exposed through a
  public filesystem path.

## Inbox item

Each item has:

- an application-generated UUID;
- the Android source URI, retained only while its permission is valid;
- a private staged-file path when the URI cannot be reopened reliably;
- display name, MIME type, byte size, and received timestamp;
- import state: `pending`, `uploading`, `failed`, or `uploaded`;
- an optional failure message and upload-attempt timestamp.

The source application filename is display metadata only. It must never be
used directly as a filesystem path.

## Limits

- Maximum item size: the lower of the host's `max_upload_size_bytes` value and
  250 MiB.
- Maximum files per received share: 50.
- Maximum total staged inbox size: 500 MiB.
- Maximum retained age: 24 hours.
- Zero-byte files are allowed when the backend accepts them.
- Unknown MIME types use `application/octet-stream`.

The review screen rejects an over-limit item before upload and explains which
limit was exceeded. A partial share may be reviewed only after rejected items
are clearly identified; it must never silently omit them.

## Storage and permissions

1. Inspect every incoming `content://` URI through `ContentResolver`.
2. Take persistable read permission when the provider grants it.
3. Otherwise copy the stream into the wrapper's private cache/inbox directory.
4. Generate the staged filename independently from source metadata.
5. Store inbox metadata transactionally before showing the review screen.
6. Do not log URI query strings, file contents, join PINs, or device IDs.

The wrapper must not request broad storage permissions. It uses only the URIs
granted by the Android share intent.

## Upload behavior

- Resolve the current host and fetch `/api/config` before upload.
- Require a registered Drop Den device identity before calling private routes.
- Upload through the existing transfer endpoint and device header.
- Process files sequentially initially so progress and recovery are predictable.
- Mark an item uploaded only after the server returns success.
- Retain failed and not-yet-attempted items for retry.
- Never retry a failed upload indefinitely in the background.

## Cleanup

Delete a staged file and its metadata when:

- the user removes it or cancels the import;
- its upload succeeds and the response is committed;
- it is older than 24 hours;
- startup recovery finds corrupt metadata or a missing staged file.

Run bounded cleanup on application startup and after every completed import.
Release any persistable URI permission when no inbox item references it.

## Recovery

- Activity recreation resumes the same review state.
- If the host is offline, keep the inbox and offer retry or host selection.
- If the host address changes, retain the inbox while the user reconnects.
- If device registration expires, retain the inbox while registration is
  restored.
- If the process stops during upload, return `uploading` items to `pending` on
  the next launch; the user chooses whether to retry.
- If storage becomes full, stop staging, preserve already committed items, and
  report the shortage without deleting unrelated application data.

## Acceptance checks

- Single and multi-file shares arrive with correct metadata.
- Files remain reviewable after rotation, backgrounding, and process restart.
- Cancel, expiry, and successful upload leave no staged file behind.
- Oversized and quota-exceeding shares are rejected visibly.
- Interrupted uploads do not disappear or upload twice automatically.
- Host changes and expired device identity do not discard pending files.

