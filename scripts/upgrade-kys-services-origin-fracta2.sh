#!/usr/bin/env bash
# Operium #76: immutable KYS release upgrade on Fracta2.
# Dry-run unless --apply, which requires a separately authorized root operator.
set -Eeuo pipefail
if (( $# < 1 || $# > 2 )); then
  echo "usage: bash $0 <40-char-cogentia-commit-sha> [--apply]" >&2; exit 2
fi
SHA="$1"
MODE=check
if (( $# == 2 )); then MODE="$2"; fi
[[ "$SHA" =~ ^[0-9a-f]{40}$ && ( "$MODE" == check || "$MODE" == --apply ) ]] || exit 2
ROOT=/srv/www/kys-services
STAGE="/srv/cogentia/kys-services-staging/releases/$SHA"
MANIFEST="$STAGE.sha256"
TARGET="$ROOT/releases/$SHA"
CADDY=/etc/caddy/fracta2-edge-https/services.caddy
SITE=https://services.acorsica.org

[[ -d "$STAGE" && -s "$STAGE/index.html" && -s "$STAGE/kys-services.json" ]] || {
  echo "BLOCKED: staging build absent or incomplete: $STAGE" >&2; exit 2;
}
[[ -s "$STAGE/services/serenia-rsa.json" && -s "$STAGE/services/kys-snapshot.json" ]] || {
  echo "BLOCKED: KYS manifests absent" >&2; exit 2;
}
[[ -s "$MANIFEST" ]] || { echo "BLOCKED: stage checksums missing" >&2; exit 2; }
[[ ! -e "$STAGE/.git" ]] || { echo "BLOCKED: unexpected git directory" >&2; exit 2; }
if find "$STAGE" -type l -print -quit | grep -q .; then
  echo "BLOCKED: symlink found inside public artifact" >&2; exit 2
fi
(cd "$STAGE" && sha256sum --status --check "$MANIFEST") || {
  echo "BLOCKED: stage checksum mismatch" >&2; exit 2;
}
JS=$(grep -Eo 'src="/assets/index-[[:alnum:]_-]+[.]js"' "$STAGE/index.html" | head -1 | cut -d '"' -f2)
CSS=$(grep -Eo 'href="/assets/index-[[:alnum:]_-]+[.]css"' "$STAGE/index.html" | head -1 | cut -d '"' -f2)
[[ -n "$JS" && -n "$CSS" && -s "$STAGE$JS" && -s "$STAGE$CSS" ]] || {
  echo "BLOCKED: missing root-bound assets" >&2; exit 2;
}
[[ -s "$CADDY" ]] && grep -Fq "root * $ROOT/current" "$CADDY" || {
  echo "BLOCKED: Caddy root has changed; inspect before deployment" >&2; exit 2;
}
[[ -L "$ROOT/current" ]] || { echo "BLOCKED: current must be a symlink" >&2; exit 2; }
OLD=$(readlink "$ROOT/current")
[[ "$OLD" == releases/* && -d "$ROOT/$OLD" ]] || {
  echo "BLOCKED: current symlink does not target a valid release" >&2; exit 2;
}
if [[ -e "$TARGET" ]]; then
  diff -qr "$STAGE" "$TARGET" >/dev/null || {
    echo "BLOCKED: immutable release collision" >&2; exit 2;
  }
fi
echo "PLAN: source=$STAGE commit=$SHA release=$TARGET"
echo "PLAN: current=$OLD next=releases/$SHA rollback=$OLD"
if [[ "$MODE" == check ]]; then
  echo "PREFLIGHT_OK; no live state changed. Explicitly authorized root --apply required."
  exit 0
fi
[[ "$EUID" == 0 ]] || { echo "BLOCKED: root operator required" >&2; exit 3; }

new_release=0
switched=0
rollback() {
  local code=$?
  trap - ERR
  if [[ "$switched" == 1 ]]; then
    ln -s "$OLD" "$ROOT/.current-rollback.$$"
    mv -Tf "$ROOT/.current-rollback.$$" "$ROOT/current"
    echo "ROLLED_BACK: publication pointer restored to $OLD" >&2
  fi
  if [[ "$new_release" == 1 ]]; then
    echo "NOTICE: staged release remains at $TARGET for inspection; not live" >&2
  fi
  exit "$code"
}
trap rollback ERR
if [[ ! -d "$TARGET" ]]; then
  install -d -m 0755 "$TARGET"
  new_release=1
  cp -a "$STAGE/." "$TARGET/"
  chmod -R u=rwX,go=rX "$TARGET"
  diff -qr "$STAGE" "$TARGET" >/dev/null
fi
if [[ "$OLD" != "releases/$SHA" ]]; then
  ln -s "releases/$SHA" "$ROOT/.current-next.$$"
  mv -Tf "$ROOT/.current-next.$$" "$ROOT/current"
  switched=1
fi

# Caddy follows the current symlink per request; no reload or route alteration.
index=$(mktemp)
trap 'rm -f "$index"' EXIT
curl -fsS --max-time 12 --resolve services.acorsica.org:443:127.0.0.1 "$SITE/" -o "$index"
grep -Fq "$JS" "$index" || { echo "FAIL: new index not served" >&2; false; }
for route in "$JS" "$CSS" /services /rights /kys-services.json /services/serenia-rsa.json /3code/api/health; do
  code=$(curl --silent --show-error --max-time 12 --resolve services.acorsica.org:443:127.0.0.1 -o /dev/null -w '%{http_code}' "$SITE$route")
  [[ "$code" == 200 ]] || { echo "FAIL: $route status $code" >&2; false; }
done
for route in /api/process-analysis /assets/cogentigram-asset-not-found.js; do
  code=$(curl --silent --show-error --max-time 12 --resolve services.acorsica.org:443:127.0.0.1 -o /dev/null -w '%{http_code}' "$SITE$route")
  [[ "$code" == 404 ]] || { echo "FAIL: $route expected 404, got $code" >&2; false; }
done
trap - ERR
echo "PUBLISHED: $SITE commit=$SHA; external Chromium browser smoke remains separate."
