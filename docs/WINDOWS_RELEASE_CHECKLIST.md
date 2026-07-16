# Windows desktop release checklist

Use this checklist for 64-bit Windows NSIS (`-setup.exe`) candidates. Build on
Windows rather than cross-compiling so the Tauri shell, WebView2 integration,
backend sidecar, installer, and filesystem behavior are tested together.

## Build environment

- [ ] Use a supported 64-bit Windows 10 or Windows 11 machine.
- [ ] Install Node.js 22, Yarn 1.22.22, and the stable MSVC Rust toolchain.
- [ ] Install the Microsoft C++ Build Tools required by Rust/Tauri.
- [ ] Confirm `rustc -vV` reports `x86_64-pc-windows-msvc`.
- [ ] Confirm the repository has no unexpected local build changes.

## Build

Run from PowerShell at the repository root:

```powershell
.\scripts\build-desktop-windows.ps1
```

- [ ] Confirm the backend builds as `backend/target/release/drop-den-backend.exe`.
- [ ] Confirm the sidecar is copied as
  `src-tauri/binaries/drop-den-backend-x86_64-pc-windows-msvc.exe`.
- [ ] Confirm the NSIS installer is created under
  `src-tauri/target/release/bundle/nsis/`.
- [ ] Record the installer SHA-256 with `Get-FileHash`.

The same unsigned installer can be built manually through the **Windows desktop
package** GitHub Actions workflow and downloaded from its workflow artifacts.

## Clean-machine installation

- [ ] Install on a Windows user account that has not run Drop Den before.
- [ ] Confirm the installer displays the Drop Den name and icon.
- [ ] Record any Microsoft Defender SmartScreen warning for the unsigned build.
- [ ] Confirm WebView2 is installed or bootstrapped when missing.
- [ ] Confirm Drop Den launches without a console window or immediate exit.
- [ ] Confirm uninstall removes the application while leaving user data only as
  documented.

## Runtime acceptance

- [ ] Confirm the rounded shell, titlebar controls, scrolling, and footer render.
- [ ] Confirm the backend sidecar starts and stops with the desktop application.
- [ ] Confirm the host join URL is reachable from another LAN device.
- [ ] Join a browser and Android device using the six-digit PIN.
- [ ] Upload, download, delete, and ZIP-download transfers.
- [ ] Send and receive messages.
- [ ] Test drag-and-drop for one and multiple files.
- [ ] Test the tray open, copy URL, and quit actions.
- [ ] Test Desktop Settings diagnostics, folder browsing, and reset actions.
- [ ] Confirm data and transfer paths use normal Windows user-data locations.
- [ ] Restart Windows and confirm no orphan backend process remains.

## Release gate

- [ ] Test upgrade installation over the previous version without data loss.
- [ ] Test uninstall and reinstall.
- [ ] Scan the installer and installed binaries with Microsoft Defender.
- [ ] Obtain and configure Windows code signing before calling the installer a
  public release; unsigned downloads can trigger SmartScreen warnings.
- [ ] Keep the roadmap item open until the installer passes this checklist on a
  real Windows machine.
