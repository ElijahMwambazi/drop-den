#!/usr/bin/env bash
set -euo pipefail

if command -v podman >/dev/null 2>&1; then
  CONTAINER_ENGINE="podman"
elif command -v docker >/dev/null 2>&1; then
  CONTAINER_ENGINE="docker"
else
  echo "Podman or Docker is required to stop the mobile HTTPS test proxy."
  exit 1
fi

"$CONTAINER_ENGINE" rm -f drop-den-mobile-https >/dev/null 2>&1 || true
echo "Drop Den mobile HTTPS test proxy stopped."
