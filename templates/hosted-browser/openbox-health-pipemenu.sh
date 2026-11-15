#!/usr/bin/env bash
# Openbox pipe menu: one-shot machine + Fractanet health snapshot.
# No secrets. Timeouts stay short so the right-click menu does not stall.

set -u
export LC_ALL=C

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'
}

item() {
  local label="$1" cmd="$2"
  printf '  <item label="%s"><action name="Execute"><command>%s</command></action></item>\n' \
    "$(xml_escape "$label")" "$(xml_escape "$cmd")"
}

term() {
  local title="$1" inner="$2"
  local emul
  emul="$(command -v terminator 2>/dev/null || command -v x-terminal-emulator 2>/dev/null || command -v xterm 2>/dev/null || echo xterm)"
  if [[ "$(basename "$emul")" == terminator ]]; then
    printf '%s -T %q -e bash -lc %q' "$emul" "$title" "${inner}; echo; read -n 1 -s -r -p 'Fermer: une touche...' "
  else
    printf '%s -T %q -e bash -lc %q' "$emul" "$title" "${inner}; echo; read -n 1 -s -r -p 'Fermer: une touche...' "
  fi
}

host="$(hostname -s 2>/dev/null || hostname)"
load="$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || echo '?')"
mem="$(free -m 2>/dev/null | awk '/^Mem:/ {printf "%d/%d MiB", $3, $2}')"
ona="ONA ?"
ona_json="$(curl -fsS --max-time 2 http://127.0.0.1:8794/health 2>/dev/null || true)"
if [[ "$ona_json" == *'"ok":true'* || "$ona_json" == *'"ok": true'* ]]; then
  ona="ONA ok"
else
  ona="ONA down"
fi

ts_line="Tailscale ?"
if command -v tailscale >/dev/null 2>&1; then
  ts_self="$(tailscale status --self 2>/dev/null | head -n 1 || true)"
  ts_up="$(tailscale status 2>/dev/null | awk 'NR>1 && $0 !~ /^#/ && $NF ~ /active|idle|online/ {c++} END {print c+0}')"
  if [[ -n "$ts_self" ]]; then
    ts_line="Tailscale $(echo "$ts_self" | awk '{print $1, $NF}') peers~${ts_up}"
  fi
fi

sup_line="navigateur: pas de journal"
sup_log="${HOME}/.hosted-browser/supervisor.log"
if [[ -r "$sup_log" ]]; then
  last="$(tail -n 1 "$sup_log" 2>/dev/null || true)"
  if [[ -n "$last" ]]; then
    ev="$(printf '%s' "$last" | sed -n 's/.*event=\([^ ]*\).*/\1/p')"
    bin="$(printf '%s' "$last" | sed -n 's/.*binary=\([^ ]*\).*/\1/p')"
    bin="$(basename "${bin:-?}")"
    sup_line="navigateur: ${ev:-?} ${bin}"
  fi
fi

open_url="${HOME}/.hosted-browser/open-hosted-url.sh"
if [[ ! -x "$open_url" ]]; then
  open_url=""
fi

printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>' '<openbox_pipe_menu>'
printf '  <separator label="%s"/>\n' "$(xml_escape "${host}  load ${load}  ${mem}")"
printf '  <separator label="%s"/>\n' "$(xml_escape "$ona · $ts_line")"
printf '  <separator label="%s"/>\n' "$(xml_escape "$sup_line")"
if [[ -n "$open_url" ]]; then
  item "La Nasa (ce nœud)" "${open_url} http://127.0.0.1:8794/"
  item "Flotte Fractanet" "${open_url} http://127.0.0.1:8794/nasa/fleet"
fi
item "htop" "$(term "Moniteur système" "htop")"
item "Statut Tailscale" "$(term "Tailscale" "tailscale status; echo; tailscale ip -4 2>/dev/null || true")"
item "Santé ONA" "$(term "ONA" "curl -sS --max-time 5 http://127.0.0.1:8794/health | jq . 2>/dev/null || curl -sS --max-time 5 http://127.0.0.1:8794/health")"
if [[ -r "$sup_log" ]]; then
  item "Journal navigateur" "$(term "Supervisor" "tail -n 40 ${sup_log}")"
fi
printf '%s\n' '</openbox_pipe_menu>'
