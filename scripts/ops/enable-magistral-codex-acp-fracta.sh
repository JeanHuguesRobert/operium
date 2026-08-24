#!/usr/bin/env bash
# Promote the Fracta Magistral service to the local Codex ACP provider.
# Run ON Fracta after the shared ACP integration test has passed there.
# No secret is read or printed; removal of this drop-in restores the legacy
# Node router defined by the base unit and its earlier drop-ins.
set -euo pipefail

INSEME_ROOT="${INSEME_ROOT:-/srv/cogentia/repos/inseme}"
WORK_ROOT="${MAGISTRAL_ACP_WORK_ROOT:-/srv/cogentia/work/magistral}"
DROPIN="/etc/systemd/system/magistral.service.d/zzzz-codex-acp.conf"
GUIDE_DROPIN="/etc/systemd/system/mcp-cogentia.service.d/zzzz-magistral-acp.conf"
NODE_BIN="/usr/local/node-v26.5.0/bin/node"
CODEX_ACP_BIN="/usr/local/node-v26.5.0/bin/codex-acp"
DENO_BIN_DIR="/usr/local/node-v26.5.0/bin"
CODEX_BIN_DIR="/home/ubuntu/.local/bin"
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

for path in \
  "$INSEME_ROOT/packages/magistral/scripts/launcher.js" \
  "$INSEME_ROOT/packages/magistral/pilots/reference-js/src/main.js" \
  "$INSEME_ROOT/packages/magistral/registry/maps/local-codex-acp.js" \
  "$NODE_BIN" \
  "$CODEX_ACP_BIN" \
  "$DENO_BIN_DIR/deno"
do
  test -e "$path" || { echo "MISSING=$path" >&2; exit 2; }
done

if [[ -n "$(git -C "$INSEME_ROOT" status --porcelain --untracked-files=no)" ]]; then
  echo "REFUSE_TRACKED_INSEME_CHECKOUT" >&2
  exit 2
fi

sudo -u ubuntu -H env \
  PATH="$CODEX_BIN_DIR:$DENO_BIN_DIR:/usr/bin:/bin" \
  codex login status >/dev/null

echo "INSEME_ROOT=$INSEME_ROOT"
echo "WORK_ROOT=$WORK_ROOT"
echo "DROPIN=$DROPIN"
echo "GUIDE_DROPIN=$GUIDE_DROPIN"
echo "DRY_RUN=$DRY_RUN"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "would_start=Magistral Deno pilot with local-codex-acp map on 127.0.0.1:8880"
  echo "would_use=isolated public workspace and read-only ACP permission policy"
  echo "would_route_guide=http://127.0.0.1:8880 using existing MAGISTRAL_API_KEY authority"
  echo "would_rollback=remove only $DROPIN and $GUIDE_DROPIN if the service fails to start"
  echo "DRY_RUN_OK"
  exit 0
fi

sudo install -d -o ubuntu -g ubuntu -m 0750 "$WORK_ROOT"
sudo chown ubuntu:ubuntu "$WORK_ROOT"
sudo install -d -o ubuntu -g ubuntu -m 0750 "$WORK_ROOT/public-guide"
sudo install -d -o root -g root -m 0755 "$(dirname "$DROPIN")"
sudo install -d -o root -g root -m 0755 "$(dirname "$GUIDE_DROPIN")"

had_dropin=0
backup="$(mktemp)"
if sudo test -f "$DROPIN"; then
  had_dropin=1
  sudo cp -a "$DROPIN" "$backup"
fi
had_guide_dropin=0
guide_backup="$(mktemp)"
if sudo test -f "$GUIDE_DROPIN"; then
  had_guide_dropin=1
  sudo cp -a "$GUIDE_DROPIN" "$guide_backup"
fi

