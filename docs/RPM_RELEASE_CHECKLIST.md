# RPM release checklist

Use this checklist for every Drop Den Linux desktop RPM candidate. Complete it on the target distribution and keep the resulting artifact details with the release notes.

## 1. Release scope and version

- [ ] Confirm the intended changes are committed and the working tree is clean.
- [ ] Review the commits since the previous RPM release.
- [ ] Confirm the release version matches in:
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `frontend/package.json`
- [ ] Confirm `src-tauri/Cargo.lock` and `frontend/yarn.lock` are committed.
- [ ] Write short release notes covering new behavior, fixes, known limitations, and data-migration expectations.
- [ ] Confirm the Tauri bundle target is still `rpm` and the identifier is `com.dropden.desktop`.

## 2. Clean build preparation

- [ ] Close Drop Den normally and confirm port `18080` is released:

  ```bash
  ss -ltnp | grep 18080
  ```

- [ ] Preserve any user data needed for upgrade testing.
- [ ] Remove previous packages and build outputs without deleting app data:

  ```bash
  ./scripts/clean-desktop-rpm.sh
  ```

- [ ] Use `--clear-data` only for a deliberate first-install test:

  ```bash
  ./scripts/clean-desktop-rpm.sh --clear-data
  ```

- [ ] Confirm Rust uses the intended stable toolchain and target:

  ```bash
  rustc --version
  rustc -vV
  cargo --version
  ```

- [ ] Confirm Node.js and Yarn versions:

  ```bash
  node --version
  yarn --version
  ```

## 3. Verification build

- [ ] Run the combined desktop check:

  ```bash
  ./scripts/check-desktop.sh
  ```

- [ ] Confirm the frontend build completes without TypeScript errors.
- [ ] Confirm the release backend sidecar builds for the current Rust host target.
- [ ] Confirm the Tauri shell check completes.
- [ ] Run backend tests:

  ```bash
  cd backend
  cargo test
  ```

## 4. Build the RPM

- [ ] Build from the repository root:

  ```bash
  ./scripts/build-desktop.sh
  ```

- [ ] Confirm the build used `yarn install --frozen-lockfile`.
- [ ] Confirm the release sidecar was regenerated, copied under `src-tauri/binaries/`, and marked executable.
- [ ] Confirm the RPM exists under:

  ```text
  src-tauri/target/release/bundle/rpm/
  ```

- [ ] Record the RPM filename and size.
- [ ] Inspect package metadata and file contents:

  ```bash
  rpm -qpi src-tauri/target/release/bundle/rpm/*.rpm
  rpm -qpl src-tauri/target/release/bundle/rpm/*.rpm
  ```

- [ ] Confirm the package version, architecture, application binary, desktop entry, icon, frontend resources, and backend sidecar are present.
- [ ] Generate a checksum:

  ```bash
  sha256sum src-tauri/target/release/bundle/rpm/*.rpm
  ```

## 5. Clean installation test

- [ ] Test on a clean user account or representative clean machine.
- [ ] Install the candidate RPM:

  ```bash
  sudo dnf install ./src-tauri/target/release/bundle/rpm/*.rpm
  ```

- [ ] Launch Drop Den from the desktop application menu.
- [ ] Confirm only one backend owns port `18080`.
- [ ] Confirm the transparent rounded window, custom titlebar, footer, tray icon, and compact layout render correctly.
- [ ] Confirm the app creates its managed data directory and SQLite database.
- [ ] Register the first device and confirm it becomes host.
- [ ] Confirm the host can reveal the PIN and open the QR invite dialog.

## 6. Functional smoke test

- [ ] Join a second browser/device using the current PIN.
- [ ] Confirm the PIN rotates after a successful join.
- [ ] Upload a small file through the picker.
- [ ] Upload a small file through native desktop drag/drop.
- [ ] Upload multiple files and observe progress.
- [ ] Send a targeted transfer and test accept/reject behavior.
- [ ] Preview supported image, video, and audio files.
- [ ] Download one transfer and Download ZIP.
- [ ] Confirm transfer search, filter, sort, progressive expansion, and deletion work.
- [ ] Send and receive a local message.
- [ ] Remove a joined device as host.
- [ ] Test copy URL and open-folder actions.
- [ ] Copy a Diagnostics report and confirm its paths and backend state are accurate.
- [ ] Restart the backend from an in-app storage action and confirm the window remains open.
- [ ] Quit from the titlebar and tray, then confirm port `18080` is released.

## 7. Storage and recovery test

- [ ] Select a writable custom transfer folder and restart in place.
- [ ] Confirm new uploads use the selected folder.
- [ ] Confirm existing transfers remain accessible from their recorded paths.
- [ ] Make the custom folder unavailable and confirm Drop Den reports safe fallback storage.
- [ ] Restore the default folder.
- [ ] Test Reset host and reclaim the host identity.
- [ ] Test Full desktop reset with typed confirmation.
- [ ] Confirm full reset clears managed data, restores defaults, restarts the backend, and does not orphan a process.

## 8. Upgrade test

- [ ] Install the previous released RPM and create representative devices, messages, transfers, and settings.
- [ ] Install the new candidate RPM as an upgrade without clearing data.
- [ ] Confirm host identity and registered devices remain valid.
- [ ] Confirm messages, transfer metadata, stored files, and desktop settings remain available.
- [ ] Confirm the database opens without migration or startup errors.
- [ ] Repeat the functional smoke test for the upgraded installation.

## 9. Uninstall and reinstall test

- [ ] Remove the RPM through the package manager.
- [ ] Confirm application binaries, desktop entry, icons, and bundled sidecar are removed.
- [ ] Confirm user data remains unless explicitly removed by the user.
- [ ] Confirm no Drop Den process or port listener remains.
- [ ] Reinstall the same RPM and confirm preserved data is usable.
- [ ] Run `./scripts/clean-desktop-rpm.sh --clear-data` only when validating a complete local cleanup.

## 10. Release evidence

- [ ] Record the Git commit SHA used for the build.
- [ ] Record the build OS, architecture, Rust version, Node.js version, and Yarn version.
- [ ] Save the RPM filename, size, and SHA-256 checksum.
- [ ] Save the completed smoke-test result and copied Diagnostics report.
- [ ] Document known compositor-specific transparency behavior for X11 or Wayland.
- [ ] Confirm there are no release-blocking failures or unexplained warnings.
- [ ] Attach the RPM, checksum, and release notes to the release destination.

## Release blockers

Do not publish the RPM if any of these occur:

- the backend sidecar fails to start or remains running after normal quit;
- port `18080` conflicts with an orphaned Drop Den process;
- a normal upgrade loses or resets user data;
- host recovery or full reset leaves the app unusable;
- uploads write outside the configured transfer directory;
- targeted transfers can be accessed by an unauthorized device;
- required frontend resources or the backend sidecar are missing from the RPM;
- the installed app cannot complete the core send, receive, message, and quit smoke test.
