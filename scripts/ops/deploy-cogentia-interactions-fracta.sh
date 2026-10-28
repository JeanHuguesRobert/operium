#!/usr/bin/env bash
# Install #271's advisory mission in the existing versioned Sleep Cycle cadence.
# Operium owns activation/rollback; source checkouts and weekly service are kept.
set -euo pipefail
umask 077
commit="${1:?Usage: deploy-cogentia-interactions-fracta.sh FULL_COGENTIA_COMMIT}"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'Full commit required' >&2; exit 2; }
repo=/srv/cogentia/repos/cogentia
base=/srv/operium/releases/cogentia-interactions
release="$base/$commit"
record="/srv/operium/deployments/cogentia-interactions/$(date -u +%Y%m%dT%H%M%SZ)-$commit"
state=/var/lib/cogentia-interactions
public_state=/var/lib/cogentia-sleep-cycle
unit=/etc/systemd/system/cogentia-sleep-cycle.service
timer=/etc/systemd/system/cogentia-sleep-cycle.timer
override=/etc/systemd/system/cogentia-sleep-cycle.service.d/interactions.conf
probe=/run/systemd/system/cogentia-sleep-cycle.service.d/zzzz-interaction-probe.conf
config=/etc/cogentia/interactions.json
credential=/srv/cogentia/secrets/stalwart-gmail-app-password

sudo -n true
git -C "$repo" fetch origin main
git -C "$repo" cat-file -e "$commit^{commit}"
git -C "$repo" merge-base --is-ancestor "$commit" origin/main
for path in "$unit" "$timer" "$override" "$probe" "$config"; do
  if [[ -e "$path" ]]; then echo 'Existing Sleep Cycle activation requires a reviewed upgrade baseline' >&2; exit 3; fi
done
test "$(systemctl show cogentia-sleep-cycle.service --property=LoadState --value)" = not-found
test "$(systemctl show cogentia-sleep-cycle.timer --property=LoadState --value)" = not-found
sudo python3 - <<'PY'
import pathlib,sqlite3
for path in ("/var/lib/cogentia/node_memory.sqlite","/var/lib/cogentia/.ops/node_memory.sqlite"):
    if not pathlib.Path(path).is_file(): continue
    db=sqlite3.connect("file:"+path+"?mode=ro",uri=True,timeout=3)
    if db.execute("SELECT count(*) FROM sqlite_master WHERE name='scheduled_jobs'").fetchone()[0]:
        count=db.execute("SELECT count(*) FROM scheduled_jobs WHERE enabled=1 AND (lower(job_id) LIKE '%sleep%' OR lower(kind) LIKE '%sleep%' OR lower(config_json) LIKE '%sleep%')").fetchone()[0]
        if count: raise SystemExit("Existing enabled ONA Sleep Cycle job requires duplicate-trigger reconciliation")
    db.close()
print("NO_COMPETING_ENABLED_ONA_SLEEP_JOB")
PY
sudo test -r "$credential"
test -d "$repo/node_modules"
for name in cogentia JeanHuguesRobert registre-mariani; do
  test -d "/srv/cogentia/repos/$name/interaction_packets"
done
sudo install -d -m 700 -o ubuntu -g ubuntu "$base" "$state" "$public_state" /srv/operium/deployments/cogentia-interactions
mkdir -p "$record" "$release"
git -C "$repo" status --porcelain > "$record/worktree-before.txt"
git -C "$repo" diff --binary HEAD > "$record/worktree-before.patch"
systemctl show cogentia-consolidation.service cogentia-consolidation.timer --property=Id,LoadState,ActiveState,UnitFileState,ExecStart > "$record/weekly-before.txt"
if [[ ! -e "$release/.release-complete" ]]; then
  git -C "$repo" archive "$commit" | tar -x -C "$release"
  (cd "$release" && corepack pnpm install --prod --frozen-lockfile --ignore-scripts --filter cogentia) > "$record/dependency-install.txt" 2>&1
  (cd "$release" && node --test scripts/check-interaction-evidence.js scripts/check-interaction-sources.js) > "$record/node-tests.txt" 2>&1
  PYTHONDONTWRITEBYTECODE=1 python3 "$release/scripts/check-gmail-readonly.py" > "$record/python-tests.txt" 2>&1
  printf '%s\n' "$commit" > "$release/.release-complete"
fi
sudo systemd-analyze verify "$release/systemd/cogentia-sleep-cycle.service" "$release/systemd/cogentia-sleep-cycle.timer" > "$record/unit-validation.txt" 2>&1

