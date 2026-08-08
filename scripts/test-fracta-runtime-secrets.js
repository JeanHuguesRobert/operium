#!/usr/bin/env node
/**
 * Unit tests for fracta-runtime-secrets (no live SSH).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FRACTA_RUNTIME_KEY_CATALOG,
  runFractaRuntimeSecretsProcedure,
} from "../lib/fracta-runtime-secrets.js";
import { fingerprintValue } from "../lib/env-key-file.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "operium-fracta-sec-"));
const sot = path.join(tmp, "sot.env");
fs.writeFileSync(
  sot,
  "OPENAI_API_KEY=sk-proj-test-good\nCOGENTIA_API_KEY=bearer-good\n",
  { mode: 0o600 }
);

const remoteState = {
  "/etc/cogentia/magistral.env": {
    OPENAI_API_KEY: "sk-proj-test-stale",
    COGENTIA_API_KEY: "bearer-good",
  },
  "/srv/cogentia/secrets/guide.env": {
    OPENAI_API_KEY: "sk-proj-test-stale",
  },
  "/srv/cogentia/secrets/jhn-mcp.env": {},
};

function mockRun(cmd) {
  const joined = cmd.join(" ");
  if (joined.includes("systemctl restart")) {
    return { status: 0, stdout: "active\nactive\n", stderr: "" };
  }
  if (joined.includes("base64 -d | sudo bash")) {
    const remoteCmd = cmd[cmd.length - 1] || "";
    const m = remoteCmd.match(/echo\s+([A-Za-z0-9+/=]+)\s*\|/);
    if (!m) return { status: 1, stdout: "", stderr: "no_b64" };
    let script = "";
    try {
      script = Buffer.from(m[1], "base64").toString("utf8");
    } catch {
      return { status: 1, stdout: "", stderr: "bad_b64" };
    }
    if (script.includes("openai.com/v1/models")) {
      return { status: 0, stdout: "200\n", stderr: "" };
    }
    // write path
    if (script.includes("for f in") && script.includes("VALUE=")) {
      const keyM = script.match(/KEY=\$\(printf %s '([^']+)'/);
      const valM = script.match(/VALUE=\$\(printf %s '([^']+)'/);
      if (keyM && valM) {
        const key = Buffer.from(keyM[1], "base64").toString("utf8");
        const value = Buffer.from(valM[1], "base64").toString("utf8");
        // targets are quoted absolute paths after "for f in"
        const forPart = script.split("for f in")[1]?.split(";")[0] || "";
        const targets = [...forPart.matchAll(/'(\/[^']+)'/g)].map((x) => x[1]);
        for (const t of targets) {
          if (!remoteState[t]) remoteState[t] = {};
          remoteState[t][key] = value;
        }
        return { status: 0, stdout: "WROTE\nOK\n", stderr: "" };
      }
    }
    // fingerprint
    const fM = script.match(/f='([^']+)'/);
    const kM = script.match(/key='([^']+)'/);
    if (fM && kM) {
      const file = fM[1];
      const key = kM[1];
      if (!remoteState[file]) return { status: 0, stdout: "MISSING\n", stderr: "" };
      const v = remoteState[file][key];
      if (v == null) return { status: 0, stdout: "ABSENT\n", stderr: "" };
      return {
        status: 0,
        stdout: fingerprintValue(v) + "\n",
        stderr: "",
      };
    }
    return { status: 1, stdout: "", stderr: "unparsed_script" };
  }
  return { status: 1, stdout: "", stderr: `unmocked: ${joined.slice(0, 120)}` };
}

const dry = runFractaRuntimeSecretsProcedure({
  sot,
  host: "mock-fracta",
  apply: false,
  keys: ["OPENAI_API_KEY", "COGENTIA_API_KEY"],
  run: mockRun,
});
assert.equal(dry.schema, "operium.fracta-runtime-secrets.v1");
assert.equal(dry.value_disclosed, false);
assert.equal(dry.ok, false);
assert.ok(!JSON.stringify(dry).includes("sk-proj-test"));
const openaiStep = dry.steps.find((s) => s.id === "OPENAI_API_KEY");
assert.equal(openaiStep.aligned, false);

const applied = runFractaRuntimeSecretsProcedure({
  sot,
  host: "mock-fracta",
  apply: true,
  keys: ["OPENAI_API_KEY", "COGENTIA_API_KEY"],
  run: mockRun,
});
assert.equal(applied.ok, true, JSON.stringify(applied, null, 2));
assert.equal(
  remoteState["/etc/cogentia/magistral.env"].OPENAI_API_KEY,
  "sk-proj-test-good"
);
assert.equal(
  remoteState["/srv/cogentia/secrets/guide.env"].OPENAI_API_KEY,
  "sk-proj-test-good"
);

const again = runFractaRuntimeSecretsProcedure({
  sot,
  host: "mock-fracta",
  apply: false,
  keys: ["OPENAI_API_KEY", "COGENTIA_API_KEY"],
  run: mockRun,
});
assert.equal(again.ok, true);

assert.ok(FRACTA_RUNTIME_KEY_CATALOG.some((e) => e.key === "OPENAI_API_KEY"));

console.log(JSON.stringify({ ok: true, test: "fracta-runtime-secrets" }, null, 2));
