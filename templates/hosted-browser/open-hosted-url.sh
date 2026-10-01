#!/usr/bin/env bash
# Open a URL in this workspace's hosted browser profile (Brave/Chromium).
set -euo pipefail
url="${1:-}"
if [[ -z "$url" || ! "$url" =~ ^https?:// ]]; then
  echo "usage: open-hosted-url.sh http(s)://..." >&2
  exit 64
fi
bin="${HOSTED_BROWSER_BINARY:-}"
if [[ -z "$bin" || ! -x "$bin" ]]; then
  for candidate in /usr/bin/brave-browser /usr/bin/chromium-browser /usr/bin/chromium; do
    if [[ -x "$candidate" ]]; then bin="$candidate"; break; fi
  done
fi
[[ -n "$bin" ]] || { echo "no hosted browser binary" >&2; exit 69; }
profile="${HOSTED_BROWSER_PROFILE_DIR:-${HOME}/.hosted-browser/chromium-profile}"
exec "$bin" --user-data-dir="$profile" --new-window "$url"
