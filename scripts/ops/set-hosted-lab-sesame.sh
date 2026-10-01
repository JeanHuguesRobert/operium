#!/usr/bin/env bash
set -euo pipefail
# Lab-only: set Kasm HTTP Basic and classic VNC passwd to the same short password.
# Not a security boundary.

unix_user="${1:?usage: set-hosted-lab-sesame.sh hosted-NAME [password]}"
password="${2:-sesame}"
home_dir="/home/${unix_user}"
kasm_user="${unix_user#hosted-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root" >&2
  exit 77
fi
id -u "$unix_user" >/dev/null

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
if ! printf '%s\n%s\n' "$password" "$password" | vncpasswd -u "$kasm_user" -w "$tmp"; then
  echo "vncpasswd failed" >&2
  exit 70
fi
install -o "$unix_user" -g "$unix_user" -m 0600 "$tmp" "${home_dir}/.kasmpasswd"

sudo -u "$unix_user" x11vnc -storepasswd "$password" "${home_dir}/.vnc/passwd" >/dev/null
chmod 600 "${home_dir}/.vnc/passwd"
chown "$unix_user:$unix_user" "${home_dir}/.vnc/passwd"

printf 'Wrote %s and %s for HTTP user %s\n' \
  "${home_dir}/.kasmpasswd" "${home_dir}/.vnc/passwd" "$kasm_user"
