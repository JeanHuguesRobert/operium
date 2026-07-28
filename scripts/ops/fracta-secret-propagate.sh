#!/usr/bin/env bash
set -euo pipefail

REPOS_ROOT="${OPERIUM_WORKSPACE_ROOT:-/srv/cogentia/repos}"
AUTHORITY="${OPERIUM_SECRET_AUTHORITY:-$REPOS_ROOT/inseme/.env}"
MAGISTRAL_DROPIN="${OPERIUM_MAGISTRAL_DROPIN:-/etc/systemd/system/magistral.service.d/inseme-authority.conf}"
DRY_RUN=0

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
elif [[ $# -gt 0 ]]; then
  echo "usage: $0 [--dry-run]" >&2
  exit 2
fi

[[ -f "$AUTHORITY" ]] || { echo "authority missing: $AUTHORITY" >&2; exit 1; }
mode="$(stat -c '%a' "$AUTHORITY")"
[[ "$mode" == "600" ]] || { echo "authority must have mode 600, got $mode" >&2; exit 1; }

consumers=(cogentia operium survey ubikia)

if [[ $DRY_RUN -eq 1 ]]; then
  printf 'authority=%s mode=%s consumers=%s magistral_target=%s\n' \
    "$AUTHORITY" "$mode" "${consumers[*]}" "$MAGISTRAL_DROPIN"
  exit 0
fi

for repo in "${consumers[@]}"; do
  [[ -d "$REPOS_ROOT/$repo" ]] || continue
  ln -sfn ../inseme/.env "$REPOS_ROOT/$repo/.env"
  printf 'linked=%s/.env\n' "$REPOS_ROOT/$repo"
done

sudo install -d -o root -g root -m 0755 "$(dirname "$MAGISTRAL_DROPIN")"
printf '[Service]\nEnvironmentFile=%s\n' "$AUTHORITY" \
  | sudo tee "$MAGISTRAL_DROPIN" >/dev/null
sudo chmod 0644 "$MAGISTRAL_DROPIN"
sudo systemctl daemon-reload

printf 'authority_mode=%s authority_owner=%s magistral_dropin=%s\n' \
  "$mode" "$(stat -c '%U:%G' "$AUTHORITY")" "$MAGISTRAL_DROPIN"
