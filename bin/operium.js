#!/usr/bin/env node

import { formatHumanUp } from "../lib/format-human.js";
import { formatWipHuman } from "../lib/format-wip-human.js";
import { buildWipStatus, handoffWip, resumeWip } from "../lib/git-wip.js";
import { buildOperiumUp, exitCodeForUp } from "../lib/operium-up.js";

const HELP = `operium — versioned operational environment registry CLI

Usage:
  operium up [options]             Check what is up (Fractanet observer)
  operium wip status [options]     Inspect local Git WIP state
  operium handoff wip [options]    Commit and push a resumable WIP branch
  operium resume wip [options]     Fetch and resume a WIP branch

Options:
  --json                  Machine-readable operium.up.v1 output (default)
  --human                 Human-readable summary
  --probe                 Run live probes (default)
  --no-probe              Catalogue and docs only
  --registry <path>       Private registry YAML (default ~/.cogentia/registry/resources.yaml)
  --aggregator <url>      Runtime aggregator base URL (default https://cogentia.fractavolta.com)
  --section <name>        catalogue | mesh | services | blackboard | retrieval | public_face
  --timeout <ms>          Per-probe timeout (default 25000)
  --quiet                 Summary headline only (human mode)
  -h, --help              Show help

WIP options:
  --repo <path>           Git repository path (default current repo)
  --topic <slug>          Resolve branch as wip/<slug>
  --branch <name>         Explicit WIP branch name
  --remote <name>         Git remote (default origin)
  --base <branch>         Reserved for future branch orchestration (default main)
  --dry-run               Report intended handoff without modifying Git
  --message <text>        Commit message for handoff
  --include-untracked     Include untracked files in handoff (default)
  --no-include-untracked  Do not include untracked files
  --allow-empty           Allow an empty WIP handoff commit
  --no-push               Commit locally but do not push
  --allow-dirty           Resume even if working tree is dirty
  --auto-handoff-first    Resume after handoff of current dirty state

Exit codes:
  0  critical path OK, health_score > 2
  1  degraded but usable
  2  broken critical path
  3  incomplete / probes skipped
`;

function parseArgs(argv) {
  const options = {
    command: null,
    subcommand: null,
    json: true,
    human: false,
    probe: true,
    quiet: false,
    timeoutMs: 25000,
    registryPath: null,
    aggregatorUrl: null,
    section: null,
    help: false,
    repoPath: null,
    topic: null,
    branch: null,
    remote: "origin",
    base: "main",
    dryRun: false,
    message: null,
    includeUntracked: true,
    allowEmpty: false,
    noPush: false,
    allowDirty: false,
    autoHandoffFirst: false,
    autoBranch: false,
  };

  const args = [...argv];
  if (args.length === 0) {
    options.help = true;
    return options;
  }

  options.command = args.shift();
  if (
    (options.command === "handoff" && args[0] === "wip") ||
    (options.command === "resume" && args[0] === "wip") ||
    (options.command === "wip" && args[0] === "status")
  ) {
    options.subcommand = args.shift();
  } else if (options.command === "handoff-wip") {
    options.command = "handoff";
    options.subcommand = "wip";
  } else if (options.command === "resume-wip") {
    options.command = "resume";
    options.subcommand = "wip";
  } else if (options.command === "wip-status") {
    options.command = "wip";
    options.subcommand = "status";
  }

  while (args.length) {
    const arg = args.shift();
    switch (arg) {
      case "--json":
        options.json = true;
        options.human = false;
        break;
      case "--human":
        options.human = true;
        options.json = false;
        break;
      case "--probe":
        options.probe = true;
        break;
      case "--no-probe":
        options.probe = false;
        break;
      case "--quiet":
        options.quiet = true;
        break;
      case "--registry":
        options.registryPath = args.shift();
        break;
      case "--repo":
        options.repoPath = args.shift();
        break;
      case "--topic":
        options.topic = args.shift();
        break;
      case "--branch":
        options.branch = args.shift();
        break;
      case "--remote":
        options.remote = args.shift() || "origin";
        break;
      case "--base":
        options.base = args.shift() || "main";
        break;
      case "--aggregator":
        options.aggregatorUrl = args.shift();
        break;
      case "--section":
        options.section = args.shift();
        break;
      case "--timeout":
        options.timeoutMs = Number(args.shift());
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--message":
        options.message = args.shift();
        break;
      case "--include-untracked":
        options.includeUntracked = true;
        break;
      case "--no-include-untracked":
        options.includeUntracked = false;
        break;
      case "--allow-empty":
        options.allowEmpty = true;
        break;
      case "--no-push":
        options.noPush = true;
        break;
      case "--allow-dirty":
        options.allowDirty = true;
        break;
      case "--auto-handoff-first":
        options.autoHandoffFirst = true;
        break;
      case "--auto-branch":
        options.autoBranch = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`unknown_argument: ${arg}`);
    }
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error("Run operium --help");
    process.exit(2);
  }

  if (options.help || options.command === "help" || !options.command) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (isWipCommand(options)) {
    const result = await runWipCommand(options);
    if (options.human) {
      console.log(formatWipHuman(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(result.ok ? 0 : 2);
  }

  if (options.command !== "up") {
    console.error(`unknown_command: ${options.command}`);
    console.error("Run operium --help");
    process.exit(2);
  }

  const result = await buildOperiumUp({
    probe: options.probe,
    registryPath: options.registryPath,
    aggregatorUrl: options.aggregatorUrl,
    section: options.section,
    timeoutMs: options.timeoutMs,
  });

  if (options.human) {
    const text = options.quiet
      ? `${result.summary?.headline || "unknown"} (health ${result.summary?.health_score ?? "?"})`
      : formatHumanUp(result);
    console.log(text);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  process.exit(exitCodeForUp(result));
}

function isWipCommand(options) {
  return (
    (options.command === "handoff" && options.subcommand === "wip") ||
    (options.command === "resume" && options.subcommand === "wip") ||
    (options.command === "wip" && options.subcommand === "status")
  );
}

async function runWipCommand(options) {
  const wipOptions = {
    repoPath: options.repoPath,
    topic: options.topic,
    branch: options.branch,
    remote: options.remote,
    base: options.base,
    dryRun: options.dryRun,
    message: options.message,
    includeUntracked: options.includeUntracked,
    allowEmpty: options.allowEmpty,
    noPush: options.noPush,
    allowDirty: options.allowDirty,
    autoHandoffFirst: options.autoHandoffFirst,
    autoBranch: options.autoBranch,
  };
  if (options.command === "handoff") return await handoffWip(wipOptions);
  if (options.command === "resume") return await resumeWip(wipOptions);
  return await buildWipStatus(wipOptions);
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(2);
});