cleanup_backup() { sudo rm -f "$backup" "$guide_backup"; }
rollback() {
  echo "ROLLBACK_MAGISTRAL_ACP" >&2
  if [[ "$had_dropin" -eq 1 ]]; then
    sudo cp "$backup" "$DROPIN"
  else
    sudo rm -f "$DROPIN"
  fi
  if [[ "$had_guide_dropin" -eq 1 ]]; then
    sudo cp "$guide_backup" "$GUIDE_DROPIN"
  else
    sudo rm -f "$GUIDE_DROPIN"
  fi
  sudo systemctl daemon-reload
  sudo systemctl restart magistral.service
  sudo systemctl restart mcp-cogentia.service
}
trap cleanup_backup EXIT

sudo tee "$DROPIN" >/dev/null <<EOF
[Service]
WorkingDirectory=$WORK_ROOT
Environment=PATH=$CODEX_BIN_DIR:$DENO_BIN_DIR:/usr/bin:/bin
Environment=HOST=127.0.0.1
Environment=PORT=8880
Environment=CODEX_ACP_COMMAND=$CODEX_ACP_BIN
Environment=MAGISTRAL_CODEX_ACP_WORKSPACE=$WORK_ROOT/public-guide
Environment=MAGISTRAL_CODEX_ACP_TIER=fractavolta-guide
Environment=MAGISTRAL_CODEX_ACP_MODEL=codex-local
Environment=MAGISTRAL_CODEX_ACP_TIMEOUT_MS=240000
# Fracta's inherited localhost proxy is not running.  Bypass it only for the
# embedding provider; retain the inherited proxy policy for ACP/Codex traffic.
Environment=NO_PROXY=localhost,127.0.0.1,api.openai.com
ExecStart=
ExecStart=$NODE_BIN $INSEME_ROOT/packages/magistral/scripts/launcher.js --pilot $INSEME_ROOT/packages/magistral/pilots/reference-js/src/main.js --blueprint coding --map local-codex-acp
EOF

sudo tee "$GUIDE_DROPIN" >/dev/null <<'EOF'
[Service]
Environment=COGENTIA_GUIDE_MAGISTRAL_URL=http://127.0.0.1:8880
Environment=COGENTIA_GUIDE_MAGISTRAL_TIMEOUT_MS=240000
# The public Guide is an explicit embedding fulfiller.  Query vectors therefore
# travel through its local Magistral router rather than bypassing its provider
# policy; deterministic retrieval still emits a continuation everywhere else.
Environment=COGENTIA_ALLOW_INLINE_EMBED_FULFILL=1
# One local ACP Codex process is the synthesis capacity.  Keep planning
# deterministic while it is the only provider; otherwise a short-lived
# planner request can occupy it and race the synthesis request.
Environment=COGENTIA_GUIDE_PLANNER=0
EOF

sudo systemctl daemon-reload
if ! sudo systemctl restart magistral.service; then
  rollback
  exit 1
fi

if ! systemctl is-active --quiet magistral.service; then
  rollback
  exit 1
fi

service_info=""
for attempt in $(seq 1 30); do
  if service_info="$(curl -fsS -m 2 http://127.0.0.1:8880/service-info 2>/dev/null)"; then
    break
  fi
  sleep 1
done
if [[ -z "$service_info" ]]; then
  echo "MAGISTRAL_ACP_STARTUP_TIMEOUT" >&2
  rollback
  exit 1
fi
node -e '
  const info = JSON.parse(process.argv[1]);
  if (info?.service?.id !== "magistral") process.exit(1);
  if (!Array.isArray(info?.capabilities) || !info.capabilities.some((node) => node.adapter === "acp_stdio")) process.exit(1);
' "$service_info" || { rollback; exit 1; }
curl -fsSI -m 30 http://127.0.0.1:8880/service-info | grep -qi '^Server: Magistral' || { rollback; exit 1; }

sudo systemctl restart mcp-cogentia.service
if ! systemctl is-active --quiet mcp-cogentia.service; then
  rollback
  exit 1
fi

echo "MAGISTRAL_ACP_ACTIVE"
