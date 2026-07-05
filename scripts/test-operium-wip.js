#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildWipStatus, handoffWip, resumeWip } from "../lib/git-wip.js";

const execFileAsync = promisify(execFile);

async function git(cwd, args) {
  const result = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function setupPair(name = "case") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `operium-wip-${name}-`));
  const seed = path.join(root, "seed");
  const remote = path.join(root, "remote.git");
  const one = path.join(root, "one");
  const two = path.join(root, "two");

  await fs.mkdir(seed);
  await git(seed, ["init", "-b", "main"]);
  await git(seed, ["config", "user.email", "test@example.invalid"]);
  await git(seed, ["config", "user.name", "Operium Test"]);
  await fs.writeFile(path.join(seed, "README.md"), "# fixture\n");
  await git(seed, ["add", "README.md"]);
  await git(seed, ["commit", "-m", "Initial fixture"]);
  await git(seed, ["clone", "--bare", seed, remote]);
  await git(root, ["clone", remote, one]);
  await git(root, ["clone", remote, two]);
  for (const repo of [one, two]) {
    await git(repo, ["config", "user.email", "test@example.invalid"]);
    await git(repo, ["config", "user.name", "Operium Test"]);
  }
  return { root, remote, one, two };
}

async function testStatusClean() {
  const { one } = await setupPair("status");
  const status = await buildWipStatus({ repoPath: one, topic: "status-clean" });
  assert.equal(status.schema, "operium.wip.status.v1");
  assert.equal(status.ok, true);
  assert.equal(status.working_tree.clean, true);
  assert.equal(status.wip.candidate_branch, "wip/status-clean");
}

async function testHandoffAndResume() {
  const { one, two } = await setupPair("handoff");
  await fs.writeFile(path.join(one, "notes.md"), "handoff payload\n");
  const handoff = await handoffWip({ repoPath: one, topic: "x" });
  assert.equal(handoff.ok, true);
  assert.equal(handoff.handoff.created_commit, true);
  assert.equal(handoff.handoff.pushed, true);
  assert.equal(handoff.working_tree.clean_after, true);

  const resume = await resumeWip({ repoPath: two, topic: "x" });
  assert.equal(resume.ok, true);
  assert.equal(resume.repo.branch, "wip/x");
  assert.equal(await fs.readFile(path.join(two, "notes.md"), "utf8"), "handoff payload\n");
}

async function testDetachedRefusal() {
  const { one } = await setupPair("detached");
  await git(one, ["checkout", "--detach", "HEAD"]);
  await fs.writeFile(path.join(one, "detached.txt"), "no\n");
  const result = await handoffWip({ repoPath: one, topic: "detached" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "detached_head");
}

async function testRemoteAheadRefusal() {
  const { one, two } = await setupPair("remote-ahead");
  await fs.writeFile(path.join(one, "first.txt"), "one\n");
  const first = await handoffWip({ repoPath: one, topic: "remote-ahead" });
  assert.equal(first.ok, true);

  await resumeWip({ repoPath: two, topic: "remote-ahead" });
  await fs.writeFile(path.join(two, "second.txt"), "two\n");
  await git(two, ["add", "-A"]);
  await git(two, ["commit", "-m", "Remote WIP advance"]);
  await git(two, ["push"]);

  await fs.writeFile(path.join(one, "local.txt"), "local\n");
  const refused = await handoffWip({ repoPath: one, topic: "remote-ahead" });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "remote_wip_ahead");
}

async function testSecretRefusal() {
  const { one } = await setupPair("secret");
  await fs.writeFile(path.join(one, ".env"), "TOKEN=secret\n");
  await git(one, ["add", ".env"]);
  const result = await handoffWip({ repoPath: one, topic: "secret" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "secret_like_paths_detected");
  assert.deepEqual(result.blocked_paths, [".env"]);
}

async function testDryRun() {
  const { one } = await setupPair("dry");
  const beforeBranch = await git(one, ["branch", "--show-current"]);
  await fs.writeFile(path.join(one, "dry.txt"), "dry\n");
  const result = await handoffWip({ repoPath: one, topic: "dry", dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(await git(one, ["branch", "--show-current"]), beforeBranch);
  const status = await buildWipStatus({ repoPath: one, topic: "dry" });
  assert.equal(status.working_tree.clean, false);
}

async function testCliJson() {
  const { one } = await setupPair("cli");
  const cli = path.resolve("bin/operium.js");
  const { stdout } = await execFileAsync(process.execPath, [cli, "wip", "status", "--repo", one, "--topic", "cli"], {
    cwd: path.resolve("."),
  });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.schema, "operium.wip.status.v1");
  assert.equal(parsed.ok, true);
}

await testStatusClean();
await testHandoffAndResume();
await testDetachedRefusal();
await testRemoteAheadRefusal();
await testSecretRefusal();
await testDryRun();
await testCliJson();

console.log(
  JSON.stringify(
    {
      ok: true,
      tests: [
        "wip status clean",
        "handoff and resume",
        "detached refusal",
        "remote ahead refusal",
        "secret path refusal",
        "dry run",
        "cli json",
      ],
    },
    null,
    2
  )
);
