#!/usr/bin/env bash
# Deploy the Cogentia HTTP service-identity surface on Fracta. Run ON Fracta.
# The app repository remains the source of service code; Operium owns this
# controlled operational procedure. No secrets are read or printed.
set -euo pipefail

COGENTIA_ROOT="${COGENTIA_ROOT:-/srv/cogentia/repos/cogentia}"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      echo "usage: $0 [--dry-run]"
      exit 0
      ;;
    *)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

test -d "$COGENTIA_ROOT/.git" || {
  echo "COGENTIA_ROOT is not a Git checkout: $COGENTIA_ROOT" >&2
  exit 2
}

if [[ -n "$(git -C "$COGENTIA_ROOT" status --porcelain --untracked-files=no)" ]]; then
  echo "REFUSE_TRACKED_COGENTIA_CHECKOUT" >&2
  exit 2
fi

echo "COGENTIA_ROOT=$COGENTIA_ROOT"
echo "DRY_RUN=$DRY_RUN"

if [[ "$DRY_RUN" -eq 1 ]]; then
  git -C "$COGENTIA_ROOT" fetch origin main
  echo "current=$(git -C "$COGENTIA_ROOT" rev-parse --short HEAD)"
  echo "origin_main=$(git -C "$COGENTIA_ROOT" rev-parse --short origin/main)"
  echo "would_restart=fracta-guide-stack"
  echo "would_verify=/service-info on context and guide"
  echo "DRY_RUN_OK"
  exit 0
fi

git -C "$COGENTIA_ROOT" pull --ff-only origin main
sudo bash "$COGENTIA_ROOT/scripts/ops/fracta-guide-stack.sh" restart

assert_service_info() {
  local url="$1"
  local expected_server="$2"
  local expected_id="$3"
  local headers body
  headers="$(mktemp)"
  body="$(mktemp)"
  trap 'rm -f "$headers" "$body"' RETURN
  curl -fsS -m 30 -D "$headers" -o "$body" "$url/service-info"
  grep -qi "^Server: $expected_server" "$headers"
  grep -Fqi 'Link: </service-info>; rel="describedby"; type="application/json"' "$headers"
  grep -Fq '"id":"'"$expected_id"'"' "$body"
  curl -fsSI -m 30 "$url/service-info" | grep -qi "^Server: $expected_server"
  rm -f "$headers" "$body"
  trap - RETURN
  echo "SERVICE_INFO_OK $expected_id"
}

assert_service_info "http://127.0.0.1:8790" "Cogentia-Context" "cogentia-context"
assert_service_info "http://127.0.0.1:8791" "Cogentia-Guide" "cogentia-guide"
echo "APPLY_OK"
