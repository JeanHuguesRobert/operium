#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = path.join(root, "profiles", "shell", "termux-android.profile.sh");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "operium-termux-profile-"));

try {
  const repos = path.join(fixture, "srv", "cogentia", "repos");
  const registryRoot = path.join(repos, "JeanHuguesRobert");
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.writeFileSync(path.join(registryRoot, ".cogentia.json"), "{}\n", "utf8");

  const output = execFileSync(
    "bash",
    ["--noprofile", "--norc", "-c", `. ${JSON.stringify(profile)}; printf '%s\\n' "$COGENTIA_REGISTRY" "$COGENTIA_ROOT"`],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: fixture,
        TERMUX_WORKSPACE_PROFILE_LOADED: "1",
        CORPUS_REPOS: repos,
      },
    }
  ).trim().split("\n");

  assert.deepEqual(output, [registryRoot, path.join(repos, "cogentia")]);
  console.log(JSON.stringify({ ok: true, repaired_stale_sentinel: true }, null, 2));
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
