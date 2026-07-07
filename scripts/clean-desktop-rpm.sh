#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CLEAR_DATA=0

for arg in "$@"; do
  case "$arg" in
    --clear-data)
      CLEAR_DATA=1
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  ./scripts/clean-desktop-rpm.sh [--clear-data]

What it does:
  - Stops Drop Den desktop/backend processes
  - Removes installed Drop Den RPM packages if found
  - Removes frontend/dist
  - Removes src-tauri/target
  - Removes generated Tauri sidecar binaries
  - Optionally removes desktop app data with --clear-data

Examples:
  ./scripts/clean-desktop-rpm.sh
  ./scripts/clean-desktop-rpm.sh --clear-data
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Run with --help for usage."
      exit 1
      ;;
  esac
done

echo "==> Stopping Drop Den processes if running..."

pkill -f drop-den-backend 2>/dev/null || true
pkill -f drop-den-desktop 2>/dev/null || true
pkill -f "Drop Den" 2>/dev/null || true

echo "==> Looking for installed Drop Den RPM packages..."

mapfile -t PACKAGES < <(rpm -qa | grep -Ei 'drop[-_ ]?den|drop-den-desktop' || true)

if [ "${#PACKAGES[@]}" -gt 0 ]; then
  echo "Found installed package(s):"
  printf '  %s\n' "${PACKAGES[@]}"

  echo "==> Removing installed RPM package(s)..."
  sudo dnf remove -y "${PACKAGES[@]}"
else
  echo "No installed Drop Den RPM package found."
fi

echo "==> Removing build outputs..."

rm -rf "$ROOT_DIR/frontend/dist"
rm -rf "$ROOT_DIR/src-tauri/target"
rm -rf "$ROOT_DIR/src-tauri/binaries/drop-den-backend-"*

# Keep icons and source files.
# Keep node_modules and Cargo.lock for faster rebuilds.

if [ "$CLEAR_DATA" -eq 1 ]; then
  echo "==> Removing desktop app data..."

  rm -rf "$HOME/.local/share/com.dropden.desktop"
  rm -rf "$HOME/.local/share/com.dropden.app"
  rm -rf "$HOME/.local/share/Drop Den"
  rm -rf "$HOME/.config/com.dropden.desktop"
  rm -rf "$HOME/.config/com.dropden.app"

  echo "Desktop app data removed."
else
  echo "==> Skipping desktop app data."
  echo "Run with --clear-data to remove saved devices, host state, transfers, and SQLite database."
fi

echo "==> Done."