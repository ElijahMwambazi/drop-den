#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Building Drop Den frontend"
cd "$ROOT_DIR/frontend"

if command -v yarn >/dev/null 2>&1 && [[ -f yarn.lock ]]; then
  yarn install --frozen-lockfile
  yarn build
elif command -v yarn >/dev/null 2>&1; then
  yarn install
  yarn build
else
  npm install
  npm run build
fi

echo "==> Building Drop Den backend release binary"
cd "$ROOT_DIR/backend"
cargo build --release

echo
echo "Packaged build complete."
echo "Backend binary:"
echo "$ROOT_DIR/backend/target/release/drop-den-backend"
echo
echo "Run with:"
echo "$ROOT_DIR/scripts/run-packaged.sh"