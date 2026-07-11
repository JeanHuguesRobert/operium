#!/usr/bin/env node

import assert from "node:assert/strict";
import { buildGuideActionRouteBody, buildInvokeArgv } from "../lib/invoke-tool.js";
import { resolveCogentiaInvokeScript } from "../lib/paths.js";
import { summarizeActionLayer } from "../lib/runtime-map.js";

const argv = buildInvokeArgv({
  aggregatorUrl: "https://cogentia.fractavolta.com",
  capability: "dev.tools.shell",
  model: "shell-repl",
  prompt: "echo OK",
  repl: true,
  expect: "OK",
});
assert.ok(argv.includes("invoke"));
assert.ok(argv.includes("--capability"));
assert.ok(argv.includes("dev.tools.shell"));
assert.ok(argv.includes("--repl"));

const guideBody = buildGuideActionRouteBody({
  capability: "dev.tools.shell",
  model: "shell-repl",
  prompt: "echo OK",
  repl: true,
});
assert.equal(guideBody.model, "shell-repl");
assert.equal(guideBody.repl, true);
assert.equal(guideBody.capability, "dev.tools.shell");

const script = resolveCogentiaInvokeScript();
assert.ok(script, "cogentia invoke script should resolve from workspace sibling");

const action = summarizeActionLayer({
  attractors: [{
    id: "attractor:i7-thinkpad-jhr:agent-cli-gateway",
    transport: { profile: "agent-gateway.v1", endpoint_ref: "http://i7-thinkpad-jhr:8793" },
    availability: { status: "online", last_seen: new Date().toISOString(), ttl_seconds: 300 },
    matches: {
      capabilities: ["agent.cli.gateway", "dev.tools.shell", "model.shell-repl"],
    },
  }],
});
assert.equal(action.phase2_wired, true);
assert.equal(action.fresh_attractor_count, 1);
assert.equal(action.tool_hosts[0].models.includes("shell-repl"), true);

console.log(JSON.stringify({
  ok: true,
  tests: ["buildInvokeArgv", "buildGuideActionRouteBody", "resolveCogentiaInvokeScript", "summarizeActionLayer"],
}, null, 2));