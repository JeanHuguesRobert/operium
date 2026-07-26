#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  blockingBugs,
  evaluateGate,
  filterItems,
  isWaiverActive,
  loadBacklog,
} from "../lib/backlog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backlogPath = path.join(root, "backlog", "items.yaml");

const backlog = loadBacklog(backlogPath);
assert.equal(backlog.schema, "operium.backlog.v1");
assert.ok(backlog.items.length >= 5, "seed items present");

const bugs = filterItems(backlog.items, { kind: "bug", status: "openish" });
assert.ok(bugs.some((b) => b.id === "OP-BUG-001"));

const gatewayBlockers = blockingBugs(backlog.items, "agent-gateway");
assert.ok(gatewayBlockers.some((b) => b.id === "OP-BUG-001"));

const gateGw = evaluateGate(backlog, "agent-gateway");
assert.equal(gateGw.blocked, true);

const gateMeta = evaluateGate(backlog, "meta");
assert.equal(gateMeta.blocked, false, "medium meta bugs do not hard-block");

assert.equal(
  isWaiverActive({ reason: "test", expires_at: "2099-01-01" }),
  true
);
assert.equal(
  isWaiverActive({ reason: "test", expires_at: "2000-01-01" }),
  false
);

console.log(
  JSON.stringify(
    {
      ok: true,
      items: backlog.items.length,
      open_bugs: bugs.length,
      agent_gateway_blocked: gateGw.blocked,
    },
    null,
    2
  )
);
