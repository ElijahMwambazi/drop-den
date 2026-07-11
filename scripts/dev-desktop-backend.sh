#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DROP_DEN_DEV_DATA_DIR:-/tmp/drop-den-dev}"

mkdir -p "$DATA_DIR/transfers"

cd "$ROOT_DIR/backend"

DROP_DEN_MODE=desktop \
DROP_DEN_PORT=18080 \
DROP_DEN_PUBLIC_NAME=127.0.0.1 \
DROP_DEN_DATA_DIR="$DATA_DIR" \
DROP_DEN_STORAGE_DIR="$DATA_DIR/transfers" \
DROP_DEN_DATABASE_PATH="$DATA_DIR/drop-den.sqlite" \
cargo run