#!/usr/bin/env bash
# Install / refresh Operium Termux shell profile for the current user.
# Run on the phone after operium shell files are present, e.g.:
#   bash $HOME/srv/cogentia/repos/operium/profiles/shell/install-termux-shell-profile.sh
# From a workstation with mesh trust:
#   ssh poco-jhr 'bash $HOME/srv/cogentia/repos/operium/profiles/shell/install-termux-shell-profile.sh'
set -euo pipefail

PROFILE_SRC="$(cd "$(dirname "$0")" && pwd)/termux-android.profile.sh"
MARKER_BEGIN="# BEGIN operium-termux-shell-profile"
MARKER_END="# END operium-termux-shell-profile"
BASHRC="${HOME}/.bashrc"

if [ ! -f "$PROFILE_SRC" ]; then
  echo "missing profile: $PROFILE_SRC" >&2
  exit 1
fi

if [ ! -f "$BASHRC" ]; then
  touch "$BASHRC"
fi

block=$(cat <<EOF
$MARKER_BEGIN
# Managed by Operium — do not edit by hand; re-run install-termux-shell-profile.sh
if [ -f "$PROFILE_SRC" ]; then
  # shellcheck source=/dev/null
  . "$PROFILE_SRC"
fi
$MARKER_END
EOF
)

if grep -qF "$MARKER_BEGIN" "$BASHRC" 2>/dev/null; then
  tmp="$(mktemp)"
  awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
    $0 == begin { skip=1; next }
    $0 == end { skip=0; next }
    !skip { print }
  ' "$BASHRC" >"$tmp"
  printf '%s\n' "$block" >>"$tmp"
  mv "$tmp" "$BASHRC"
  echo "updated block in $BASHRC"
else
  printf '\n%s\n' "$block" >>"$BASHRC"
  echo "appended block to $BASHRC"
fi

echo "profile source: $PROFILE_SRC"
echo "test: bash -ic 'echo REG=\$COGENTIA_REGISTRY; type cogentia; type operium; type tweesic'"
