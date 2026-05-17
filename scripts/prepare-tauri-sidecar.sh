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

BACKEND_BIN="$BACKEND_DIR/target/release/drop-den-backend"
SIDECAR_BIN="$TAURI_BIN_DIR/drop-den-backend-$TARGET_TRIPLE"

echo "==> Preparing Drop Den Tauri sidecar"
echo "Target triple: $TARGET_TRIPLE"

echo "==> Building backend release binary"
cd "$BACKEND_DIR"
cargo build --release

echo "==> Copying backend binary to Tauri sidecar location"
mkdir -p "$TAURI_BIN_DIR"
cp "$BACKEND_BIN" "$SIDECAR_BIN"
chmod +x "$SIDECAR_BIN"

echo
echo "Sidecar ready:"
echo "$SIDECAR_BIN"
echo
echo "Run desktop dev mode with:"
echo "frontend/node_modules/.bin/tauri dev"