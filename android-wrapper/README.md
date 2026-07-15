# Drop Den Android wrapper

This is the native Android direction selected after the private-CA LAN PWA
failed its installed-app reliability test.

The wrapper currently:

- accepts a Drop Den host URL or LAN address;
- normalizes and validates HTTP/HTTPS URLs;
- verifies the host through `GET /api/config`;
- remembers the last working host;
- opens the existing responsive Drop Den UI in a WebView;
- returns to host selection when the main navigation cannot connect;
- receives single and multiple file shares from Android apps;
- copies `content://` files into bounded private app storage before review;
- uploads confirmed files sequentially to the registered device's private
  `/api/inbox`;
- keeps failed files available for retry or a host change.

The wrapper never sends Android shares directly to public transfers. Inbox and
cleanup semantics are defined in `docs/SHARED_FILE_INBOX.md`.

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

## Test Android sharing

1. Start Drop Den on a computer and make sure the Android device is on the same
   local network.
2. Install the debug APK and connect it to the host URL shown by Drop Den.
3. Register the Android device in the WebView if it is not already joined.
4. From Android Gallery, Files, a browser, or another app, select one or more
   files and choose **Share > Drop Den**.
5. Review the staged files, choose **Upload to private inbox**, and confirm they
   appear in **Shared inbox** for that Android device only.
6. Repeat with the host offline, then use retry and change-host after restoring
   the connection.

Also exercise cancellation, a file over 250 MiB, more than 50 files, process
death before upload, and an expired device registration. Shared files are
limited to 250 MiB each, 50 staged items, and 500 MiB of private staging.

## Next development slice

1. Complete the Gallery, Files, WhatsApp, and browser physical-device test
   matrix.
2. Exercise process-death, offline-host, expired-registration, and host-IP-change
   recovery on a physical Android device.
3. Continue with inbox publishing only after the private share flow is verified.
