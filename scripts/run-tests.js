#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const testScripts = Object.keys(packageJson.scripts)
  .filter((name) => name.startsWith("test:"))
  .sort();
for (const testScript of testScripts) {
  console.log(`\n### ${testScript}`);
  const command = packageJson.scripts[testScript];
  const match = command.match(/^node\s+(.+)$/);
  if (!match) {
    throw new Error(`Test script ${testScript} must invoke node directly: ${command}`);
  }
  execFileSync(process.execPath, match[1].split(/\s+/), { stdio: "inherit" });
}

console.log(`\n${testScripts.length}/${testScripts.length} Operium test scripts passed.`);
