#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { finishCli } from "../lib/cli-exit.js";

const execFileAsync = promisify(execFile);
const port = Number(process.env.CLI_EXIT_FIXTURE_PORT);
await fetch(`http://127.0.0.1:${port}/health`);
await execFileAsync(process.execPath, ["-e", "process.stdout.write('ok')"], { windowsHide: true });
console.log("fixture-ok");
finishCli(0);
