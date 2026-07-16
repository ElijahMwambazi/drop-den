#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
TAURI_BIN_DIR="$ROOT_DIR/src-tauri/binaries"

TARGET_TRIPLE="${TARGET_TRIPLE:-$(rustc -vV | sed -n 's/^host: //p')}"

if [[ -z "$TARGET_TRIPLE" ]]; then
  echo "Could not detect Rust target triple."
  echo "Set it manually, for example:"
  echo "TARGET_TRIPLE=x86_64-unknown-linux-gnu ./scripts/prepare-tauri-sidecar.sh"
  exit 1
fi

BINARY_SUFFIX=""
if [[ "$TARGET_TRIPLE" == *windows* ]]; then
  BINARY_SUFFIX=".exe"
fi

BACKEND_BIN="$BACKEND_DIR/target/release/drop-den-backend$BINARY_SUFFIX"
SIDECAR_BIN="$TAURI_BIN_DIR/drop-den-backend-$TARGET_TRIPLE$BINARY_SUFFIX"

echo "==> Preparing Drop Den Tauri sidecar"
echo "Target triple: $TARGET_TRIPLE"

echo "==> Building backend release binary"
cd "$BACKEND_DIR"
cargo build --release

if [[ ! -f "$BACKEND_BIN" ]]; then
  echo "Backend build did not produce the expected binary:"
  echo "$BACKEND_BIN"
  exit 1
fi

echo "==> Copying backend binary to Tauri sidecar location"
mkdir -p "$TAURI_BIN_DIR"
cp "$BACKEND_BIN" "$SIDECAR_BIN"
if [[ "$BINARY_SUFFIX" != ".exe" ]]; then
  chmod +x "$SIDECAR_BIN"
fi

echo
echo "Sidecar ready:"
echo "$SIDECAR_BIN"
echo
echo "Run desktop dev mode with:"
echo "frontend/node_modules/.bin/tauri dev"
