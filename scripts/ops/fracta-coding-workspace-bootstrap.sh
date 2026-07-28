#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
OPERIUM_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="${OPERIUM_WORKSPACE_MANIFEST:-$OPERIUM_ROOT/profiles/workspace.fracta-coding.v1.tsv}"
WORKSPACE_ROOT="${OPERIUM_WORKSPACE_ROOT:-$HOME/tweesic}"
DRY_RUN=0

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
elif [[ $# -gt 0 ]]; then
  echo "usage: $0 [--dry-run]" >&2
  exit 2
fi

[[ -f "$MANIFEST" ]] || { echo "manifest missing: $MANIFEST" >&2; exit 1; }
mkdir -p "$WORKSPACE_ROOT"
chmod 700 "$WORKSPACE_ROOT"

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
skipped=0
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

  if [[ $DRY_RUN -eq 1 && ! -d "$target/.git" ]]; then
    run git -C "$target" fetch origin --prune
    run git -C "$target" switch --track -c "$branch" "origin/$branch"
    ok=$((ok + 1))
    continue
  fi

  if [[ -n "$(git -C "$target" status --porcelain)" ]]; then
    echo "SKIP $name: dirty worktree"
    skipped=$((skipped + 1))
    continue
  fi

  run git -C "$target" fetch origin --prune
  if git -C "$target" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    if git -C "$target" show-ref --verify --quiet "refs/heads/$branch"; then
      run git -C "$target" switch "$branch"
    else
      run git -C "$target" switch --track -c "$branch" "origin/$branch"
    fi
    run git -C "$target" merge --ff-only "origin/$branch"
    ok=$((ok + 1))
  else
    echo "REFUSE $name: origin/$branch is missing" >&2
    failed=$((failed + 1))
  fi
done < "$MANIFEST"

printf 'workspace=%s ok=%d skipped=%d failed=%d dry_run=%d\n' \
  "$WORKSPACE_ROOT" "$ok" "$skipped" "$failed" "$DRY_RUN"
[[ $failed -eq 0 ]]
