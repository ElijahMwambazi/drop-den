# Beta release checklist

Use this checklist for `v0.1.0-beta.1` and later controlled beta candidates.
The GitHub pre-release is a trusted-home-network beta, not a stable or
market-ready release.

> **Trusted home-network beta. Intended for private networks you control. Do
> not expose Drop Den directly to the internet or use it on hostile or public
> networks.**

## Automated gates

- [ ] Run `python3 scripts/check-release-version.py v0.1.0-beta.1` and confirm
  every release-bearing manifest matches the tag.
- [ ] Confirm CI passes backend formatting, Clippy, and Rust tests.
- [ ] Confirm CI installs with `yarn install --frozen-lockfile` and completes
  the frontend TypeScript/production build.
- [ ] Confirm CI passes desktop formatting, check, and tests.
- [ ] Confirm CI passes Android debug unit tests and lint.
- [ ] Confirm the beta workflow builds exactly one x86_64 RPM, one unsigned x64
  NSIS installer, and one signed Android release APK.
- [ ] Confirm `apksigner verify --verbose` succeeds for the APK.
- [ ] Confirm the final publish job receives the complete expected asset set,
  generates `SHA256SUMS.txt`, and verifies it before exposing the pre-release.
- [ ] Confirm the release contains exactly the three platform files documented
  in the README plus `SHA256SUMS.txt`.
- [ ] Download every release asset from a logged-out browser and verify each
  SHA-256 checksum.

Workflow success proves that packages were produced. It does not replace the
real-machine acceptance tests below.

## Manual Linux RPM acceptance

Perform on a representative clean Fedora installation or clean VM.

- [ ] Clean install the RPM and complete first launch.
- [ ] Confirm the desktop wrapper starts its backend service/sidecar.
- [ ] Confirm a browser on the same trusted LAN can connect to the frontend.
- [ ] Upload and download a transfer, then restart Drop Den and confirm the
  transfer metadata and file persist.
- [ ] Install the candidate over the previous RPM and confirm settings,
  database data, transfers, and connectivity survive the upgrade.
- [ ] Uninstall the RPM and record which user data remains.

Complete the detailed [RPM release checklist](RPM_RELEASE_CHECKLIST.md).

## Manual Windows x64 acceptance

Perform on clean Windows 10 and/or Windows 11 VMs or physical machines.

- [ ] Clean install the unsigned NSIS package and record SmartScreen behavior.
- [ ] Complete first launch and confirm WebView2/bootstrap behavior.
- [ ] Confirm the backend sidecar starts, exits with the app, and leaves no
  orphan process.
- [ ] Confirm another trusted-LAN device can reach the frontend.
- [ ] Restart the app and confirm settings and transfer data persist.
- [ ] Upgrade over the previous beta and confirm data remains usable.
- [ ] Uninstall and record which user data remains.

Complete the detailed [Windows release checklist](WINDOWS_RELEASE_CHECKLIST.md).
Windows code signing remains intentionally unavailable for this beta.

## Manual Android acceptance

Perform on supported physical Android devices.

- [ ] Confirm the candidate is a release APK and its signing certificate
  matches the permanent certificate recorded for Drop Den.
- [ ] Allow installation from the chosen browser or file manager and perform a
  clean install.
- [ ] Complete first launch, connect to a trusted-LAN host, and verify frontend
  connectivity.
- [ ] Send files from the Android share sheet and download files through the
  WebView.
- [ ] Restart the app and confirm the remembered host and staged retry state
  behave as documented.
- [ ] Install the candidate over the previous APK without uninstalling; confirm
  Android accepts the upgrade because both APKs use the same certificate.
- [ ] Confirm host configuration and applicable app data persist after upgrade.
- [ ] Uninstall and confirm expected private app data is removed.

## macOS source-build status

- [ ] Build the Apple Silicon DMG on Apple Silicon hardware.
- [ ] Build the Intel DMG on Intel hardware.
- [ ] Smoke-test first launch, backend startup, frontend connectivity, restart,
  persistence, upgrade, and uninstall on each architecture.

These checks remain exploratory. Do not publish the DMGs until both matching
hardware tests pass and Developer ID signing, notarization, and stapling are
configured.

## Rollback

- [ ] Preserve the previous known-good packages and their checksums before
  publishing.
- [ ] Record database migration and compatibility notes in the release notes.
- [ ] If acceptance fails before publication, do not create the tag.
- [ ] If a serious defect is found after publication, mark the affected
  pre-release clearly in its notes, stop recommending its installation, and
  prepare a new incremented beta. Do not move or recreate the existing tag.
- [ ] Where downgrade compatibility has been verified, reinstall the previous
  signed package using that platform's normal installer. Otherwise restore a
  pre-upgrade data backup before starting the previous version.
- [ ] On Android, rollback installation is possible only when certificate,
  version-code, and Android package-manager rules permit it; uninstalling first
  removes private app data. Prefer a fixed APK with an incremented version code.

## Known limitations to publish

- [ ] Trusted private networks only; LAN HTTP does not protect hostile traffic.
- [ ] Windows installer is unsigned and may trigger SmartScreen.
- [ ] Android sideload permission is required and the permanent signing key
  must remain available for upgrades.
- [ ] No public macOS binary, Developer ID signing, or notarization.
- [ ] RPM clean-machine, Windows physical/VM, Android upgrade, and macOS
  matching-hardware evidence must be recorded separately.
- [ ] This beta is not stable, store-ready, or market-ready.
