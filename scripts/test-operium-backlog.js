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
// Closed high/critical bugs must stay done unless reopened with new evidence.
assert.ok(
  !bugs.some((b) => b.id === "OP-BUG-001"),
  "OP-BUG-001 must remain done unless reopened with new evidence"
);
assert.ok(
  !bugs.some((b) => b.id === "OP-BUG-002"),
  "OP-BUG-002 must remain done unless reopened with new evidence"
);
// Residual open bugs (medium/low) still tracked.
assert.ok(
  bugs.some((b) => b.id === "OP-BUG-004" || b.id === "OP-BUG-005"),
  "medium/low open bugs remain visible"
);

const gatewayBlockers = blockingBugs(backlog.items, "agent-gateway");
assert.equal(
  gatewayBlockers.length,
  0,
  "agent-gateway has no open high/critical bugs"
);

const gateGw = evaluateGate(backlog, "agent-gateway");
assert.equal(gateGw.blocked, false, "agent-gateway features are not gated");

const gateSecrets = evaluateGate(backlog, "secrets");
assert.equal(
  gateSecrets.blocked,
  false,
  "secrets gate clear after OP-BUG-002 close"
);

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
      secrets_blocked: gateSecrets.blocked,
      open_bug_ids: bugs.map((b) => b.id),
    },
    null,
    2
  )
);
