#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
TAURI_CLI="$FRONTEND_DIR/node_modules/.bin/tauri"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS."
  exit 1
fi

TARGET_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
case "$TARGET_TRIPLE" in
  aarch64-apple-darwin|x86_64-apple-darwin) ;;
  *)
    echo "Unsupported macOS Rust host target: $TARGET_TRIPLE"
    exit 1
    ;;
esac

# Use an ad-hoc identity for test artifacts unless a Developer ID identity is
# explicitly supplied by the release environment.
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:--}"

echo "==> Building Drop Den for macOS"
echo "Target triple: $TARGET_TRIPLE"

if [[ "${SKIP_DEPENDENCY_INSTALL:-0}" != "1" ]]; then
  echo "==> Installing frontend dependencies"
  cd "$FRONTEND_DIR"
  yarn install --frozen-lockfile
fi

echo "==> Preparing native backend sidecar"
cd "$ROOT_DIR"
TARGET_TRIPLE="$TARGET_TRIPLE" "$ROOT_DIR/scripts/prepare-tauri-sidecar.sh"

if [[ ! -x "$TAURI_CLI" ]]; then
  echo "Tauri CLI is missing at $TAURI_CLI."
  echo "Install frontend dependencies first."
  exit 1
fi

echo "==> Building macOS DMG"
cd "$ROOT_DIR"
"$TAURI_CLI" build

echo
echo "Drop Den macOS build complete."
echo "DMG output: $ROOT_DIR/src-tauri/target/release/bundle/dmg"
