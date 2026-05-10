# Security

Drop Den is designed to be local-only.

## MVP safety rules

- Do not expose the server to the public internet.
- Store files only under the configured storage directory.
- Use random UUIDs for transfers and devices.
- Add file size limits before using it heavily.
- Add a join PIN before trusting it on shared Wi-Fi.
- Add automatic cleanup for old transfers.
- Restrict CORS to local development origins instead of using permissive CORS.

## Recommended future features

- Join code / PIN before a new device can register.
- Per-transfer accept/reject flow.
- Configurable max upload size.
- Transfer expiry.
- Clear all transfers button.
- Local-only network exposure warning.
- Optional encryption-at-rest for stored transfer files.

## Avoid in the MVP

- Public internet sharing.
- User accounts.
- Cloud relay storage.
- WebRTC direct transfer.
- Complex permissions.
