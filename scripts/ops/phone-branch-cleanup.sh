#!/usr/bin/env bash
# One-shot branch hygiene for poco-jhr (mirror PC main-only policy).
# Run on the phone:
#   bash phone-branch-cleanup.sh
# Or from workstation:
#   scp ... && ssh poco-jhr bash phone-branch-cleanup.sh
set -euo pipefail

REPOS="${CORPUS_REPOS:-$HOME/srv/cogentia/repos}"
WORK="$HOME/srv/cogentia/work/branch-cleanup-2026-07-29"
mkdir -p "$WORK"
LOG="$WORK/cleanup.log"
: >"$LOG"
log() { echo "$@" | tee -a "$LOG"; }

log "START $(date -Iseconds 2>/dev/null || date)"
log "REPOS=$REPOS"

# --- Preserve potentially unique WIP before discard ---
if [ -d "$REPOS/registre-mariani/.git" ]; then
  cd "$REPOS/registre-mariani"
  git format-patch -1 wip/fractanet-android-node --stdout \
    >"$WORK/registre-mariani-wip-fractanet-android-node.patch" 2>/dev/null || true
  git diff origin/main wip/fractanet-android-node -- operium/registry/resources.yaml \
    >"$WORK/registre-resources-wip-vs-main.diff" 2>/dev/null || true
  log "Saved registre patches under $WORK"
fi

if [ -d "$REPOS/cogentia/.git" ]; then
  cd "$REPOS/cogentia"
  git format-patch -1 wip/fractanet-android-node --stdout \
    >"$WORK/cogentia-wip-fractanet-android-node.patch" 2>/dev/null || true
  log "Saved cogentia WIP patch (forensics; main supersedes gateway)"
fi

if [ -d "$REPOS/operium/.git" ]; then
  cd "$REPOS/operium"
  git format-patch -1 wip/fractanet-android-node --stdout \
    >"$WORK/operium-wip-fractanet-android-node.patch" 2>/dev/null || true
  # Discard shell profile dirt (already on origin/main)
  git reset --hard HEAD
  git clean -fd -- profiles/shell/ 2>/dev/null || true
  log "operium working tree cleaned"
fi

# --- Per-repo: prune, checkout default, ff-only, delete other locals ---
for d in "$REPOS"/*/; do
  [ -d "$d/.git" ] || continue
  name=$(basename "$d")
  cd "$d" || continue

  def=main
  if git show-ref --verify --quiet refs/remotes/origin/main 2>/dev/null \
    || git ls-remote --heads origin main 2>/dev/null | grep -q .; then
    def=main
  elif git show-ref --verify --quiet refs/remotes/origin/master 2>/dev/null; then
    def=master
  elif git show-ref --verify --quiet refs/heads/master 2>/dev/null; then
    def=master
  fi

  log "---- $name (default=$def) ----"
  git fetch --prune origin 2>&1 | tail -8 | tee -a "$LOG" || log "WARN fetch $name"
  git fetch origin "$def" 2>&1 | tail -3 | tee -a "$LOG" || true

  if ! git checkout "$def" 2>&1 | tee -a "$LOG"; then
    log "FAIL checkout $def on $name — skip deletes"
    continue
  fi

  if git pull --ff-only origin "$def" 2>&1 | tee -a "$LOG"; then
    log "OK ff-only $name"
  else
    log "WARN pull not ff-only $name"
  fi

  for b in $(git branch --format='%(refname:short)'); do
    if [ "$b" = "$def" ]; then continue; fi
    if git branch -D "$b" 2>&1 | tee -a "$LOG"; then
      log "deleted local $name/$b"
    else
      log "FAIL delete $name/$b"
    fi
  done

  locals=$(git branch --format='%(refname:short)' | tr '\n' ' ')
  head=$(git rev-parse --abbrev-ref HEAD)
  short=$(git rev-parse --short HEAD)
  dirty=$(git status --porcelain | wc -l | tr -d ' ')
  log "STATE $name HEAD=$head@$short locals=[$locals] dirty=$dirty"
done

log "==== SUMMARY ===="
for d in "$REPOS"/*/; do
  [ -d "$d/.git" ] || continue
  name=$(basename "$d")
  cd "$d" || continue
  head=$(git rev-parse --abbrev-ref HEAD)
  locals=$(git branch --format='%(refname:short)' | tr '\n' ',')
  remotes=$(git branch -r --format='%(refname:short)' | grep -v HEAD | grep -v dependabot | tr '\n' ',' || true)
  dirty=$(git status --porcelain | wc -l | tr -d ' ')
  log "$name | HEAD=$head | locals=$locals | remotes(non-dependabot)=$remotes | dirty=$dirty"
done
log "DONE patches in $WORK"
