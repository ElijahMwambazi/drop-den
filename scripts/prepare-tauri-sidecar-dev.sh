#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"

BACKEND_BINARY="$ROOT_DIR/backend/target/debug/drop-den-backend"
SIDECAR_DIR="$ROOT_DIR/src-tauri/binaries"
SIDECAR_BINARY="$SIDECAR_DIR/drop-den-backend-$TARGET_TRIPLE"

echo "==> Preparing Drop Den Tauri dev sidecar"
echo "Target triple: $TARGET_TRIPLE"

echo "==> Building backend debug binary"
cd "$ROOT_DIR/backend"
cargo build

echo "==> Copying backend debug binary to Tauri sidecar location"
mkdir -p "$SIDECAR_DIR"
cp "$BACKEND_BINARY" "$SIDECAR_BINARY"
chmod +x "$SIDECAR_BINARY"

echo
echo "Dev sidecar ready:"
echo "$SIDECAR_BINARY"