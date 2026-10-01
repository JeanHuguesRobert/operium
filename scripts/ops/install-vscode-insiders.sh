#!/usr/bin/env bash
set -euo pipefail

# Install Microsoft Visual Studio Code Insiders from the official apt repo.
# Desktop workspaces only; kiosk mode does not launch an IDE.
# Supports amd64 and arm64. Does not install Google Chrome.

usage() {
  cat <<'EOF'
Usage:
  install-vscode-insiders.sh [--dry-run]

Adds packages.microsoft.com if missing, then apt-installs code-insiders.
EOF
}

dry_run=false
while (($#)); do
  case "$1" in
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
  esac
done

arch="$(dpkg --print-architecture 2>/dev/null || uname -m)"
case "$arch" in
  amd64|arm64|armhf|x86_64|aarch64) ;;
  *) echo "unsupported architecture: ${arch}" >&2; exit 69 ;;
esac

if command -v code-insiders >/dev/null 2>&1; then
  echo "already installed: $(command -v code-insiders)"
  code-insiders --version 2>/dev/null | head -n 3 || true
  exit 0
fi

if "$dry_run"; then
  echo "[plan] add Microsoft VS Code apt source if missing"
  echo "[plan] apt-get install -y code-insiders"
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root (for example: sudo $0)" >&2
  exit 77
fi

export DEBIAN_FRONTEND=noninteractive
apt-get install -y wget gpg ca-certificates apt-transport-https
install -d -m 0755 /usr/share/keyrings
if [[ ! -f /usr/share/keyrings/microsoft.gpg ]]; then
  wget -qO- https://packages.microsoft.com/keys/microsoft.asc \
    | gpg --dearmor -o /usr/share/keyrings/microsoft.gpg
  chmod 644 /usr/share/keyrings/microsoft.gpg
fi
if [[ ! -f /etc/apt/sources.list.d/vscode.sources && ! -f /etc/apt/sources.list.d/vscode.list ]]; then
  cat > /etc/apt/sources.list.d/vscode.sources <<'EOF'
Types: deb
URIs: https://packages.microsoft.com/repos/code
Suites: stable
Components: main
Architectures: amd64,arm64,armhf
Signed-By: /usr/share/keyrings/microsoft.gpg
EOF
fi
apt-get update -y
apt-get install -y code-insiders
command -v code-insiders
code-insiders --version 2>/dev/null | head -n 3 || true
