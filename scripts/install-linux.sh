#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run this installer with sudo:"
  echo "sudo ./scripts/install-linux.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SUDO_USER_HOME=""
if [[ -n "${SUDO_USER:-}" ]]; then
  SUDO_USER_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
fi

USER_CARGO_BIN="$SUDO_USER_HOME/.cargo/bin/cargo"

SERVICE_USER="drop-den"
SERVICE_GROUP="drop-den"
INSTALL_BIN="/usr/local/bin/drop-den"
CONFIG_DIR="/etc/drop-den"
CONFIG_FILE="$CONFIG_DIR/drop-den.env"
DATA_DIR="/var/lib/drop-den"
STORAGE_DIR="$DATA_DIR/transfers"
DATABASE_PATH="$DATA_DIR/drop-den.sqlite"
SERVICE_FILE="/etc/systemd/system/drop-den.service"
SHARE_DIR="/usr/local/share/drop-den"
FRONTEND_DIST_DIR="$SHARE_DIR/frontend/dist"

DROP_DEN_PORT="${DROP_DEN_PORT:-8080}"
DROP_DEN_PUBLIC_NAME="${DROP_DEN_PUBLIC_NAME:-drop-den.local}"

echo "==> Building Drop Den"

if [[ -z "${SUDO_USER:-}" ]]; then
  echo "Could not determine the original sudo user."
  echo "Build manually first:"
  echo "./scripts/build-packaged.sh"
  exit 1
fi

run_as_user() {
  sudo -u "$SUDO_USER" \
    HOME="$SUDO_USER_HOME" \
    PATH="$SUDO_USER_HOME/.cargo/bin:$PATH" \
    "$@"
}

echo "Building as user: $SUDO_USER"

cd "$ROOT_DIR/frontend"

if run_as_user bash -lc 'command -v yarn >/dev/null 2>&1' && [[ -f yarn.lock ]]; then
  run_as_user yarn install --frozen-lockfile
  run_as_user yarn build
elif run_as_user bash -lc 'command -v yarn >/dev/null 2>&1'; then
  run_as_user yarn install
  run_as_user yarn build
else
  run_as_user npm install
  run_as_user npm run build
fi

cd "$ROOT_DIR/backend"

if [[ ! -x "$USER_CARGO_BIN" ]]; then
  echo "cargo not found at: $USER_CARGO_BIN"
  echo "Install Rust for your user, or run:"
  echo "rustup default stable"
  exit 1
fi

run_as_user "$USER_CARGO_BIN" build --release

echo "==> Creating service user"
if ! getent group "$SERVICE_GROUP" >/dev/null; then
  groupadd --system "$SERVICE_GROUP"
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd \
    --system \
    --gid "$SERVICE_GROUP" \
    --home-dir "$DATA_DIR" \
    --shell /usr/sbin/nologin \
    "$SERVICE_USER"
fi

echo "==> Installing binary"
install -m 0755 "$ROOT_DIR/backend/target/release/drop-den-backend" "$INSTALL_BIN"

echo "==> Installing frontend assets"
rm -rf "$FRONTEND_DIST_DIR"
install -d -m 0755 "$FRONTEND_DIST_DIR"
cp -R "$ROOT_DIR/frontend/dist/." "$FRONTEND_DIST_DIR/"

echo "==> Creating data directories"
install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$DATA_DIR"
install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$STORAGE_DIR"

echo "==> Creating config"
install -d -m 0755 "$CONFIG_DIR"

cat > "$CONFIG_FILE" <<EOF
DROP_DEN_MODE=packaged
DROP_DEN_PORT=$DROP_DEN_PORT
DROP_DEN_PUBLIC_NAME=$DROP_DEN_PUBLIC_NAME
DROP_DEN_DATA_DIR=$DATA_DIR
DROP_DEN_DATABASE_PATH=$DATABASE_PATH
DROP_DEN_STORAGE_DIR=$STORAGE_DIR
DROP_DEN_FRONTEND_DIST=$FRONTEND_DIST_DIR
EOF

chmod 0644 "$CONFIG_FILE"

echo "==> Installing systemd service"
install -m 0644 "$ROOT_DIR/packaging/drop-den.service" "$SERVICE_FILE"

echo "==> Reloading systemd"
systemctl daemon-reload

echo "==> Enabling and starting Drop Den"
systemctl enable --now drop-den.service

echo
echo "Drop Den installed and started."
echo
echo "Check status:"
echo "systemctl status drop-den"
echo
echo "Open locally:"
echo "http://localhost:$DROP_DEN_PORT"
echo
echo "Open from another device:"
echo "http://<host-lan-ip>:$DROP_DEN_PORT"
echo
echo "Friendly local name, if configured:"
echo "http://$DROP_DEN_PUBLIC_NAME:$DROP_DEN_PORT"