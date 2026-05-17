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
- Run the Linux background service with a dedicated `drop-den` system user.
- Keep service data under `/var/lib/drop-den`.

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

### Host recovery

If the host browser identity is lost, the server can clear the persisted `host_device_id` with:

```txt
DROP_DEN_RESET_HOST=1
```

The next registered browser device becomes the host. This is a recovery mechanism for local/server-admin use and should only be used by someone with access to the machine running Drop Den.

## API authorization

Private API routes require:

```txt
X-Drop-Den-Device-Id: <registered-device-id>
```

This is an MVP authorization mechanism. It prevents removed or unknown devices from using private routes casually, but it is not a full cryptographic authentication system.

## Current limitations

Drop Den now persists core metadata with SQLite, including devices, messages, transfer metadata, host identity, and app settings.

The join PIN plaintext is kept only in runtime memory. SQLite stores a join PIN hash.

A new join PIN is generated on backend startup, and the PIN rotates after every successful joined-device registration.

The current API authorization model still uses a registered device ID header. This is suitable for an MVP on trusted local networks, but it is not a full cryptographic session system.

## Recommended future security improvements

- Add device/session tokens instead of trusting only a device ID header.
- Add host-only setting controls.
- Add optional encryption-at-rest for stored transfer files.
- Add stronger access control for download links.
- Add optional audit log for device joins/removals/transfers.

## Avoid in the MVP

- Public internet sharing.
- User accounts.
- Cloud relay storage.
- WebRTC direct transfer.
- Complex role systems.
- Exposing the service through a public tunnel without authentication.
