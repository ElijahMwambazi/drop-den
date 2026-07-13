# Drop Den Android wrapper prototype

This is the native Android direction selected after the private-CA LAN PWA
failed its installed-app reliability test.

The prototype currently:

- accepts a Drop Den host URL or LAN address;
- normalizes and validates HTTP/HTTPS URLs;
- verifies the host through `GET /api/config`;
- remembers the last working host;
- opens the existing responsive Drop Den UI in a WebView;
- returns to host selection when the main navigation cannot connect.

It intentionally does not receive Android share intents yet. Inbox and cleanup
semantics are defined in `docs/SHARED_FILE_INBOX.md` and should be implemented
before enabling `ACTION_SEND` or `ACTION_SEND_MULTIPLE` intent filters.

## Development prerequisites

- Android Studio or Android SDK command-line tools
- Android SDK 35
- JDK 17
- Gradle 8.10+ (or a generated Gradle wrapper)

This repository does not commit a generated Gradle wrapper binary. Open the
`android-wrapper` directory in Android Studio to sync and run it, or generate a
wrapper with a compatible local Gradle installation.

The wrapper deliberately permits cleartext HTTP because the normal Drop Den
host is LAN-only HTTP. Do not navigate it to untrusted internet addresses.

## Next prototype slice

1. Add a native device-registration bridge or a dedicated native API client.
2. Implement the private staged inbox from the shared-file contract.
3. Register `ACTION_SEND` and `ACTION_SEND_MULTIPLE` only after staging is
   transactional and bounded.
4. Exercise process-death, offline-host, and host-IP-change recovery on a
   physical Android device.

