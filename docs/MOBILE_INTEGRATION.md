# Mobile integration feasibility

This document records the Phase 8 feasibility findings for installing Drop Den on Android and receiving files from the Android share sheet.

## Current conclusion

The default Drop Den LAN URL is an HTTP origin such as:

```txt
http://192.168.1.25:8080
```

That origin is suitable for the current browser transfer experience, but it is not a secure context. Service workers require HTTPS, with a development exception for `http://localhost`. On a phone, `localhost` refers to the phone rather than the Drop Den host.

The Web Share Target path therefore cannot be considered supported for Drop Den's default zero-configuration HTTP LAN mode.

Provisional product direction:

- keep ordinary mobile browser access working over trusted LAN HTTP;
- treat PWA installation and Share Target as an optional HTTPS capability;
- prefer an Android native wrapper if zero-configuration, reliable Android share-sheet integration is a product requirement.

References:

- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Chrome Web Share Target documentation](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- [web.dev receiving shared files pattern](https://web.dev/patterns/files/receive-shared-files/)

## Current architecture findings

- The Axum backend binds a plain `TcpListener` and serves HTTP directly.
- Generated origins in `backend/src/routes/config.rs` are hard-coded to `http://`.
- The frontend uses relative API routes in browser mode, so it can work behind an HTTPS reverse proxy.
- WebSocket URL selection already changes from `ws://` to `wss://` when the page itself uses HTTPS.
- Desktop sidecar traffic is loopback-only and should remain HTTP; mobile HTTPS must not force TLS onto the Tauri sidecar.
- Device identity is stored per browser origin. Changing hostname, IP, port, or scheme creates a separate browser identity.
- An installed PWA is tied to its origin and service-worker scope. A changed host IP or hostname can strand the installed entry on the old origin.

## Secure LAN options

### 1. User-managed HTTPS reverse proxy

Example: Caddy, nginx, or another local reverse proxy terminates TLS and forwards to Drop Den's HTTP port.

Advantages:

- no TLS implementation is required in the Rust backend;
- relative API routes and secure WebSockets fit the current frontend architecture;
- experienced server users can supply an existing trusted hostname and certificate.

Costs:

- not zero configuration;
- the hostname must resolve consistently on every client;
- every phone must trust the certificate chain;
- documentation and proxy-header/origin testing are required.

Recommendation: support this as the first experimental PWA deployment path.

### 2. Local certificate authority

Drop Den or a proxy generates a local CA and a certificate for a stable local hostname. Users install the CA certificate on each phone.

Advantages:

- remains local-only;
- works without a publicly reachable service after setup.

Costs:

- certificate installation is high friction and security-sensitive;
- Android trust behavior can vary by browser, OS version, and application;
- hostname discovery and renewal still need implementation;
- unsuitable as the default consumer workflow.

Recommendation: document for advanced testing only; do not make it the primary mobile plan.

### 3. Owned domain with split-horizon DNS

A domain controlled by the user resolves to the Drop Den host on the LAN, with a publicly trusted certificate obtained through an appropriate validation flow.

Advantages:

- best browser and PWA compatibility;
- no custom CA installation on phones;
- stable origin can survive DHCP address changes.

Costs:

- requires a domain, DNS administration, certificate automation, and local DNS;
- substantially exceeds the current zero-account, zero-configuration experience.

Recommendation: supported advanced deployment, not the default.

### 4. Public tunnel or cloud relay

This can provide a trusted HTTPS origin, but it changes Drop Den's local-only threat model and may expose traffic outside the LAN.

Recommendation: do not use as the default solution for Phase 8.

### 5. Android native wrapper

A native wrapper can receive Android share intents and connect directly to the Drop Den host over the LAN. It can present a pending import screen before using the existing upload API.

Advantages:

- reliable Android share-sheet registration;
- does not depend on PWA installation or a service worker;
- can retain the current local HTTP server model with an explicit Android network-security policy;
- can provide discovery, remembered hosts, and native pending-share storage.

Costs:

- Android packaging, permissions, lifecycle, discovery, and store/distribution work;
- a native bridge or plugin is required for share intents;
- the wrapper must handle host availability and IP changes.

Recommendation: preferred direction if the physical Android test confirms that HTTPS setup is too complex for intended users.

## Required PWA behavior if HTTPS is available

The service worker must:

- precache only the static application shell;
- never cache `/api`, `/ws`, transfer downloads, device data, or messages as offline application data;
- intercept only the declared Share Target `POST` action;
- validate that incoming values are files before storing them;
- place pending shares in Cache Storage or IndexedDB;
- redirect to a dedicated import route with a non-sensitive identifier;
- delete pending files after successful upload, rejection, expiry, or explicit cancellation;
- clean abandoned entries on startup and enforce a strict quota.

The pending import screen must:

- show filenames, types, sizes, and total size;
- reject items above the backend upload limit before upload;
- allow removing individual items;
- allow choosing Everyone or a target device;
- require confirmation before uploading;
- retain the share while an unjoined user completes device registration;
- handle a missing host, expired identity, interrupted upload, and storage-quota failure;
- avoid uploading automatically when opened from the Android share sheet.

## Physical Android test matrix

### Local HTTPS test harness

Drop Den includes a Caddy-based reverse-proxy harness for this feasibility test. It does not change the Rust backend or the normal HTTP delivery mode.

1. Start the desktop backend or packaged backend on the expected upstream port. The default test upstream is `127.0.0.1:18080`.
2. Start the proxy:

   ```bash
   ./scripts/run-mobile-https-test.sh
   ```

3. If LAN address detection is unavailable or selects the wrong interface, set it explicitly:

   ```bash
   DROP_DEN_HTTPS_HOST=192.168.1.25 ./scripts/run-mobile-https-test.sh
   ```

4. Transfer `.mobile-https/data/caddy/pki/authorities/local/root.crt` to a dedicated Android test device through a trusted method.
5. Install it as a CA certificate in Android's security settings. This grants the test CA broad trust on that device; do not use a primary device, do not distribute the private CA state, and remove the CA after testing.
6. Open the printed `https://<lan-ip>:8443` URL in Chrome and confirm there is no certificate warning.
   Enter the full `https://` prefix. Opening `http://<lan-ip>:8443` sends plain HTTP to the TLS listener and produces a protocol error.
7. In the browser console or a temporary diagnostic, confirm `window.isSecureContext` is `true`.
8. Stop the proxy after testing:

   ```bash
   ./scripts/stop-mobile-https-test.sh
   ```

Generated CA keys and proxy state remain under `.mobile-https/`, which is ignored by Git. Removing that directory invalidates the generated CA and requires removing the corresponding certificate from Android.

Run this matrix before selecting the implementation path.

| Scenario | Expected result |
| --- | --- |
| Open the normal HTTP LAN URL | Existing browser app works; service-worker registration is unavailable |
| Add/install from normal HTTP LAN URL | PWA installation and Share Target are not accepted as the supported path |
| Open a trusted HTTPS proxy URL | Secure context is reported and service-worker registration succeeds |
| Install from trusted HTTPS | App launches standalone and retains the same device identity |
| Share one image | Drop Den appears in the Android share sheet and opens the pending import screen |
| Share multiple mixed files | All supported files appear once with correct metadata |
| Share while not joined | Pending files remain while the user joins, then can be uploaded |
| Host is offline | Import screen retains the share and explains reconnection |
| Host IP changes behind stable hostname | Installed PWA continues working |
| Origin hostname or scheme changes | App treats it as a different origin and explains recovery |
| Pending share is abandoned | Stored temporary files are removed after the retention period |

Record for each test:

- Android version and device;
- browser name and version;
- installed PWA/WebAPK status;
- exact origin and certificate type;
- whether the service worker controls the page;
- whether Drop Den appears in the share sheet;
- single-file, multi-file, text, and URL behavior;
- storage consumed before and after cleanup.

## Decision gate

Choose the PWA path only if all of these are true:

- the intended user can obtain a trusted, stable HTTPS origin without unacceptable setup;
- installation works reliably on the target Android versions;
- Drop Den consistently appears in the Android share sheet;
- incoming multi-file shares survive app launch and temporary disconnection;
- host address changes can be handled without reinstalling or losing identity;
- temporary shared files can be bounded and cleaned safely.

Choose the native wrapper path if any core requirement depends on certificate installation, browser-specific workarounds, an unstable origin, or unreliable share-sheet registration.

## Physical test result: private-CA LAN PWA

Test date: July 13, 2026.

Environment:

- trusted Caddy local CA installed on Android;
- HTTPS origin `https://192.168.1.167:8443`;
- packaged Drop Den backend behind the reverse proxy;
- valid manifest, install icons, and static-shell service worker;
- Chrome accepted installation without a certificate warning.

Observed result:

- browser mode loaded and operated normally;
- installation completed and produced a home-screen application;
- opening the installed standalone application immediately returned to Android;
- repeated reinstall and service-worker update attempts produced the same behavior.

Server evidence from the standalone launch showed:

- application HTML and hashed JavaScript/CSS loaded successfully;
- configuration, devices, transfers, and messages returned HTTP `200`;
- the WebSocket upgraded successfully with HTTP `101`;
- no frontend resource, API, TLS, proxy, or backend startup failure was observed.

Conclusion:

The application itself boots successfully, but the Android installed-app wrapper is not reliable with this private-CA LAN origin. This fails the PWA decision gate. Drop Den will keep standards-based Chrome and Firefox browser/PWA assets, but the supported Android share-target direction is now a native wrapper. Web Share Target may remain an experimental Chromium feature for deployments that provide a stable publicly trusted HTTPS origin.

## Current Android direction

The native wrapper now remembers and validates a host, loads the responsive
interface, receives single and multiple Android file shares, and copies
`content://` data into bounded private app storage for recovery and retry.

The backend Shared Inbox was implemented as an intermediate design. Physical
testing showed that its extra user-visible publish step does not fit the
intended share-sheet experience. The approved replacement keeps private
Android staging but uploads directly to normal Transfers for Everyone in the
den. Host QR scanning and launcher safe-zone correction are also required
before the Android release-readiness matrix is completed.

Track this work in the [roadmap](ROADMAP.md) and
[known issues](ISSUES.md).
