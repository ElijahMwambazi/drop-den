# Shared-file inbox contract

> **Status: superseded after implementation.** This contract documents the
> current temporary backend inbox. The approved product direction publishes
> Android shares directly to Transfers while retaining bounded private staging
> only inside the Android app. Remove this document with the inbox code after
> the replacement flow is verified. See
> [DD-003](ISSUES.md#dd-003-android-shares-should-publish-directly-to-transfers).

The shared-file inbox is a two-stage private workflow between the Android
wrapper and the Drop Den host. It deliberately keeps Android shares out of the
public transfer list until the user publishes them.

## Data flow

1. Android receives one or more share URIs and stages them in private app data.
2. The wrapper opens a review screen. Receiving a share never uploads it
   automatically.
3. After explicit confirmation, the wrapper uploads each file to `POST
   /api/inbox` using the registered device header.
4. The host stores each item in that device's private inbox.
5. A later publishing action creates a public or targeted transfer from an
   inbox item. Publishing is not part of the staging upload.

While the current inbox prototype is installed, the wrapper must not create a
duplicate transfer by also sending the same share to `/api/transfers/upload`.
The replacement direct-transfer build removes this backend inbox step instead
of running both paths together.

## Item metadata

Each backend item has:

- an application-generated UUID;
- the owning registered device ID;
- a sanitized display name and MIME type;
- byte size, received timestamp, and expiry timestamp;
- a private server-side staged-file path that is never returned by the API.

The Android wrapper may additionally retain its original `content://` URI,
persisted permission state, local staged path, import state, failure message,
and upload-attempt timestamp. URI details must never be sent to the backend or
written to logs.

## Limits

- Maximum item size: 250 MiB.
- Maximum files per received Android share: 50.
- Maximum retained backend items per device: 50.
- Maximum total backend inbox storage: 500 MiB.
- Maximum retained age: 24 hours.
- Zero-byte files are allowed.
- Unknown MIME types use `application/octet-stream`.

Limit failures must be visible to the user. A partial Android share must never
silently omit rejected files.

## Backend API

All inbox routes require `X-Drop-Den-Device-Id` for a currently registered
device:

```txt
GET    /api/inbox
POST   /api/inbox
DELETE /api/inbox/:id
DELETE /api/inbox
```

`POST /api/inbox` accepts one multipart field named `file`. Listing, deleting,
and clearing are scoped to the authenticated device. An item owned by another
device is treated as not found. There is intentionally no public inbox file
URL or download route.

## Storage

Backend files live separately from transfers under the managed data directory:

```txt
inbox/<device-uuid>/<item-uuid>/content
```

The source filename is display metadata only and is never used as the stored
filename. SQLite stores the metadata and private path transactionally after the
file has been written successfully.

On Android:

1. Inspect each `content://` URI through `ContentResolver`.
2. Take persistable read permission when granted.
3. Otherwise copy the stream into the wrapper's private inbox directory.
4. Generate staged filenames independently from source metadata.
5. Do not request broad storage permissions.

## Cleanup and recovery

The backend removes file data and metadata when an item is deleted, its device
is removed, the den is fully reset, or the item expires. Cleanup runs at
startup and periodically, and removes metadata whose staged file is missing.

The Android wrapper keeps reviewed files across activity recreation, process
restart, temporary host failure, host changes, and expired registration. An
interrupted upload returns to a user-controlled retry state and must never
retry forever in the background.

## Acceptance checks

- Inbox routes reject unregistered devices.
- A device cannot list or delete another device's items.
- Stored paths and owner IDs are absent from API responses.
- Item count, item size, total size, and expiry limits are enforced.
- Delete, clear, device removal, reset, and expiry leave no staged file behind.
- Android shares reach the private inbox before any transfer is published.
