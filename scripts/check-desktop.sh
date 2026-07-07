#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

cd frontend
yarn build
cd ..

./scripts/prepare-tauri-sidecar.sh

cd src-tauri
cargo check