# Desktop troubleshooting checklist

Use this checklist when the Tauri desktop app fails to start, cannot reach its backend, or behaves differently between development and an installed RPM.

## Capture diagnostics first

- [ ] Open **Desktop settings → Diagnostics**.
- [ ] Confirm the backend indicator is online.
- [ ] Click **Check again**.
- [ ] Click **Copy report** and keep the report with the bug notes.
- [ ] Record whether the problem occurs in development mode, an unpackaged release build, or an installed RPM.

## Development preflight

- [ ] Confirm Rust, Node.js, Yarn, and the Tauri system libraries are installed.
- [ ] Confirm no stale desktop backend owns port `18080`:

  ```bash
  ss -ltnp | grep 18080
  ```

- [ ] Build the frontend independently:

  ```bash
  cd frontend
  yarn build
  ```

- [ ] Build and copy the current debug sidecar:

  ```bash
  ./scripts/prepare-tauri-sidecar-dev.sh
  ```

- [ ] Start the fast desktop workflow:

  ```bash
  cd frontend
  yarn desktop:dev:fast
  ```

- [ ] Confirm `http://127.0.0.1:18080/api/health` responds after startup.
- [ ] Confirm the titlebar reload button refreshes the WebView without orphaning the backend.
- [ ] Confirm native drag/drop accepts a small test file.

## Development cleanup

Use these steps only after closing the desktop app normally.

- [ ] Stop stale Drop Den development processes if port `18080` remains occupied:

  ```bash
  pkill -f drop-den-backend
  pkill -f drop-den-desktop
  ```

- [ ] Start the desktop workflow again before deleting any data.
- [ ] If a clean development identity is required, remove only the temporary development directory documented for the active workflow.
- [ ] Do not delete a configured custom transfer folder unless its files are intentionally disposable.

## Sidecar checks

- [ ] Rebuild the sidecar after every backend route or behavior change.
- [ ] Confirm the sidecar name includes the current Rust host target:

  ```bash
  rustc -vV
  ls -l src-tauri/binaries
  ```

- [ ] Confirm the copied sidecar is executable.
- [ ] If the UI reports `404` or `405` for a newly added endpoint, rebuild the sidecar and restart the desktop app.
- [ ] If the backend stays online after the window closes, stop the orphan once and verify the Tauri exit/restart path owns the replacement process.

## Storage and database checks

- [ ] Open the data and transfers folders from Desktop Settings.
- [ ] Confirm the configured transfer directory exists and is writable.
- [ ] Check Diagnostics for **Safe fallback**, which means the custom folder was unavailable at startup.
- [ ] After changing the transfer folder, restart from the in-app action before testing new uploads.
- [ ] Remember that changing the folder does not move existing transfer files.
- [ ] Do not manually edit or remove the SQLite database while the backend is running.

## Window and WebView checks

- [ ] Verify the transparent window has no rectangular root background.
- [ ] Test rounded edges under the active Linux compositor; X11 and Wayland can render transparency differently.
- [ ] Confirm the custom titlebar can drag, minimize, maximize, reload, and close the window.
- [ ] Confirm the main content scrolls while the titlebar and footer remain visible.
- [ ] If the footer or other desktop-only UI is missing in development, verify runtime detection sees `window.__TAURI_INTERNALS__`; the dev URL uses `http://localhost` rather than the packaged `tauri:` protocol.

## Release and RPM preflight

- [ ] Start from a clean source checkout with intended changes committed.
- [ ] Run the combined desktop check:

  ```bash
  ./scripts/check-desktop.sh
  ```

- [ ] Build the desktop bundle:

  ```bash
  ./scripts/build-desktop.sh
  ```

- [ ] Confirm artifacts exist under `src-tauri/target/release/bundle/`.
- [ ] Test the release binary before installing the RPM.
- [ ] Install the RPM on a clean test account or machine.
- [ ] Confirm first-run host registration, PIN display, upload, download, messages, tray actions, diagnostics, and clean quit.
- [ ] Confirm closing or resetting the app does not leave port `18080` occupied.
- [ ] Confirm user data survives a normal application upgrade.

## Symptom guide

| Symptom | First check | Likely action |
| --- | --- | --- |
| Backend did not become ready | Port `18080` and Diagnostics | Stop a stale process, rebuild the sidecar, restart |
| New endpoint returns `404`/`405` | Sidecar build timestamp | Run the sidecar preparation script again |
| Window closes but backend remains | Process list and port `18080` | Stop the orphan and verify the managed restart path |
| Custom storage falls back | Diagnostics and folder permissions | Select a writable folder or restore the default |
| Native file drop does nothing | Tauri runtime and frontend toast | Reload once, then inspect the copied diagnostics report |
| Rounded window shows a rectangle | Root backgrounds and compositor | Verify desktop-runtime transparency and compositor support |
| Desktop-only UI is missing in dev | Tauri internals detection | Do not rely only on the `tauri:` URL protocol |
| Host controls disappear | Current local device identity | Use host recovery/reset rather than clearing host storage manually |

## Escalation information

When reporting a desktop problem, include:

- copied Diagnostics report;
- development, release binary, or installed RPM mode;
- Linux distribution and desktop session (X11 or Wayland);
- exact command used to start or build Drop Den;
- relevant terminal output;
- whether port `18080` remains occupied after the app exits;
- whether the default or a custom transfer directory is active.
