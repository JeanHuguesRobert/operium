#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const provision = path.join(root, "scripts/ops/provision-hosted-browser-user.sh");
const listWorkspaces = path.join(root, "scripts/ops/list-hosted-browser-workspaces.sh");

function resolveBash() {
  const candidates = [
    process.env.OPERUM_BASH,
    process.env.BASH,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "/bin/bash",
    "bash",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "echo ok"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (!probe.error && probe.status === 0 && String(probe.stdout).includes("ok")) {
      return candidate;
    }
  }
  throw new Error("posix bash not found (install Git Bash or set OPERUM_BASH)");
}

const bashPath = resolveBash();

function bash(args, options = {}) {
  const result = spawnSync(bashPath, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

const missing = bash([provision]);
assert.equal(missing.status, 64, missing.stderr);

const plusAlias = bash([
  provision,
  "--gmail", "person+tag@gmail.com",
  "--display", "3",
  "--kasm-password-file", "/tmp/kasm",
  "--rfb-password-file", "/tmp/rfb",
  "--dry-run",
]);
assert.equal(plusAlias.status, 64, plusAlias.stderr);
assert.match(plusAlias.stderr, /plus alias/);

const dry = bash([
  provision,
  "--gmail", "Example.Person@gmail.com",
  "--display", "3",
  "--kasm-password-file", "/tmp/kasm",
  "--rfb-password-file", "/tmp/rfb",
  "--dry-run",
]);
assert.equal(dry.status, 0, dry.stderr);
assert.match(dry.stdout, /hosted-exampleperson/);
assert.match(dry.stdout, /display :3/);
assert.match(dry.stdout, /CDP :9225/);
assert.match(dry.stdout, /RFB :5903/);
assert.doesNotMatch(dry.stdout, /google password|sign-in/i);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hosted-browser-list-"));
fs.writeFileSync(path.join(tmp, "hosted-exampleperson.env"), [
  "HOSTED_BROWSER_DISPLAY=3",
  "HOSTED_BROWSER_START_URL=https://www.google.com/",
  "HOSTED_BROWSER_RFB_PORT=5903",
  "",
].join("\n"));
const listed = bash([listWorkspaces, "--env-dir", tmp]);
assert.equal(listed.status, 0, listed.stderr);
assert.match(listed.stdout, /hosted-exampleperson/);
assert.match(listed.stdout, /:3/);
assert.match(listed.stdout, /8446/);
assert.match(listed.stdout, /9225/);
assert.doesNotMatch(listed.stdout, /kasmpasswd|password/i);

const listedJson = bash([listWorkspaces, "--env-dir", tmp, "--json"]);
assert.equal(listedJson.status, 0, listedJson.stderr);
const payload = JSON.parse(listedJson.stdout);
assert.equal(payload.schema, "operium.hosted-browser.list.v1");
assert.equal(payload.count, 1);
assert.equal(payload.workspaces[0].unix_user, "hosted-exampleperson");
assert.equal(payload.workspaces[0].websocket_port, "8446");
assert.equal(payload.workspaces[0].cdp_port, "9225");

fs.rmSync(tmp, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: ["provision-usage", "reject-plus-alias", "dry-run-key", "list-env-dir"],
}, null, 2));
