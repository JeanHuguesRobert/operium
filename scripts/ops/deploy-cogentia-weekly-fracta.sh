#!/usr/bin/env bash
# Deploy only the weekly consolidation executor; preserve the corpus checkout.
set -euo pipefail

commit="${1:?Usage: deploy-cogentia-weekly-fracta.sh FULL_COGENTIA_COMMIT}"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'A full commit SHA is required' >&2; exit 2; }
repo=/srv/cogentia/repos/cogentia
base=/srv/operium/releases/cogentia-weekly
release="$base/$commit"
record="/srv/operium/deployments/cogentia-weekly/$(date -u +%Y%m%dT%H%M%SZ)-$commit"
service=/etc/systemd/system/cogentia-consolidation.service
timer=/etc/systemd/system/cogentia-consolidation.timer
override=/etc/systemd/system/cogentia-consolidation.service.d/release.conf

sudo -n true
git -C "$repo" fetch origin main
git -C "$repo" cat-file -e "$commit^{commit}"
git -C "$repo" merge-base --is-ancestor "$commit" origin/main
sudo install -d -o ubuntu -g ubuntu "$base" /srv/operium/deployments/cogentia-weekly
mkdir -p "$record"
git -C "$repo" status --porcelain > "$record/worktree-before.txt"
git -C "$repo" rev-parse HEAD > "$record/checkout-before.txt"
systemctl show cogentia-consolidation.timer --property=LoadState,ActiveState,UnitFileState,NextElapseUSecRealtime > "$record/timer-before.txt"
if [[ -e "$service" || -e "$timer" || -e "$override" ]]; then
  echo 'Existing deployment requires a separately reviewed upgrade/rollback baseline.' >&2
  exit 3
fi
test "$(systemctl show cogentia-consolidation.service --property=LoadState --value)" = not-found
test "$(systemctl show cogentia-consolidation.timer --property=LoadState --value)" = not-found

# Refuse to run over pre-existing local changes to files this weekly job owns.
# The rest of the source checkout may remain dirty; it is observed and retained.
week="$(date -u +%G-W%V)"
next_week="$(date -u -d '7 days' +%G-W%V)"
owned_paths=(
  "research/sprints/weekly_digest_${week}.md"
  ".cogentia/sprints/weekly_digest_full_${week}.md"
  "llms.txt" "llms-full.txt"
  ".cogentia/projections/llms.txt" ".cogentia/projections/llms-full.txt"
  "docs/registry.json"
  ".cogentia/continuations/ctn_weekly_consolidation.json"
  ".cogentia/continuations/ctn_weekly_consolidation_${next_week}.json"
)
while IFS= read -r status_line; do
  dirty_path="${status_line:3}"
  for owned_path in "${owned_paths[@]}"; do
    if [[ "$dirty_path" == "$owned_path" ]]; then
      echo "Refusing to overwrite pre-existing dirty weekly output: $dirty_path" >&2
      exit 4
    fi
  done
done < <(git -C "$repo" status --porcelain=v1)
git -C "$repo" diff --binary HEAD > "$record/worktree-before.patch"

mkdir -p "$release"
if [[ ! -e "$release/.release-complete" ]]; then
  git -C "$repo" archive "$commit" | tar -x -C "$release"
  test -d "$repo/node_modules"
  [[ -e "$release/node_modules" ]] || ln -s "$repo/node_modules" "$release/node_modules"
  (cd "$repo" && /usr/bin/node "$release/scripts/cogentia.js" help) > "$record/cli-smoke.txt" 2>&1
  printf '%s\n' "$commit" > "$release/.release-complete"
fi
sudo systemd-analyze verify "$release/systemd/cogentia-consolidation.service" "$release/systemd/cogentia-consolidation.timer" > "$record/unit-validation.txt" 2>&1

cat > "$record/rollback.sh" <<'ROLLBACK'
#!/usr/bin/env bash
set -euo pipefail
# Initial installation baseline: neither unit nor release override existed.
sudo systemctl disable --now cogentia-consolidation.timer
sudo systemctl stop cogentia-consolidation.service
sudo rm -f /etc/systemd/system/cogentia-consolidation.service.d/release.conf
sudo rm -f /etc/systemd/system/cogentia-consolidation.service /etc/systemd/system/cogentia-consolidation.timer
sudo systemctl daemon-reload
ROLLBACK
chmod 700 "$record/rollback.sh"
installed=false
on_failure() {
  code=$?
  trap - ERR
  if $installed; then bash "$record/rollback.sh" > "$record/rollback.log" 2>&1 || true; fi
  printf 'failed exit=%s receipt=%s\n' "$code" "$record" >&2
  exit "$code"
}
trap on_failure ERR
installed=true
sudo install -m 644 "$release/systemd/cogentia-consolidation.service" "$service"
sudo install -m 644 "$release/systemd/cogentia-consolidation.timer" "$timer"
sudo install -d -m 755 "$(dirname "$override")"
printf '[Service]\nExecStart=\nExecStart=/usr/bin/node %s/scripts/cogentia.js consolidate --weekly --no-fan-out\n' "$release" > "$record/release.conf"
sudo install -m 644 "$record/release.conf" "$override"
sudo systemctl daemon-reload
sudo systemctl start cogentia-consolidation.service
systemctl show cogentia-consolidation.service --property=Result,ExecMainStatus,ExecMainStartTimestamp,User,ExecStart > "$record/service-after.txt"
test "$(systemctl show cogentia-consolidation.service --property=Result --value)" = success
(cd "$repo" && /usr/bin/node --input-type=module -e '
import fs from "node:fs";
const p = JSON.parse(fs.readFileSync(".cogentia/continuations/ctn_weekly_consolidation.json", "utf8"));
const date = new Date();
date.setUTCHours(0, 0, 0, 0);
date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
const sprint = `${date.getUTCFullYear()}-W${String(Math.ceil((((date - yearStart) / 86400000) + 1) / 7)).padStart(2, "0")}`;
if (p.id !== `ctn_weekly_consolidation_${sprint}` || p.status !== "completed" || p.execution_steps_completed !== 5) throw new Error("Missing current-week completed packet");
for (const view of ["public", "private"]) if (!fs.existsSync(p.privacy_domains[view].digest)) throw new Error(`Missing ${view} digest`);
console.log(JSON.stringify({id:p.id,status:p.status,updated_at:p.updated_at}));
') > "$record/functional-check.json"
sudo systemctl enable --now cogentia-consolidation.timer
test "$(systemctl is-enabled cogentia-consolidation.timer)" = enabled
test "$(systemctl is-active cogentia-consolidation.timer)" = active
test -n "$(systemctl show cogentia-consolidation.timer --property=NextElapseUSecRealtime --value)"
systemctl show cogentia-consolidation.timer --property=ActiveState,UnitFileState,NextElapseUSecRealtime,LastTriggerUSec > "$record/timer-after.txt"
git -C "$repo" status --porcelain > "$record/worktree-after.txt"
trap - ERR
printf 'deployed_commit=%s\nreceipt=%s\n' "$commit" "$record"
cat "$record/functional-check.json" "$record/timer-after.txt"
