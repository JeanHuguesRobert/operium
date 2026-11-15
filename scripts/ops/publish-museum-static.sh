#!/usr/bin/env bash
# Museum Mariani des Possibles — one-host, source-pinned static publication.
# Target: museum.baronsmariani.org only. No aliases, NS, MX, or unrelated vhosts.
set -Eeuo pipefail

HOST='museum.baronsmariani.org'
ORIGIN='fracta.fractavolta.com'
SITE='/srv/www/musee'
HTTP_FILE='/etc/caddy/Caddyfile.d/museum.caddy'
HTTPS_FILE='/etc/caddy/fracta2-edge-https/museum-tls.caddy'
CADDY='/etc/caddy/Caddyfile'
REV='3487f3d4e3c504d5044355dc39bd75323e3bb0ec'
MODE='check'
FILES=(index.html book.html magazine.html boutique.html annexes.html contribuer.html mentions.html styles.css)

usage() { echo 'Usage: publish-museum-static.sh [--check|--apply]'; }
if [[ ${1:-} == '--apply' && $# == 1 ]]; then MODE='apply'
elif [[ $# == 0 || ( ${1:-} == '--check' && $# == 1 ) ]]; then MODE='check'
else usage >&2; exit 2; fi

command -v curl >/dev/null && command -v caddy >/dev/null && command -v dig >/dev/null || {
  echo 'BLOCKED: required curl/caddy/dig missing' >&2; exit 2;
}
[[ -f "$CADDY" ]] || { echo 'BLOCKED: missing Caddyfile' >&2; exit 2; }
[[ -d '/etc/caddy/Caddyfile.d' && -d '/etc/caddy/fracta2-edge-https' ]] || {
  echo 'BLOCKED: expected Caddy import directories missing' >&2; exit 2;
}
dns_target="$(dig +short @viddy.ns.cloudflare.com "$HOST" CNAME | sed -n '1p' | sed 's/[.]$//')"
[[ "$dns_target" == "$ORIGIN" ]] || { echo "BLOCKED: authoritative DNS conflict or absent target ($dns_target)" >&2; exit 2; }

tmp="$(mktemp -d /tmp/museum-publish.XXXXXXXX)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/site"
for item in "${FILES[@]}"; do
  url="https://raw.githubusercontent.com/JeanHuguesRobert/barons-Mariani/$REV/projects/musee/site/$item"
  curl --fail --silent --show-error --location --retry 2 --max-time 15 "$url" -o "$tmp/site/$item"
  [[ -s "$tmp/site/$item" ]] || { echo "BLOCKED: empty source $item" >&2; exit 2; }
done
for item in "${FILES[@]}"; do
  if [[ "$item" == *.html ]]; then
    grep -iq '<!doctype html>' "$tmp/site/$item" || { echo "BLOCKED: invalid HTML $item" >&2; exit 2; }
    grep -q 'href="boutique.html"' "$tmp/site/$item" || { echo "BLOCKED: missing Boutique navigation in $item" >&2; exit 2; }
  fi
done
grep -q "https://$HOST/boutique.html" "$tmp/site/boutique.html" || {
  echo 'BLOCKED: wrong Boutique canonical URL' >&2; exit 2;
}

cat >"$tmp/http.caddy" <<EOF
http://$HOST {
    root * $SITE/current
    encode zstd gzip
    file_server
}
EOF
cat >"$tmp/https.caddy" <<EOF
https://$HOST {
    root * $SITE/current
    encode zstd gzip
    file_server
}
EOF

# Preserve a live museum deployment instead of silently replacing any changed
# Caddy policy. This tool provisions a new canonical host, not a generic admin.
for spec in "$HTTP_FILE:$tmp/http.caddy" "$HTTPS_FILE:$tmp/https.caddy"; do
  destination="${spec%%:*}"; source="${spec#*:}"
  if [[ -e "$destination" ]] && ! cmp -s "$destination" "$source"; then
    echo "BLOCKED: existing Museum Caddy config differs: $destination" >&2; exit 2
  fi
done
if [[ -e "$SITE/current" && ! -L "$SITE/current" ]]; then
  echo 'BLOCKED: current exists but is not a symlink' >&2; exit 2
fi
if [[ -e "$SITE/releases/$REV" ]]; then
  for item in "${FILES[@]}"; do
    cmp -s "$tmp/site/$item" "$SITE/releases/$REV/$item" || {
      echo "BLOCKED: immutable release content conflict: $item" >&2; exit 2;
    }
  done
fi

if [[ "$MODE" == check ]]; then
  echo "PREFLIGHT=PASS HOST=$HOST REV=$REV DNS_ONLY=true RELEASE_FILES=${#FILES[@]} ROOT_REQUIRED_FOR_APPLY=true"
  exit 0
fi
[[ "$(id -u)" == 0 ]] || { echo 'BLOCKED: root required for this Caddy/publication change' >&2; exit 3; }

oldlink=''
if [[ -L "$SITE/current" ]]; then oldlink="$(readlink "$SITE/current")"; fi
made_http=0; made_https=0; switched=0
rollback() {
  local code="$?"
  trap - ERR
  if [[ "$switched" == 1 ]]; then
    if [[ -n "$oldlink" ]]; then
      ln -s "$oldlink" "$SITE/current.rollback"
      mv -Tf "$SITE/current.rollback" "$SITE/current"
    else rm -f "$SITE/current"; fi
  fi
  if [[ "$made_http" == 1 ]]; then rm -f "$HTTP_FILE"; fi
  if [[ "$made_https" == 1 ]]; then rm -f "$HTTPS_FILE"; fi
  caddy validate --config "$CADDY" >/dev/null 2>&1 && systemctl reload caddy >/dev/null 2>&1 || true
  echo "ROLLED_BACK: museum publication failed (exit $code); previous Caddy vhosts preserved" >&2
  exit "$code"
}
trap rollback ERR

install -d -m 0755 "$SITE/releases"
if [[ ! -d "$SITE/releases/$REV" ]]; then
  install -d -m 0755 "$SITE/releases/$REV"
  for item in "${FILES[@]}"; do install -m 0644 "$tmp/site/$item" "$SITE/releases/$REV/$item"; done
fi
if [[ ! -e "$HTTP_FILE" ]]; then install -m 0644 "$tmp/http.caddy" "$HTTP_FILE"; made_http=1; fi
if [[ ! -e "$HTTPS_FILE" ]]; then install -m 0644 "$tmp/https.caddy" "$HTTPS_FILE"; made_https=1; fi
if [[ "$oldlink" != "releases/$REV" ]]; then
  ln -s "releases/$REV" "$SITE/current.next"
  mv -Tf "$SITE/current.next" "$SITE/current"
  switched=1
fi
caddy validate --config "$CADDY" >/dev/null
systemctl reload caddy
status="$(curl --silent --show-error --max-time 10 --output "$tmp/response" --write-out '%{http_code}' --header "Host: $HOST" http://127.0.0.1/)"
[[ "$status" == '200' ]] && grep -q 'Musée Mariani' "$tmp/response" || {
  echo "BLOCKED: Museum local HTTP failed code=$status" >&2; false;
}
status_boutique="$(curl --silent --show-error --max-time 10 --output "$tmp/response" --write-out '%{http_code}' --header "Host: $HOST" http://127.0.0.1/boutique.html)"
[[ "$status_boutique" == '200' ]] && grep -q 'Boutique' "$tmp/response" || {
  echo "BLOCKED: Museum Boutique local HTTP failed code=$status_boutique" >&2; false;
}
trap - ERR
echo "PUBLISHED: $HOST REV=$REV FILES=${#FILES[@]} HTTP=200 BOUTIQUE_HTTP=200 CADDY=RELOADED"
echo 'NOTE: TLS issuance is asynchronous; verify public HTTPS separately.'
