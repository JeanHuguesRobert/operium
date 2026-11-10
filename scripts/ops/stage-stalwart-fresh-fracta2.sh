#!/usr/bin/env bash
# Install pinned fresh Stalwart binary but leave all mail listeners OFF.
# Must NOT replace Caddy port 443, import old data, or send external mail.
set -Eeuo pipefail
source_script=/srv/cogentia/work/stalwart-bootstrap-20261110/install-v1.1.0.sh
expected=16c5176379e5917b54b885e30ad9cf1f359100be31241b9345d8d0ec76c00771
[[ -s "$source_script" ]] || { echo 'MISSING verified pinned installer'; exit 2; }
printf '%s  %s\n' "$expected" "$source_script" | sha256sum -c --status || { echo 'REFUSE: installer hash changed'; exit 2; }
sh -n "$source_script"
for d in /etc/stalwart/config.json /var/lib/stalwart; do
  [[ ! -e "$d" ]] || { echo "REFUSE: existing mail state $d"; exit 2; }
done
[[ $(systemctl is-active caddy) == active ]] || { echo 'REFUSE: Caddy not running'; exit 2; }
[[ $(curl -sS -m 5 -o /dev/null -w '%{http_code}' https://browser.fractavolta.com/) == 401 ]] || { echo 'REFUSE: hosted browser not healthy'; exit 2; }
if [[ "${1:-}" != --apply ]]; then
  echo 'PREFLIGHT_OK: pinned Stalwart v1.1.0 installer verified; mail installation not started'; exit 0
fi
[[ $# -eq 1 && $(id -u) -eq 0 ]] || { echo 'USAGE: sudo bash stage-stalwart-fresh-fracta2.sh --apply'; exit 2; }
# Disable the resulting unit even when install fails or receives a signal.
stop_mail() { systemctl disable --now stalwart.service >/dev/null 2>&1 || true; }
trap stop_mail EXIT
# Installer writes a temporary admin password to restricted local journald.
# Do not print that secret in the conversational output.
sh "$source_script"
stop_mail
[[ $(systemctl is-active stalwart.service || true) == inactive ]] || { echo 'ERROR: mail daemon not stopped'; exit 3; }
[[ $(systemctl is-active caddy) == active ]] || { echo 'ERROR: Caddy changed during bootstrap'; exit 3; }
[[ $(curl -sS -m 5 -o /dev/null -w '%{http_code}' https://browser.fractavolta.com/) == 401 ]] || { echo 'ERROR: browser regression'; exit 3; }
[[ $(ss -ltn | grep -Ec ':(25|465|993|8080)[[:space:]]') -eq 0 ]] || { echo 'ERROR: unwanted mail listener'; exit 3; }
echo 'STAGED: Stalwart v1.1.0 installed but disabled/stopped. No mail service active; Caddy/browser OK. Configure safe listeners before enabling.'
