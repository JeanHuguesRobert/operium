#!/usr/bin/env bash
set -euo pipefail

AUTHORITY="${OPERIUM_SECRET_AUTHORITY:-$HOME/tweesic/inseme/.env}"
CODING_ENV="${OPERIUM_CODING_ENV:-$HOME/.config/cogentia/secrets/coding.env}"
MAGISTRAL_ENV="${OPERIUM_MAGISTRAL_ENV:-/etc/cogentia/magistral.env}"
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

coding_keys=(
  COGENTIA_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY ZAI_API_KEY
  GEMINI_API_KEY GITHUB_TOKEN OPENROUTER_API_KEY CONTEXT7_API_KEY
  BRAVE_SEARCH_API_KEY MISTRAL_API_KEY
)
magistral_keys=(
  COGENTIA_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY ZAI_API_KEY
  GEMINI_API_KEY OPENROUTER_API_KEY MISTRAL_API_KEY
)

extract_env() {
  local output="$1"
  shift
  python3 - "$AUTHORITY" "$output" "$@" <<'PY'
import os
import pathlib
import sys
import tempfile

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
wanted = set(sys.argv[3:])
found = {}
for raw in source.read_text(encoding="utf-8-sig").splitlines():
    if not raw or raw.lstrip().startswith("#") or "=" not in raw:
        continue
    key, value = raw.split("=", 1)
    key = key.strip()
    if key in wanted:
        found[key] = value
missing = sorted(wanted - found.keys())
if missing:
    raise SystemExit("missing required keys: " + ",".join(missing))
target.parent.mkdir(parents=True, exist_ok=True)
fd, tmp_name = tempfile.mkstemp(prefix=target.name + ".", dir=target.parent)
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("# Generated from the inseme/.env authority by Operium. Do not edit.\n")
        for key in sorted(found):
            handle.write(f"{key}={found[key]}\n")
    os.chmod(tmp_name, 0o600)
    os.replace(tmp_name, target)
finally:
    if os.path.exists(tmp_name):
        os.unlink(tmp_name)
PY
}

if [[ $DRY_RUN -eq 1 ]]; then
  printf 'authority=%s mode=%s coding_target=%s coding_keys=%d magistral_target=%s magistral_keys=%d\n' \
    "$AUTHORITY" "$mode" "$CODING_ENV" "${#coding_keys[@]}" "$MAGISTRAL_ENV" "${#magistral_keys[@]}"
  exit 0
fi

mkdir -p "$(dirname "$CODING_ENV")"
chmod 700 "$(dirname "$CODING_ENV")"
extract_env "$CODING_ENV" "${coding_keys[@]}"
chmod 600 "$CODING_ENV"

tmp_magistral="$(mktemp)"
trap 'rm -f "$tmp_magistral"' EXIT
extract_env "$tmp_magistral" "${magistral_keys[@]}"
sudo install -o root -g ubuntu -m 0640 "$tmp_magistral" "$MAGISTRAL_ENV"

printf 'authority_mode=%s coding_mode=%s coding_keys=%d magistral_mode=%s magistral_keys=%d\n' \
  "$mode" "$(stat -c '%a' "$CODING_ENV")" "${#coding_keys[@]}" \
  "$(stat -c '%a' "$MAGISTRAL_ENV")" "${#magistral_keys[@]}"
