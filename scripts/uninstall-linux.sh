#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run this uninstaller with sudo:"
  echo "sudo ./scripts/uninstall-linux.sh"
  exit 1
fi

SERVICE_USER="drop-den"
SERVICE_GROUP="drop-den"
INSTALL_BIN="/usr/local/bin/drop-den"
CONFIG_DIR="/etc/drop-den"
SERVICE_FILE="/etc/systemd/system/drop-den.service"
SHARE_DIR="/usr/local/share/drop-den"

echo "==> Stopping Drop Den service"
systemctl disable --now drop-den.service 2>/dev/null || true

echo "==> Removing systemd service"
rm -f "$SERVICE_FILE"
systemctl daemon-reload

echo "==> Removing binary"
rm -f "$INSTALL_BIN"

echo "==> Removing shared frontend assets"
rm -rf "$SHARE_DIR"

echo "==> Removing config"
rm -rf "$CONFIG_DIR"

echo
echo "Drop Den service removed."
echo
echo "Data was not deleted:"
echo "/var/lib/drop-den"
echo
echo "To remove saved data manually, run:"
echo "sudo rm -rf /var/lib/drop-den"
echo

if id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Service user still exists: $SERVICE_USER"
  echo "To remove it manually:"
  echo "sudo userdel $SERVICE_USER"
fi

if getent group "$SERVICE_GROUP" >/dev/null; then
  echo "Service group still exists: $SERVICE_GROUP"
  echo "To remove it manually:"
  echo "sudo groupdel $SERVICE_GROUP"
fi