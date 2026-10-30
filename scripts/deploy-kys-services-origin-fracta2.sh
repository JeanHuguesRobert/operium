#!/usr/bin/env bash
# KYS Services origin deployment on fracta2. Operium owns deployments.
# Dry-run by default. Must be executed by an authorized root operator with --apply.
set -euo pipefail

SITE=services.acorsica.org
SRC=/srv/cogentia/kys-services-staging/source/apps/personal/dist
REPO=/srv/cogentia/kys-services-staging/source
ROOT=/srv/www/kys-services
CADDY_SITE=/etc/caddy/Caddyfile.d/kys-services.caddy
APPLY=0
if [[ "${1:-}" == --apply && $# == 1 ]]; then APPLY=1
elif (( $# )); then echo "usage: $0 [--apply]" >&2; exit 2
fi

[[ -f "$SRC/index.html" && -f "$SRC/kys-services.json" &&
   -f "$SRC/services/serenia-rsa.json" ]] || {
  echo "BLOCKED: incomplete Vite release artifact"; exit 2;
}
SHA="$(git -C "$REPO" rev-parse HEAD)"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
TARGET="$ROOT/releases/$SHA"
cat <<EOF
PLAN:
  source:  $SRC
  commit:  $SHA
  release: $TARGET
  route:   $CADDY_SITE
  public:  requires separate Fracta TLS proxy + DNS
EOF
if (( ! APPLY )); then
  echo "DRY-RUN only; nothing changed."
  exit 0
fi
(( EUID == 0 )) || { echo "BLOCKED: --apply requires root rights"; exit 2; }
[[ ! -e "$CADDY_SITE" ]] || { echo "BLOCKED: Caddy site already exists; inspect before modifying"; exit 2; }
[[ ! -e "$TARGET" ]] || { echo "BLOCKED: immutable release already exists; inspect before modifying"; exit 2; }
[[ ! -e "$ROOT/current" && ! -L "$ROOT/current" ]] || {
  echo "BLOCKED: existing publication; use versioned upgrade procedure"; exit 2;
}

install -d -m 0755 "$ROOT/releases"
cp -a "$SRC" "$TARGET"
chmod -R u=rwX,go=rX "$TARGET"
cat > "$CADDY_SITE" <<'EOF'
http://services.acorsica.org {
    root * /srv/www/kys-services/current
    encode zstd gzip

    @api path /api/*
    handle @api {
        respond "No backend API configured" 404
    }

    @static path /assets/* /services/*.json /kys-services.json
    handle @static {
        file_server
    }

    handle {
        try_files {path} /index.html
        file_server
    }
}
EOF

# Validate the combined configuration before touching any running listener.
if ! caddy validate --config /etc/caddy/Caddyfile >/dev/null; then
  rm -f "$CADDY_SITE"
  rm -rf "$TARGET"
  echo "FAIL: Caddy syntax validation; reverted unserved files" >&2
  exit 1
fi

ln -s "releases/$SHA" "$ROOT/.current-new"
mv -Tf "$ROOT/.current-new" "$ROOT/current"
if ! systemctl reload caddy; then
  rm -f "$CADDY_SITE" "$ROOT/current"
  caddy validate --config /etc/caddy/Caddyfile >/dev/null || true
  systemctl reload caddy || true
  echo "FAIL: reload; removed new route and release pointer" >&2
  exit 1
fi

for route in / /services /rights /kys-services.json /services/serenia-rsa.json; do
  result="$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' \
    -H "Host: $SITE" "http://127.0.0.1$route")"
  if [[ "$result" != 200 ]]; then
    echo "FAIL origin $route HTTP $result; inspect before rollback" >&2
    exit 1
  fi
done
for route in /api/process-analysis /assets/not-found.js; do
  result="$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' \
    -H "Host: $SITE" "http://127.0.0.1$route")"
  [[ "$result" == 404 ]] || {
    echo "FAIL expected 404 for $route, got $result" >&2; exit 1;
  }
done

echo "PASS: Fracta2 Caddy origin route serves commit $SHA"
echo "NEXT: configure Fracta edge HTTPS hostname, issue certificate and verify end to end."
