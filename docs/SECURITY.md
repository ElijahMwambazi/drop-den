# Security

Drop Den is designed to be local-only.

It should be used on trusted local networks and should not be exposed directly to the public internet.

## Current MVP safety rules

- Do not expose the server to the public internet.
- Store files only under the configured storage directory.
- Use random UUIDs for transfers and devices.
- Require a join PIN before new devices can join after the host is created.
- Show the join PIN only to the host device.
- Require a registered device identity for private API routes.
- Allow the host to remove joined devices.
- Add file size limits before heavy use.
- Expire transfers after the configured transfer lifetime.
- Automatically clean up expired transfers.
- Restrict CORS to local development origins instead of using permissive CORS.

## Current access model

The first registered device becomes the host device.

The host device can:

- view the join PIN
- remove joined devices
- delete all transfers
- access normal den features

Joined devices can:

- send files
- send messages
- receive visible transfers
- accept or reject targeted transfers
- view connected devices

Not-joined browsers should only see:

- Join this den
- Your device setup

## API authorization

Private API routes require:

```txt
X-Drop-Den-Device-Id: <registered-device-id>
```

This is an MVP authorization mechanism. It prevents removed or unknown devices from using private routes casually, but it is not a full cryptographic authentication system.

## Current limitations

Drop Den currently uses in-memory state for devices, messages, transfer metadata, host identity, and join PIN. Restarting the backend loses this state.

SQLite persistence should be added before relying on Drop Den for longer-lived usage.

## Recommended future security improvements

- SQLite persistence for devices, messages, transfers, and settings.
- Store a join PIN hash instead of the plaintext PIN.
- Rotate/regenerate join PIN from the host UI.
- Add device/session tokens instead of trusting only a device ID header.
- Add host-only setting controls.
- Add configurable data directory and storage directory.
- Optional encryption-at-rest for stored transfer files.
- Stronger access control for download links.
- Optional audit log for device joins/removals/transfers.

## Avoid in the MVP

- Public internet sharing.
- User accounts.
- Cloud relay storage.
- WebRTC direct transfer.
- Complex role systems.
- Exposing the service through a public tunnel without authentication.
