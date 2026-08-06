#!/usr/bin/env node
/**
 * Bounded interactive handoff to a named Termux tmux session.
 *
 * This is an orchestration helper, not Android remote control. It only uses
 * SSH and the native tmux session manager; it never starts an agent or accepts
 * an arbitrary remote shell command.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const SESSION_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const MAX_PAYLOAD_BYTES = 16 * 1024;

function usage() {
  return `Usage:
  node scripts/ops/termux-tmux-handoff.js status --session NAME [--host poco-jhr]
  node scripts/ops/termux-tmux-handoff.js start --session NAME [--host poco-jhr]
  node scripts/ops/termux-tmux-handoff.js capture --session NAME [--lines 80] [--host poco-jhr]
  node scripts/ops/termux-tmux-handoff.js send --session NAME --file PATH --i-am-present [--host poco-jhr] [--dry-run]

The send command pastes a reviewed local file into the named tmux session and
then sends Enter. It records only the payload SHA-256 in its JSON result.`;
}

function fail(message) {
  process.stderr.write(`termux-tmux-handoff: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { host: "poco-jhr", lines: 80, dryRun: false, present: false };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--host") options.host = rest[++i];
    else if (arg === "--session") options.session = rest[++i];
    else if (arg === "--file") options.file = rest[++i];
    else if (arg === "--lines") options.lines = Number(rest[++i]);
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--i-am-present") options.present = true;
    else if (arg === "-h" || arg === "--help") return { help: true };
    else fail(`unknown argument: ${arg}`);
  }
  if (!command) return { help: true };
  if (!new Set(["status", "start", "capture", "send"]).has(command)) fail(`unknown command: ${command}`);
  if (!SESSION_RE.test(String(options.session || ""))) fail("--session must be a simple named tmux session");
  if (!Number.isInteger(options.lines) || options.lines < 1 || options.lines > 500) fail("--lines must be an integer from 1 to 500");
  if (command === "send" && !options.file) fail("send requires --file PATH");
  if (command === "send" && !options.present) fail("send requires --i-am-present");
  return { command, ...options };
}

function ssh(host, remote) {
  const result = spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host, remote], {
    encoding: "utf8",
  });
  if (result.error) fail(`ssh failed to start: ${result.error.message}`);
  if (result.status !== 0) fail((result.stderr || result.stdout || "remote command failed").trim());
  return (result.stdout || "").trimEnd();
}

function remoteFor(options, payloadBase64 = null) {
  const target = options.session;
  if (options.command === "status") return `tmux has-session -t '${target}' && tmux list-sessions`;
  if (options.command === "start") return `tmux has-session -t '${target}' 2>/dev/null && exit 3 || tmux new-session -d -s '${target}'`;
  if (options.command === "capture") return `tmux capture-pane -p -t '${target}' -S -${options.lines}`;
  return [
    `printf '%s' '${payloadBase64}' | base64 -d | tmux load-buffer -b operium-handoff -`,
    `tmux paste-buffer -b operium-handoff -d -t '${target}'`,
    `tmux send-keys -t '${target}' Enter`,
  ].join(" && ");
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

let payload = null;
if (options.command === "send") {
  payload = fs.readFileSync(options.file);
  if (!payload.length) fail("handoff file is empty");
  if (payload.length > MAX_PAYLOAD_BYTES) fail(`handoff file exceeds ${MAX_PAYLOAD_BYTES} bytes`);
}
const sha256 = payload ? crypto.createHash("sha256").update(payload).digest("hex") : null;
const remote = remoteFor(options, payload?.toString("base64"));

if (options.dryRun) {
  process.stdout.write(`${JSON.stringify({ ok: true, dry_run: true, command: options.command, host: options.host, session: options.session, payload_sha256: sha256 }, null, 2)}\n`);
  process.exit(0);
}

const output = ssh(options.host, remote);
process.stdout.write(`${JSON.stringify({
  ok: true,
  schema: "operium.termux-tmux-handoff.v1",
  command: options.command,
  host: options.host,
  session: options.session,
  payload_sha256: sha256,
  output: output || null,
}, null, 2)}\n`);
