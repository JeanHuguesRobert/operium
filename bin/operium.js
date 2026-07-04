#!/usr/bin/env node

import { formatHumanUp } from "../lib/format-human.js";
import { buildOperiumUp, exitCodeForUp } from "../lib/operium-up.js";

const HELP = `operium — versioned operational environment registry CLI

Usage:
  operium up [options]     Check what is up (Fractanet observer)

Options:
  --json                  Machine-readable operium.up.v1 output (default)
  --human                 Human-readable summary
  --probe                 Run live probes (default)
  --no-probe              Catalogue and docs only
  --registry <path>       Private registry YAML (default ~/.cogentia/registry/resources.yaml)
  --aggregator <url>      Runtime aggregator base URL (default https://cogentia.fractavolta.com)
  --section <name>        catalogue | mesh | services | blackboard | retrieval | public_face
  --timeout <ms>          Per-probe timeout (default 8000)
  --quiet                 Summary headline only (human mode)
  -h, --help              Show help

Exit codes:
  0  critical path OK, health_score > 2
  1  degraded but usable
  2  broken critical path
  3  incomplete / probes skipped
`;

function parseArgs(argv) {
  const options = {
    command: null,
    json: true,
    human: false,
    probe: true,
    quiet: false,
    timeoutMs: 8000,
    registryPath: null,
    aggregatorUrl: null,
    section: null,
    help: false,
  };

  const args = [...argv];
  if (args.length === 0) {
    options.help = true;
    return options;
  }

  options.command = args.shift();
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
      case "--aggregator":
        options.aggregatorUrl = args.shift();
        break;
      case "--section":
        options.section = args.shift();
        break;
      case "--timeout":
        options.timeoutMs = Number(args.shift());
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

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(2);
});