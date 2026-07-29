#!/usr/bin/env bash
# Install / refresh Operium fracta shell profile for the current user (ubuntu).
# Run on fracta after operium repo is current:
#   bash /srv/cogentia/repos/operium/profiles/shell/install-fracta-vps-shell-profile.sh
# Or from a workstation with trust perimeter:
#   ssh fracta 'bash /srv/cogentia/repos/operium/profiles/shell/install-fracta-vps-shell-profile.sh'
set -euo pipefail

PROFILE_SRC="$(cd "$(dirname "$0")" && pwd)/fracta-vps.profile.sh"
MARKER_BEGIN="# BEGIN operium-fracta-shell-profile"
MARKER_END="# END operium-fracta-shell-profile"
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
# Managed by Operium — do not edit by hand; re-run install-fracta-vps-shell-profile.sh
if [ -f "$PROFILE_SRC" ]; then
  # shellcheck source=/dev/null
  . "$PROFILE_SRC"
fi
$MARKER_END
EOF
)

if grep -qF "$MARKER_BEGIN" "$BASHRC" 2>/dev/null; then
  # Replace existing block
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
echo "test: bash -lc 'echo REG=\$COGENTIA_REGISTRY; type cogentia; type operium'"
