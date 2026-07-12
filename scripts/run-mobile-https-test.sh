#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${DROP_DEN_HTTPS_RUNTIME_DIR:-$ROOT_DIR/.mobile-https}"
HTTPS_HOST="${DROP_DEN_HTTPS_HOST:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
HTTPS_PORT="${DROP_DEN_HTTPS_PORT:-8443}"
UPSTREAM="${DROP_DEN_HTTPS_UPSTREAM:-127.0.0.1:18080}"
CONTAINER_NAME="drop-den-mobile-https"

if [[ -z "$HTTPS_HOST" ]]; then
  echo "Could not detect a LAN IP address."
  echo "Set DROP_DEN_HTTPS_HOST to the host address visible from Android."
  exit 1
fi

if command -v podman >/dev/null 2>&1; then
  CONTAINER_ENGINE="podman"
elif command -v docker >/dev/null 2>&1; then
  CONTAINER_ENGINE="docker"
else
  echo "Podman or Docker is required for the mobile HTTPS test proxy."
  exit 1
fi

mkdir -p "$RUNTIME_DIR/data" "$RUNTIME_DIR/config"

"$CONTAINER_ENGINE" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "==> Starting Drop Den mobile HTTPS test proxy"
echo "HTTPS URL: https://$HTTPS_HOST:$HTTPS_PORT"
echo "Upstream:  http://$UPSTREAM"

"$CONTAINER_ENGINE" run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  -e DROP_DEN_HTTPS_HOST="$HTTPS_HOST" \
  -e DROP_DEN_HTTPS_PORT="$HTTPS_PORT" \
  -e DROP_DEN_UPSTREAM="$UPSTREAM" \
  -v "$ROOT_DIR/packaging/mobile-https/Caddyfile:/etc/caddy/Caddyfile:ro,Z" \
  -v "$RUNTIME_DIR/data:/data:Z" \
  -v "$RUNTIME_DIR/config:/config:Z" \
  docker.io/library/caddy:2

ROOT_CERT="$RUNTIME_DIR/data/caddy/pki/authorities/local/root.crt"

for _ in $(seq 1 30); do
  if [[ -f "$ROOT_CERT" ]]; then
    break
  fi
  sleep 0.25
done

echo
echo "Proxy started."
echo "Android URL: https://$HTTPS_HOST:$HTTPS_PORT"
echo "Root CA:     $ROOT_CERT"
echo
echo "The Drop Den backend must be running at http://$UPSTREAM."
echo "Enter the full https:// URL. Using http:// with port $HTTPS_PORT causes a protocol error."
echo "Install the generated root CA only on a dedicated test device, then remove it after testing."
