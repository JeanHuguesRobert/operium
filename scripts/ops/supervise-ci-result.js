#!/usr/bin/env node
/**
 * GitHub Actions task supervisor. Work outcomes are durable data; this process
 * exits successfully after recording them so runner status remains separate.
 * Usage: node scripts/ops/supervise-ci-result.js --out DIR --phase NAME -- CMD [args...]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function main(argv) {
  const separator = argv.indexOf("--");
  const options = separator >= 0 ? argv.slice(0, separator) : argv;
  const command = separator >= 0 ? argv.slice(separator + 1) : [];
  const value = (name) => {
    const index = options.indexOf(name);
    return index >= 0 ? options[index + 1] : null;
  };
  const outputDir = value("--out");
  const phase = value("--phase") || "execute";
  if (!outputDir || !command[0]) throw new TypeError("--out, --phase and a command are required");

  const startedAt = new Date().toISOString();
  let status = null;
  let signal = null;
  let error = null;
  let log = "";
  try {
    const result = spawnSync(command[0], command.slice(1), {
      encoding: "utf8",
      timeout: 30 * 60 * 1000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    status = Number.isInteger(result.status) ? result.status : null;
    signal = result.signal || null;
    error = result.error ? String(result.error.message || result.error) : null;
    log = String(result.stdout || "") + String(result.stderr || "");
  } catch (cause) {
    error = String(cause?.stack || cause);
  }

  const passed = status === 0 && !signal && !error;
  const receipt = {
    schema: "operium.supervised-result/v1",
    phase,
    passed,
    status: passed ? "completed" : "failed",
    exit_code: status,
    signal,
    error,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "result.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "test.log"), `${log}${error ? `\n${error}\n` : ""}`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exitCode = 1;
}
