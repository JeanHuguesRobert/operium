#!/usr/bin/env node

import { formatHumanUp } from "../lib/format-human.js";
import {
  formatNodeDiagnoseHuman,
  formatNodeDriftHuman,
  formatNodeLogsHuman,
  formatNodePeersHuman,
  formatNodeSnapshotHuman,
  formatNodeStatusHuman,
} from "../lib/format-node-human.js";
import { formatInvokeHuman } from "../lib/format-invoke-human.js";
import { formatWipHuman } from "../lib/format-wip-human.js";
import {
  exitCodeForNodeResult,
  runNodeCliCommand,
} from "../lib/node-cli.js";
import { buildWipStatus, handoffWip, resumeWip } from "../lib/git-wip.js";
import { invokeTool } from "../lib/invoke-tool.js";
import { buildOperiumUp, exitCodeForUp } from "../lib/operium-up.js";
import {
  defaultBacklogPath,
  evaluateGate,
  filterItems,
  formatBacklogHuman,
  formatGateHuman,
  loadBacklog,
} from "../lib/backlog.js";
import { runRatesUpdate } from "../lib/rates.js";
import { runCalendarCommand } from "../lib/calendar-cli.js";
import { formatCalendarHuman } from "../lib/format-calendar-human.js";

const HELP = `operium — versioned operational environment registry CLI

Usage:
  operium up [options]             Check what is up (Fractanet observer)
  operium backlog list [options]   List Bug/Feature register (Fix Bugs First)
  operium backlog gate --subsystem <slug>   Feature gate for a subsystem
  operium invoke tool [options]    Route a tool invocation via blackboard → agent-gateway
  operium wip status [options]     Inspect local Git WIP state
  operium handoff wip [options]    Commit and push a resumable WIP branch
  operium resume wip [options]     Fetch and resume a WIP branch
  operium node status [options]    Local ONA status (GET /node/status)
  operium node peers [options]     Known peer nodes (GET /node/peers)
  operium node logs [options]      ONA event log (GET /node/logs)
  operium node snapshot [options]  Full ONA projection (GET /node/snapshot)
  operium node drift [options]     Node-local catalogue drift (GET /node/drift)
  operium node diagnose [options]  Merge operium up + ONA status/drift (#51)
  operium rates update [options]   Fetch live model rate cards from providers
  operium calendar list [options]  FractaCalendar projection via ONA HTTP
  operium calendar schedule        POST a cop/node.wake.v1 packet (--file)
  operium calendar watch dns       Sugar: POST a DNS observation wake packet
  operium calendar tick            POST /node/calendar/tick (deliver due wakes)
  operium calendar ics             ICS view of the same HTTP projection

Options:
  --json                  Machine-readable operium.up.v1 output (default)
  --human                 Human-readable summary
  --probe                 Run live probes (default)
  --no-probe              Catalogue and docs only
  --registry <path>       Private registry YAML (default ~/.cogentia/registry/resources.yaml)
  --aggregator <url>      Runtime aggregator base URL (default https://cogentia.fractavolta.com)
  --section <name>        catalogue | mesh | services | blackboard | retrieval | action | public_face
  --timeout <ms>          Per-probe timeout (default 25000)
  --quiet                 Summary headline only (human mode)
  -h, --help              Show help

Node options:
  --url <base>            ONA base URL (default http://127.0.0.1:8794 or ONA_URL)
  --token <bearer>        ONA read token (default ONA_READ_TOKEN or ONA_ADMIN_TOKEN)
  --fresh                 Peers: fresh attractors only; snapshot: COP fetch from peer
  --peer <node_id>        Snapshot: read peer_snapshots cache or fetch via COP
  --kind <name>           Logs: filter by event kind
  --limit <n>             Logs: max rows (default 20)
  --since <iso>           Logs: logged_at >= since

Invoke tool options:
  --capability <cap>      blackboard capability (e.g. dev.tools.shell)
  --model <id>            gateway model (e.g. shell-repl) — required
  --prompt, -p <text>     user message — required
  --repl                  REPL adapter mode
  --expect <pattern>      REPL expect pattern
  --session-id <id>       reuse REPL session
  --endpoint <url>        direct gateway URL (skip blackboard)
  --token <bearer>        gateway bearer token
  --attractor-id <id>     pin attractor id
  --host <hostname>       filter attractor host
  --content-only          print assistant text only
  --allow-degraded        accept degraded attractors
  --via guide             Route via fracta POST /ops/route/action (#52)

Calendar options (issue #29; protocol: docs/calendar-cop-wake-protocol.md):
  --file <path>           Wake packet JSON for calendar schedule
  --local                 Use local SQLite instead of ONA HTTP (tests / no daemon)
  --domain <name>         DNS watch sugar only
  --expected-ns <list>    Comma-separated expected nameservers (sugar)
  --deadline <iso>        Escalation / stop deadline
  --first-delay <ms>      Delay before the first watch (default 1h)
  --interval <ms>         Cadence after the first watch (default 3h)
  --service <slug>        Filter projection by service
  --project <slug>        Filter projection by project
  --format ics            Alias of calendar ics

Backlog options (Fix Bugs First — docs/fix-bugs-first.md):
  --kind <bug|feature|incident|debt>
  --status <open|openish|in_progress|blocked|deferred|done>
  --subsystem <slug>      Required for gate; filter for list
  --severity <level>      critical|high|medium|low
  --backlog <path>        Default backlog/items.yaml

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
    capability: null,
    model: null,
    prompt: null,
    expect: null,
    sessionId: null,
    endpoint: null,
    token: null,
    attractorId: null,
    invokeHost: null,
    repl: false,
    stream: false,
    allowDegraded: false,
    contentOnly: false,
    via: null,
    onaUrl: null,
    onaToken: null,
    fresh: false,
    logKind: null,
    logLimit: null,
    logSince: null,
    peerNodeId: null,
    filterKind: null,
    filterStatus: null,
    filterSeverity: null,
    subsystem: null,
    backlogPath: null,
    domain: null,
    expectedNs: null,
    deadline: null,
    firstDelayMs: null,
    intervalMs: null,
    project: null,
    service: null,
    format: null,
    watchKind: null,
    file: null,
    local: false,
  };

  const args = [...argv];
  if (args.length === 0) {
    options.help = true;
    return options;
  }

  options.command = args.shift();
  if (options.command === "invoke" && args[0] === "tool") {
    options.subcommand = args.shift();
  } else if (
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
  } else if (options.command === "node") {
    options.subcommand = args.shift() || null;
  } else if (options.command === "backlog") {
    options.subcommand = args.shift() || "list";
  } else if (options.command === "rates") {
    options.subcommand = args.shift() || "update";
  } else if (options.command === "calendar") {
    options.subcommand = args.shift() || "list";
    if (options.subcommand === "watch" && args[0] && !args[0].startsWith("-")) {
      options.watchKind = args.shift();
    }
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
      case "--capability":
        options.capability = args.shift();
        break;
      case "--model":
        options.model = args.shift();
        break;
      case "--prompt":
      case "-p":
        options.prompt = args.shift();
        break;
      case "--expect":
        options.expect = args.shift();
        break;
      case "--session-id":
        options.sessionId = args.shift();
        break;
      case "--endpoint":
        options.endpoint = args.shift();
        break;
      case "--token":
        options.token = args.shift();
        break;
      case "--attractor-id":
        options.attractorId = args.shift();
        break;
      case "--host":
        options.invokeHost = args.shift();
        break;
      case "--repl":
        options.repl = true;
        break;
      case "--stream":
        options.stream = true;
        break;
      case "--allow-degraded":
        options.allowDegraded = true;
        break;
      case "--content-only":
        options.contentOnly = true;
        break;
      case "--via":
        options.via = args.shift();
        break;
      case "--url":
        options.onaUrl = args.shift();
        break;
      case "--kind":
        if (options.command === "backlog" || options.command === "calendar") {
          options.filterKind = args.shift();
        } else {
          options.logKind = args.shift();
        }
        break;
      case "--status":
        options.filterStatus = args.shift();
        break;
      case "--subsystem":
        options.subsystem = args.shift();
        break;
      case "--severity":
        options.filterSeverity = args.shift();
        break;
      case "--backlog":
        options.backlogPath = args.shift();
        break;
      case "--limit":
        options.logLimit = Number(args.shift());
        break;
      case "--since":
        options.logSince = args.shift();
        break;
      case "--fresh":
        options.fresh = true;
        break;
      case "--peer":
        options.peerNodeId = args.shift();
        break;
      case "--domain":
        options.domain = args.shift();
        break;
      case "--expected-ns":
        options.expectedNs = args.shift();
        break;
      case "--deadline":
        options.deadline = args.shift();
        break;
      case "--first-delay":
        options.firstDelayMs = Number(args.shift());
        break;
      case "--interval":
        options.intervalMs = Number(args.shift());
        break;
      case "--service":
        options.service = args.shift();
        break;
      case "--project":
        options.project = args.shift();
        break;
      case "--format":
        options.format = args.shift();
        break;
      case "--file":
        options.file = args.shift();
        break;
      case "--local":
        options.local = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        if (options.command === "invoke" && options.subcommand === "tool" && !arg.startsWith("-") && !options.prompt) {
          options.prompt = [arg, ...args].join(" ").trim();
          break;
        }
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

  if (isBacklogCommand(options)) {
    runBacklogCommand(options);
    return;
  }

  if (isCalendarCommand(options)) {
    try {
      const result = await runCalendarCommand({
        subcommand: options.subcommand,
        watchKind: options.watchKind,
        domain: options.domain,
        expectedNs: options.expectedNs,
        deadline: options.deadline,
        firstDelayMs: options.firstDelayMs,
        intervalMs: options.intervalMs,
        service: options.service,
        project: options.project,
        filterStatus: options.filterStatus,
        filterKind: options.filterKind,
        format: options.format,
        file: options.file,
        url: options.onaUrl,
        token: options.onaToken || options.token,
        timeoutMs: options.timeoutMs,
        local: options.local,
      });
      if (result.ics) {
        process.stdout.write(result.ics);
        process.exit(0);
      }
      if (options.human) {
        console.log(formatCalendarHuman(result.body.projection || result.body));
      } else {
        console.log(JSON.stringify(result.body, null, 2));
      }
      process.exit(result.ok ? 0 : 1);
    } catch (error) {
      console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(2);
    }
  }

  if (options.command === "rates") {
    const result = await runRatesUpdate(options);
    if (options.human && result.output) {
      console.log(result.output);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (options.command === "node" && !isNodeCommand(options)) {
    console.error(`unknown_node_subcommand: ${options.subcommand || "(missing)"}`);
    console.error("Run operium --help");
    process.exit(2);
  }

  if (isNodeCommand(options)) {
    const result = await runNodeCliCommand({
      subcommand: options.subcommand,
      url: options.onaUrl,
      token: options.onaToken || options.token,
      fresh: options.fresh,
      peerNodeId: options.peerNodeId,
      logKind: options.logKind,
      logLimit: options.logLimit,
      logSince: options.logSince,
      timeoutMs: options.timeoutMs,
      probe: options.probe,
      registryPath: options.registryPath,
      aggregatorUrl: options.aggregatorUrl,
    });

    if (!result.ok) {
      console.error(JSON.stringify({
        ok: false,
        error: result.error,
        status: result.status,
        url: result.url,
        message: result.message,
      }, null, 2));
      process.exit(2);
    }

    if (options.human) {
      if (options.subcommand === "status") {
        console.log(formatNodeStatusHuman(result.body));
      } else if (options.subcommand === "peers") {
        console.log(formatNodePeersHuman(result.body));
      } else if (options.subcommand === "logs") {
        console.log(formatNodeLogsHuman(result.body));
      } else if (options.subcommand === "snapshot") {
        console.log(formatNodeSnapshotHuman(result.body));
      } else if (options.subcommand === "drift") {
        console.log(formatNodeDriftHuman(result.body));
      } else if (options.subcommand === "diagnose") {
        console.log(formatNodeDiagnoseHuman(result.body));
      } else if (options.subcommand === "calendar") {
        console.log(formatCalendarHuman(result.body));
      } else {
        console.log(JSON.stringify(result.body, null, 2));
      }
    } else {
      console.log(JSON.stringify(result.body, null, 2));
    }

    process.exit(exitCodeForNodeResult(result, options.subcommand));
  }

  if (isInvokeCommand(options)) {
    if (options.via && options.via !== "guide") {
      console.error(`unknown_via: ${options.via}`);
      console.error("Run operium --help");
      process.exit(2);
    }

    const result = await invokeTool({
      aggregatorUrl: options.aggregatorUrl,
      capability: options.capability,
      model: options.model,
      prompt: options.prompt,
      expect: options.expect,
      sessionId: options.sessionId,
      endpoint: options.endpoint,
      token: options.token,
      attractorId: options.attractorId,
      hostname: options.invokeHost,
      repl: options.repl,
      stream: options.stream,
      allowDegraded: options.allowDegraded,
      contentOnly: options.contentOnly,
      timeoutMs: options.timeoutMs,
      viaGuide: options.via === "guide",
      via: options.via,
    });
    if (options.contentOnly && result.ok) {
      process.stdout.write(`${result.content || ""}`);
      if (result.content && !String(result.content).endsWith("\n")) process.stdout.write("\n");
      process.exit(0);
    }
    if (options.human) {
      console.log(formatInvokeHuman(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(result.ok ? 0 : 1);
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

function isBacklogCommand(options) {
  return options.command === "backlog";
}

function runBacklogCommand(options) {
  const sub = options.subcommand || "list";
  if (!["list", "gate"].includes(sub)) {
    console.error(`unknown_backlog_subcommand: ${sub}`);
    console.error("Use: operium backlog list|gate");
    process.exit(2);
  }

  let backlog;
  try {
    backlog = loadBacklog(options.backlogPath || defaultBacklogPath());
  } catch (error) {
    console.error(
      JSON.stringify(
        { ok: false, error: error.code || "backlog_error", message: error.message },
        null,
        2
      )
    );
    process.exit(2);
  }

  if (sub === "gate") {
    if (!options.subsystem) {
      console.error("gate requires --subsystem <slug>");
      process.exit(2);
    }
    const gate = evaluateGate(backlog, options.subsystem);
    if (options.human) {
      console.log(formatGateHuman(gate));
    } else {
      console.log(JSON.stringify({ ok: !gate.blocked, ...gate }, null, 2));
    }
    process.exit(gate.blocked ? 1 : 0);
  }

  const filtered = filterItems(backlog.items, {
    kind: options.filterKind,
    status: options.filterStatus,
    subsystem: options.subsystem,
    severity: options.filterSeverity,
  });
  const payload = {
    schema: "operium.backlog.list.v1",
    path: backlog.path,
    updated_at: backlog.updated_at,
    query: {
      kind: options.filterKind,
      status: options.filterStatus,
      subsystem: options.subsystem,
      severity: options.filterSeverity,
    },
    count: filtered.length,
    items: filtered,
  };
  if (options.human) {
    console.log(formatBacklogHuman(backlog, filtered));
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
  process.exit(0);
}

function isInvokeCommand(options) {
  return options.command === "invoke" && options.subcommand === "tool";
}

function isCalendarCommand(options) {
  return options.command === "calendar";
}

function isNodeCommand(options) {
  return options.command === "node" && ["status", "peers", "logs", "snapshot", "drift", "diagnose", "calendar"].includes(options.subcommand);
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
