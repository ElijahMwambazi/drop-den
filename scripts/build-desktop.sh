#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Building Drop Den Desktop"

echo "==> Installing frontend dependencies"
cd "$ROOT_DIR/frontend"
yarn install --frozen-lockfile

echo "==> Building frontend"
yarn build

echo "==> Preparing Tauri backend sidecar"
cd "$ROOT_DIR"
"$ROOT_DIR/scripts/prepare-tauri-sidecar.sh"

echo "==> Building Tauri desktop app"
cd "$ROOT_DIR"
"$ROOT_DIR/frontend/node_modules/.bin/tauri" build

echo
echo "Drop Den Desktop build complete."
echo
echo "Build artifacts are usually under:"
echo "$ROOT_DIR/src-tauri/target/release/bundle"