# The account reference is already managed by Operium's existing mail surface.
account=$(sudo python3 -c 'import pathlib,re; s=pathlib.Path("/srv/cogentia/secrets/stalwart-gmail-relay.env").read_text(); m=re.search(r"^GMAIL_SMTP_USER=(.+)$",s,re.M); print(m.group(1).strip().strip(chr(34)).strip(chr(39)) if m else "")')
[[ "$account" =~ ^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+$ ]] || { echo 'Managed Gmail account reference unavailable' >&2; exit 4; }
cat > "$record/config.json" <<JSON
{"authorized":true,"stateRoot":"$state","refreshRepositories":true,"maxCases":3,"maxMessages":20,"readTimeoutMs":80000,"repositories":[{"name":"cogentia","root":"/srv/cogentia/repos/cogentia"},{"name":"JeanHuguesRobert","root":"/srv/cogentia/repos/JeanHuguesRobert"},{"name":"registre-mariani","root":"/srv/cogentia/repos/registre-mariani"}]}
JSON
cat > "$record/interactions.conf" <<UNIT
[Service]
ExecStart=
ExecStart=/usr/bin/node $release/scripts/run-corpus-sleep-cycle.js --max-pairs 50 --budget-ms 180000 --skip-repo-sync --skip-consolidation --no-cop-evidence --json
Environment=COGENTIA_INTERACTION_CONFIG=$config
Environment=COGENTIA_SLEEP_STATE_ROOT=$public_state
Environment=INTERACTION_GMAIL_USER=$account
Environment=PYTHONDONTWRITEBYTECODE=1
LoadCredential=gmail-password:$credential
UMask=0077
TimeoutStartSec=230
NoNewPrivileges=true
ProtectSystem=strict
ReadOnlyPaths=/srv/cogentia/repos
ReadWritePaths=$state $public_state
UNIT
cat > "$record/rollback.sh" <<'ROLLBACK'
#!/usr/bin/env bash
set -euo pipefail
sudo systemctl disable --now cogentia-sleep-cycle.timer
sudo systemctl stop cogentia-sleep-cycle.service
sudo rm -f /run/systemd/system/cogentia-sleep-cycle.service.d/zzzz-interaction-probe.conf
sudo rm -f /etc/systemd/system/cogentia-sleep-cycle.service.d/interactions.conf
sudo rm -f /etc/systemd/system/cogentia-sleep-cycle.service /etc/systemd/system/cogentia-sleep-cycle.timer
sudo rm -f /etc/cogentia/interactions.json
sudo systemctl daemon-reload
# Preserve runtime findings, source caches and deployment receipts for review.
ROLLBACK
chmod 700 "$record/rollback.sh"
installed=false
on_failure() {
  code=$?
  trap - ERR
  if $installed; then bash "$record/rollback.sh" > "$record/rollback.log" 2>&1 || true; fi
  printf 'deployment_failed exit=%s receipt=%s\n' "$code" "$record" >&2
  exit "$code"
}
trap on_failure ERR
installed=true
sudo install -m 644 "$release/systemd/cogentia-sleep-cycle.service" "$unit"
sudo install -m 644 "$release/systemd/cogentia-sleep-cycle.timer" "$timer"
sudo install -d -m 755 /etc/systemd/system/cogentia-sleep-cycle.service.d /run/systemd/system/cogentia-sleep-cycle.service.d
sudo install -m 600 -o ubuntu -g ubuntu "$record/config.json" "$config"
sudo install -m 644 "$record/interactions.conf" "$override"
# One explicitly budgeted initial functional probe; recurring runs retain the
# qualification gate. This override is removed before the timer is enabled.
printf '[Service]\nCPUSchedulingPolicy=other\nNice=10\nExecStart=\nExecStart=/usr/bin/node %s/scripts/run-corpus-sleep-cycle.js --force --interactions-only --budget-ms 180000 --skip-repo-sync --skip-consolidation --no-cop-evidence --json\n' "$release" > "$record/probe.conf"
sudo install -m 644 "$record/probe.conf" "$probe"
sudo systemctl daemon-reload
sudo systemctl start cogentia-sleep-cycle.service
systemctl show cogentia-sleep-cycle.service --property=Result,ExecMainStatus,ExecMainStartTimestamp,User,ExecStart > "$record/service-probe.txt"
journalctl -u cogentia-sleep-cycle.service --since '-6 minutes' --no-pager -o cat > "$record/service-probe.log"
test "$(systemctl show cogentia-sleep-cycle.service --property=Result --value)" = success
python3 - "$state/last-receipt.json" <<'PY' > "$record/functional-check.json"
import json,sys
receipt=json.load(open(sys.argv[1]))
assert receipt["status"] in ("COMPLETED","PARTIAL"), receipt
assert receipt.get("processed",0)>0, receipt
assert receipt.get("cases_with_mail",0)>0, receipt
assert receipt.get("observed_events",0)>0, receipt
assert receipt["source_mutations"]==0, receipt
print(json.dumps(receipt))
PY
sudo rm -f "$probe"
sudo systemctl daemon-reload
sudo systemctl enable --now cogentia-sleep-cycle.timer
test "$(systemctl is-enabled cogentia-sleep-cycle.timer)" = enabled
test "$(systemctl is-active cogentia-sleep-cycle.timer)" = active
test -n "$(systemctl show cogentia-sleep-cycle.timer --property=NextElapseUSecRealtime --value)"
systemctl show cogentia-sleep-cycle.timer --property=ActiveState,UnitFileState,NextElapseUSecRealtime,LastTriggerUSec > "$record/timer-after.txt"
systemctl show cogentia-sleep-cycle.service --property=ExecStart > "$record/service-final.txt"
systemctl show cogentia-consolidation.service cogentia-consolidation.timer --property=Id,LoadState,ActiveState,UnitFileState,ExecStart > "$record/weekly-after.txt"
cmp "$record/weekly-before.txt" "$record/weekly-after.txt"
git -C "$repo" status --porcelain > "$record/worktree-after.txt"
git -C "$repo" diff --binary HEAD > "$record/worktree-after.patch"
cmp "$record/worktree-before.patch" "$record/worktree-after.patch"
trap - ERR
printf 'deployed_commit=%s\nreceipt=%s\n' "$commit" "$record"
cat "$record/functional-check.json" "$record/timer-after.txt"
