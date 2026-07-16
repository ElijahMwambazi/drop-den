# macOS desktop release checklist

Use this checklist for Drop Den DMG candidates built for Apple Silicon or Intel.
Each architecture has its own Tauri executable and matching backend sidecar.

## Build environment

- [ ] Use a supported macOS machine with Xcode Command Line Tools installed.
- [ ] Install Node.js 22, Yarn 1.22.22, and stable Rust.
- [ ] Confirm `rustc -vV` reports either `aarch64-apple-darwin` or
  `x86_64-apple-darwin`.
- [ ] Confirm the repository has no unexpected local build changes.

## Build

Run from Terminal at the repository root:

```bash
./scripts/build-desktop-macos.sh
```

- [ ] Confirm the backend release binary is created.
- [ ] Confirm the sidecar is copied to
  `src-tauri/binaries/drop-den-backend-<target-triple>`.
- [ ] Confirm the DMG is created under
  `src-tauri/target/release/bundle/dmg/`.
- [ ] Record the DMG SHA-256 with `shasum -a 256`.

The manual **macOS desktop packages** GitHub Actions workflow builds separate
Apple Silicon and Intel DMG artifacts. Workflow artifacts use ad-hoc signing
for testing and are not public release candidates.

## Clean-machine installation

- [ ] Test the Apple Silicon DMG on Apple Silicon hardware.
- [ ] Test the Intel DMG on Intel hardware.
- [ ] Confirm the DMG displays the Drop Den icon and Applications shortcut.
- [ ] Drag Drop Den to Applications and launch it from Finder.
- [ ] Record any Gatekeeper warning for the ad-hoc test build.
- [ ] Confirm the application opens without an immediate exit.
- [ ] Confirm uninstall removes the app bundle while user data behaves as
  documented.

## Runtime acceptance

- [ ] Confirm the rounded shell, titlebar controls, scrolling, and footer render.
- [ ] Confirm the backend sidecar starts and stops with the desktop application.
- [ ] Confirm the host join URL is reachable from another LAN device.
- [ ] Join a browser and Android device using the six-digit PIN.
- [ ] Upload, download, delete, and ZIP-download transfers.
- [ ] Send and receive messages.
- [ ] Test drag-and-drop for one and multiple files.
- [ ] Test tray open, copy URL, and quit actions.
- [ ] Test Desktop Settings diagnostics, folder browsing, and reset actions.
- [ ] Confirm data and transfer paths use normal macOS Application Support paths.
- [ ] Restart macOS and confirm no orphan backend process remains.

## Signing and notarization gate

- [ ] Enroll in the Apple Developer Program.
- [ ] Configure a **Developer ID Application** certificate for distribution
  outside the App Store.
- [ ] Configure notarization with App Store Connect API credentials or an Apple
  ID app-specific password.
- [ ] Build, notarize, and staple both architecture-specific DMGs.
- [ ] Validate each DMG with `spctl` and `codesign`.
- [ ] Test upgrade installation without data loss.
- [ ] Keep the roadmap item open until both DMGs pass this checklist on real Macs.
