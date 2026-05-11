#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_BIN="$ROOT_DIR/backend/target/release/drop-den-backend"

DROP_DEN_MODE="${DROP_DEN_MODE:-packaged}"
DROP_DEN_PORT="${DROP_DEN_PORT:-8080}"
DROP_DEN_PUBLIC_NAME="${DROP_DEN_PUBLIC_NAME:-drop-den.local}"

if [[ ! -x "$BACKEND_BIN" ]]; then
  echo "Drop Den release binary not found."
  echo "Run this first:"
  echo "$ROOT_DIR/scripts/build-packaged.sh"
  exit 1
fi

if [[ ! -d "$ROOT_DIR/frontend/dist" ]]; then
  echo "Frontend dist folder not found."
  echo "Run this first:"
  echo "$ROOT_DIR/scripts/build-packaged.sh"
  exit 1
fi

echo "==> Starting Drop Den in packaged mode"
echo "Mode:        $DROP_DEN_MODE"
echo "Port:        $DROP_DEN_PORT"
echo "Public name: $DROP_DEN_PUBLIC_NAME"
echo
echo "Open locally:"
echo "http://localhost:$DROP_DEN_PORT"
echo
echo "Open from another device:"
echo "http://<host-lan-ip>:$DROP_DEN_PORT"
echo
echo "Friendly local name, if configured on your network:"
echo "http://$DROP_DEN_PUBLIC_NAME:$DROP_DEN_PORT"
echo

cd "$ROOT_DIR/backend"

DROP_DEN_MODE="$DROP_DEN_MODE" \
DROP_DEN_PORT="$DROP_DEN_PORT" \
DROP_DEN_PUBLIC_NAME="$DROP_DEN_PUBLIC_NAME" \
"$BACKEND_BIN"