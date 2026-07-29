#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
OPERIUM_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="${OPERIUM_WORKSPACE_MANIFEST:-$OPERIUM_ROOT/profiles/workspace.fracta-coding.v1.tsv}"
WORKSPACE_ROOT="${OPERIUM_WORKSPACE_ROOT:-/srv/cogentia/repos}"
DRY_RUN=0

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
elif [[ $# -gt 0 ]]; then
  echo "usage: $0 [--dry-run]" >&2
  exit 2
fi

[[ -f "$MANIFEST" ]] || { echo "manifest missing: $MANIFEST" >&2; exit 1; }
mkdir -p "$WORKSPACE_ROOT"

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    printf 'DRY-RUN'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

ok=0
failed=0

while IFS=$'\t' read -r name remote branch extra; do
  [[ -z "${name:-}" || "$name" == \#* ]] && continue
  [[ -z "${extra:-}" ]] || { echo "invalid manifest row for $name" >&2; exit 1; }
  target="$WORKSPACE_ROOT/$name"

  if [[ ! -e "$target" ]]; then
    run git clone --origin origin "$remote" "$target"
  elif [[ ! -d "$target/.git" ]]; then
    echo "REFUSE $name: target exists and is not a Git worktree" >&2
    failed=$((failed + 1))
    continue
  fi

  run git -C "$target" fetch origin --prune
  if [[ $DRY_RUN -eq 0 ]] && ! git -C "$target" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    echo "WARN $name: resume hint origin/$branch is missing" >&2
    failed=$((failed + 1))
    continue
  fi
  current="$(git -C "$target" branch --show-current)"
  dirty="$(git -C "$target" status --porcelain | wc -l)"
  printf 'OK %s current=%s dirty=%s resume_hint=%s\n' "$name" "$current" "$dirty" "$branch"
  ok=$((ok + 1))
done < "$MANIFEST"

printf 'workspace=%s ok=%d failed=%d dry_run=%d\n' \
  "$WORKSPACE_ROOT" "$ok" "$failed" "$DRY_RUN"
[[ $failed -eq 0 ]]
