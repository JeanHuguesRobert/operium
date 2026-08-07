#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditTools,
  isAdminNpmPath,
  isUserSpacePath,
  parseToolsProfile,
} from "../lib/tools-audit.js";

assert.equal(isAdminNpmPath("C:\\Program Files\\nodejs\\netlify.ps1"), true);
assert.equal(isAdminNpmPath("C:\\Users\\admin\\.npm-global\\netlify.ps1"), false);
assert.equal(
  isUserSpacePath("C:\\Users\\admin\\scoop\\shims\\supabase.exe", "C:\\Users\\admin"),
  true
);

const sample = `
profile_id: tools.test.v1
policy:
  forbid_admin_npm_global: true
  preferred_windows_provider: scoop

tools:
  - id: supabase-cli
    desired:
      provider: scoop
      path_command: supabase
    priority: 1
    status: debt

  - id: netlify-cli
    desired:
      provider: user_npm
      path_command: netlify
    priority: 2
    status: unknown
`;

const parsed = parseToolsProfile(sample);
assert.equal(parsed.profile_id, "tools.test.v1");
assert.equal(parsed.policy.forbid_admin_npm_global, "true");
assert.equal(parsed.tools.length, 2);
assert.equal(parsed.tools[0].desired.path_command, "supabase");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "operium-tools-"));
try {
  const profilePath = path.join(tmp, "tools.yaml");
  fs.writeFileSync(profilePath, sample);

  const paths = {
    supabase: "C:\\Users\\admin\\scoop\\shims\\supabase.exe",
    netlify: "C:\\Program Files\\nodejs\\netlify.ps1",
  };

  const report = auditTools({
    profilePath,
    npmPrefix: () => "C:\\Users\\admin\\.npm-global",
    resolve: (cmd) => paths[cmd] || null,
  });

  assert.equal(report.schema, "operium.tools-audit.v1");
  assert.equal(report.npm_prefix_user_space, true);
  assert.equal(report.npm_prefix_admin, false);
  const sb = report.tools.find((t) => t.id === "supabase-cli");
  const nl = report.tools.find((t) => t.id === "netlify-cli");
  assert.equal(sb.verdict, "ok_user_space");
  assert.equal(nl.verdict, "admin_path_debt");
  assert.equal(report.ok, false);
  assert.ok(report.next_actions.some((a) => a.includes("netlify")));

  // When only supabase audited and user-space, ok
  const okReport = auditTools({
    profilePath,
    only: ["supabase-cli"],
    npmPrefix: () => "C:\\Users\\admin\\.npm-global",
    resolve: (cmd) => paths[cmd] || null,
  });
  assert.equal(okReport.ok, true);

  console.log(
    JSON.stringify(
      {
        ok: true,
        tests: [
          "path_classification",
          "profile_parse",
          "admin_debt_detected",
          "scoped_ok",
        ],
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
