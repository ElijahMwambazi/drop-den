# Drop Den Android wrapper

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

## Supported build stack

- Android Studio Quail 2026.1.1 or newer
- Android Gradle Plugin 9.2.1
- Gradle 9.6.1 through the committed Gradle wrapper
- Android 16 QPR2 SDK 36.1
- Android SDK Build Tools 36.1.0
- JDK 17 or newer; Android Studio's bundled JDK 21 is supported

The project intentionally follows the latest stable Android toolchain rather
than preview SDK packages. A newer system Java runtime alone is not enough for
command-line builds: the selected Java installation must include `javac`.
Gradle 9.6.1 can run on Java 25, while Android Studio's bundled JDK is the
simplest supported default.

## Build

Open `android-wrapper` in Android Studio, or configure the SDK path in an
ignored `local.properties` file:

```properties
sdk.dir=/home/you/Android/Sdk
```

When Android Studio is installed through Flatpak, its bundled JDK can be used
for terminal builds:

```bash
export JAVA_HOME="$(flatpak info --show-location com.google.AndroidStudio)/files/extra/jbr"
```

Then build from the wrapper directory:

```bash
./gradlew assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

The wrapper deliberately permits cleartext HTTP because the normal Drop Den
host is LAN-only HTTP. Do not navigate it to untrusted internet addresses.

## Next development slice

1. Add a native device-registration bridge or a dedicated native API client.
2. Implement the private staged inbox from the shared-file contract.
3. Register `ACTION_SEND` and `ACTION_SEND_MULTIPLE` only after staging is
   transactional and bounded.
4. Exercise process-death, offline-host, and host-IP-change recovery on a
   physical Android device.
