#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const HOST = "fracta";
const ROOT = "/srv/operium-store";
const DIRECTORIES = [
  "archive",
  "handoffs",
  "inbox",
  "objects",
  "refs",
  "snapshots",
];

function usage() {
  console.log(`Usage:
  node scripts/ops/fracta-shared-store.js status
  node scripts/ops/fracta-shared-store.js apply

Creates or inspects the private Operium exchange store on ${HOST}:${ROOT}.
The script never reads or prints file contents.`);
}

function runRemote(script) {
  const result = spawnSync("ssh", [HOST, "sh", "-s"], {
    encoding: "utf8",
    input: script,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function statusScript() {
  return `set -eu
root=${JSON.stringify(ROOT)}
if [ ! -d "$root" ]; then
  printf 'state=absent path=%s\\n' "$root"
  exit 2
fi
printf 'state=present path=%s\\n' "$root"
stat -c 'mode=%a owner=%U group=%G path=%n' "$root"
find "$root" -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | sort
df -h "$root" | tail -n 1
`;
}

function applyScript() {
  const quotedDirectories = DIRECTORIES
    .map((name) => JSON.stringify(`${ROOT}/${name}`))
    .join(" ");

  return `set -eu
root=${JSON.stringify(ROOT)}
sudo install -d -m 0700 -o ubuntu -g ubuntu "$root"
sudo install -d -m 0700 -o ubuntu -g ubuntu ${quotedDirectories}
tmp="$root/.store.v1.tmp.$$"
printf '%s\\n' 'operium.shared-store.v1' > "$tmp"
chmod 0600 "$tmp"
mv -f "$tmp" "$root/FORMAT"
stat -c 'mode=%a owner=%U group=%G path=%n' "$root"
find "$root" -mindepth 1 -maxdepth 1 -type d -printf '%m %u:%g %f\\n' | sort
printf 'format='
cat "$root/FORMAT"
`;
}

const command = process.argv[2];

if (command === "status") {
  runRemote(statusScript());
} else if (command === "apply") {
  runRemote(applyScript());
} else {
  usage();
  process.exit(command ? 2 : 0);
}
