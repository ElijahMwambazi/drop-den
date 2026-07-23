# Security model

Drop Den is intended for trusted household LANs. It must not be exposed
directly to the public internet.

## Device identity and sessions

Device IDs are public identifiers, not credentials. Successful registration
returns a separate 256-bit random session token exactly once:

```txt
Authorization: Bearer <device-session-token>
```

Only a SHA-256 digest of the random token is stored in SQLite and memory.
Tokens are never returned by device lists, transfers, logs, or WebSocket
events. Removing a device revokes its session and download tickets and closes
its live connection.

Migration `005_device_session_tokens.sql` deliberately removes legacy devices,
messages, and transfers because older device IDs were usable as credentials.
After upgrade, every device must pair again. Orphaned legacy transfer files are
removed during startup.

The first device still becomes host without a PIN. Later devices need the
current six-digit PIN; it is Argon2-hashed in SQLite, kept in plaintext only in
runtime memory, rotated after each successful join, and rate-limited by source
IP.

## Authorization

The backend is the authority for transfer access:

| Operation | Broadcast transfer | Targeted transfer |
| --- | --- | --- |
| List/inspect | Any registered device | Host, sender, or recipient |
| Download | Any registered device when available | Host, sender, or recipient after acceptance |
| Accept/reject | Not applicable | Recipient only while pending |
| Delete | Host or sender | Host or sender |
| Receive event | All registered devices | Host, sender, and recipient |

An inaccessible transfer normally returns `404` so its existence is not
disclosed. Absolute storage paths are backend-only fields and are omitted from
all serialized transfer payloads.

Host-only actions include den-wide settings, clearing all messages/transfers,
and host/reset maintenance.

## WebSockets and downloads

WebSockets authenticate during the handshake using:

```txt
Sec-WebSocket-Protocol: drop-den-v1, drop-den-auth.<session-token>
```

This avoids placing a long-lived token in a URL. Events are filtered by the
authenticated device. Revoked sessions are disconnected.

Browser and Android downloads use a five-minute, high-entropy, resource-scoped
ticket issued over an authenticated request. A ticket can download only one
transfer or the caller's currently visible ZIP selection. It is not a device
session and is revoked when the device is removed.

## Desktop trust boundary

`POST /api/transfers/upload-local-paths` is a privileged desktop capability. It
requires all of:

- desktop backend mode;
- a loopback TCP peer;
- the current host's bearer token.

Input paths are canonicalized and must resolve to readable regular files.
Directories, missing paths, oversized batches, and unsupported request shapes
are rejected. Browser and Android clients cannot obtain desktop filesystem
paths from `/api/config`; runtime paths are returned only to an authenticated
desktop host.

The Tauri endpoint is still HTTP on loopback rather than an unforgeable native
IPC capability. Malware or a hostile process already running as the same OS
user remains outside Drop Den's protection.

## Resource controls

Defaults can be changed with environment variables:

| Variable | Default |
| --- | ---: |
| `DROP_DEN_MAX_FILE_BYTES` | 1 GiB |
| `DROP_DEN_MAX_BATCH_BYTES` | 4 GiB |
| `DROP_DEN_MAX_STORAGE_BYTES` | 50 GiB |
| `DROP_DEN_MAX_FILES_PER_BATCH` | 50 |

Device names are limited to 64 characters, messages to 2,000 characters,
filenames to 180 safe ASCII characters, and MIME metadata to 128 characters.
Pairing is limited to 12 attempts per source IP per five minutes; uploads are
limited to 60 requests per device per minute.

Uploads stream to disk with size/storage checks. Individual downloads stream
from disk. ZIPs are built one file at a time into a temporary file and then
streamed; cancellation removes the temporary file. Disk-full failures return
`507 Insufficient Storage` where the operating system reports that condition.

The desktop wrapper retains at most five local log files of roughly 2 MiB
each. Support-report export is user initiated and sanitizes session tokens,
join PINs, download tickets, and configured local storage paths. Transfer
contents, message bodies, and filenames are not logged.

## Remaining limitations

- LAN HTTP does not encrypt session tokens in transit. A party able to sniff or
  alter the trusted LAN can steal a session. Public or hostile-network use
  requires TLS and a stronger deployment model.
- Files are not encrypted at rest.
- There are no user accounts, audit log, malware scan, or content inspection.
- A compromised host OS can read all den data.
- Rate limits are in-memory and reset with the backend.

These controls support a trusted-household beta, not an internet-facing public
service.
