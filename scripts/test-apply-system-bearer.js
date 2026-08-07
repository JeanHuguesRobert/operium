#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncKeyToFile } from "../lib/env-key-file.js";
import { runSystemBearerProcedure } from "../lib/system-bearer.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "operium-bearer-"));
try {
  const sot = path.join(tmp, "sot.env");
  const gateway = path.join(tmp, "gateway.env");
  fs.writeFileSync(sot, "COGENTIA_API_KEY=secret-new\nOTHER=1\n", { mode: 0o600 });
  fs.writeFileSync(gateway, "COGENTIA_API_KEY=secret-old\n", { mode: 0o600 });

  const dry = runSystemBearerProcedure({
    sot,
    gatewayEnv: gateway,
    apply: false,
    vault: false,
  });
  assert.equal(dry.schema, "operium.system-bearer-apply.v1");
  assert.equal(dry.value_disclosed, false);
  assert.equal(dry.local_gateway_aligned, false);
  assert.equal(dry.ok, false);
  assert.ok(!JSON.stringify(dry).includes("secret-new"));
  assert.ok(!JSON.stringify(dry).includes("secret-old"));

  const applied = runSystemBearerProcedure({
    sot,
    gatewayEnv: gateway,
    apply: true,
    vault: false,
  });
  assert.equal(applied.local_gateway_aligned, true);
  assert.equal(applied.ok, true);
  assert.equal(
    fs.readFileSync(gateway, "utf8"),
    "COGENTIA_API_KEY=secret-new\n"
  );

  const again = runSystemBearerProcedure({
    sot,
    gatewayEnv: gateway,
    apply: false,
  });
  assert.equal(again.ok, true);
  assert.equal(again.local_gateway_aligned, true);

  // vault without apply is blocked
  const vaultBlocked = runSystemBearerProcedure({
    sot,
    gatewayEnv: gateway,
    apply: false,
    vault: true,
  });
  assert.equal(vaultBlocked.ok, false);
  const vaultStep = vaultBlocked.steps.find((s) => s.id === "vault");
  assert.equal(vaultStep.action, "blocked_needs_apply");

  // vault with apply uses injected runner
  let vaultCalled = false;
  const vaultOk = runSystemBearerProcedure({
    sot,
    gatewayEnv: gateway,
    apply: true,
    vault: true,
    vaultScript: path.join(tmp, "fake-sync-secrets.js"),
    run: () => {
      vaultCalled = true;
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  // script missing → fail before run when file absent
  assert.equal(vaultOk.ok, false);

  fs.writeFileSync(path.join(tmp, "fake-sync-secrets.js"), "// fake\n");
  const vaultRan = runSystemBearerProcedure({
    sot,
    gatewayEnv: gateway,
    apply: true,
    vault: true,
    vaultScript: path.join(tmp, "fake-sync-secrets.js"),
    run: () => {
      vaultCalled = true;
      return { status: 0, stdout: "LEAK=should-not-appear", stderr: "" };
    },
  });
  assert.equal(vaultRan.ok, true);
  assert.equal(vaultCalled, true);
  assert.ok(!JSON.stringify(vaultRan).includes("LEAK="));

  // env-key primitive still good
  const prim = syncKeyToFile("x", path.join(tmp, "t.env"), "K", { dryRun: true });
  assert.equal(prim.dry_run, true);
  assert.equal(prim.changed, true);

  console.log(
    JSON.stringify(
      {
        ok: true,
        tests: [
          "dry_run_detects_drift",
          "no_value_disclosure",
          "apply_aligns_gateway",
          "idempotent_verify",
          "vault_double_opt_in",
          "vault_runner_no_stdout_leak",
        ],
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
