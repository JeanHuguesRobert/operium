#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REMOTE_ROOT = "fracta-store:/srv/operium-store";
const LOCAL_ROOT =
  process.env.OPERIUM_HANDOFFS_DIR || join(homedir(), "operium-handoffs");
const LOCAL_HANDOFFS = join(LOCAL_ROOT, "handoffs");
const LOCAL_OUTBOX = join(LOCAL_ROOT, "outbox");

function usage() {
  console.log(`Usage:
  node scripts/ops/fracta-shared-store-client.js status
  node scripts/ops/fracta-shared-store-client.js pull
  node scripts/ops/fracta-shared-store-client.js push
  node scripts/ops/fracta-shared-store-client.js check-outbox

Local offline root: ${LOCAL_ROOT}
Remote store: ${REMOTE_ROOT}`);
}

function run(args) {
  const result = spawnSync("rclone", args, {
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function ensureLocalDirectories() {
  mkdirSync(LOCAL_HANDOFFS, { recursive: true });
  mkdirSync(LOCAL_OUTBOX, { recursive: true });
}

const command = process.argv[2];

if (command === "status") {
  ensureLocalDirectories();
  console.log(`local=${LOCAL_ROOT}`);
  run(["lsd", REMOTE_ROOT]);
} else if (command === "pull") {
  ensureLocalDirectories();
  run(["copy", `${REMOTE_ROOT}/handoffs`, LOCAL_HANDOFFS]);
} else if (command === "push") {
  ensureLocalDirectories();
  run(["copy", LOCAL_OUTBOX, `${REMOTE_ROOT}/inbox`]);
} else if (command === "check-outbox") {
  ensureLocalDirectories();
  run(["check", LOCAL_OUTBOX, `${REMOTE_ROOT}/inbox`]);
} else {
  usage();
  process.exit(command ? 2 : 0);
}
