#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { finishCli } from "../lib/cli-exit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(__dirname, "../bin/operium.js");

function runChild(args, { timeoutMs = 60000, extraEnv = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timeout after ${timeoutMs}ms: ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function assertCleanShutdown(result, label) {
  assert.equal(result.signal, null, `${label} unexpected signal ${result.signal}`);
  assert.doesNotMatch(
    `${result.stdout}\n${result.stderr}`,
    /UV_HANDLE_CLOSING/,
    `${label} libuv abort:\n${result.stderr}`,
  );
}

const previous = process.exitCode;
finishCli(3);
assert.equal(process.exitCode, 3);
finishCli("not-a-number");
assert.equal(process.exitCode, 1);
finishCli(0);
assert.equal(process.exitCode, 0);
process.exitCode = previous ?? 0;

const fixturePath = path.resolve(__dirname, "test-operium-cli-exit-fixture.js");
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const fixtureRun = await runChild([fixturePath], {
  timeoutMs: 20000,
  extraEnv: { CLI_EXIT_FIXTURE_PORT: String(port) },
});
server.close();
assertCleanShutdown(fixtureRun, "fetch+execFile fixture");
assert.match(fixtureRun.stdout, /fixture-ok/);
assert.equal(fixtureRun.code, 0);

const noProbe = await runChild([cli, "up", "--no-probe", "--json"], { timeoutMs: 20000 });
assertCleanShutdown(noProbe, "operium up --no-probe");
assert.equal(noProbe.code, 3);

const live = await runChild([cli, "up", "--human"], { timeoutMs: 60000 });
assertCleanShutdown(live, "operium up --human");
assert.match(live.stdout, /Health /);
assert.ok([0, 1, 2].includes(live.code), `live up exit ${live.code}`);

console.log(JSON.stringify({
  ok: true,
  tests: ["finishCli", "fetch+execFile fixture", "up --no-probe", "up --human"],
  live_exit: live.code,
}, null, 2));
