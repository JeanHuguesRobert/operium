import { spawn } from "node:child_process";
import {
  defaultAggregatorUrl,
  resolveCogentiaInvokeScript,
  resolveCogentiaRoot,
} from "./paths.js";
import { fetchJson } from "./probes.js";
import { logActionInvocation } from "./node-agent/invocation-log.js";

export function buildInvokeArgv(options = {}) {
  const argv = ["invoke"];
  const blackboardUrl = String(
    options.blackboardUrl
    || options.aggregatorUrl
    || defaultAggregatorUrl(options.env),
  ).trim();
  if (blackboardUrl) {
    argv.push("--blackboard-url", blackboardUrl);
  }
  if (options.endpoint) argv.push("--endpoint", String(options.endpoint));
  if (options.token) argv.push("--token", String(options.token));
  if (options.attractorId) argv.push("--attractor-id", String(options.attractorId));
  if (options.capability) argv.push("--capability", String(options.capability));
  if (options.hostname) argv.push("--hostname", String(options.hostname));
  if (options.model) argv.push("--model", String(options.model));
  if (options.prompt) argv.push("--prompt", String(options.prompt));
  if (options.expect) argv.push("--expect", String(options.expect));
  if (options.sessionId) argv.push("--session-id", String(options.sessionId));
  if (options.cwd) argv.push("--cwd", String(options.cwd));
  if (options.repl) argv.push("--repl");
  if (options.stream) argv.push("--stream");
  if (options.allowDegraded) argv.push("--allow-degraded");
  if (options.contentOnly) argv.push("--content-only");
  if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    argv.push("--timeout-ms", String(Math.trunc(options.timeoutMs)));
  }
  return argv;
}

export function resolveActionRouteToken(options = {}) {
  const env = options.env || process.env;
  return String(
    options.actionRouteToken
    || env.COGENTIA_ACTION_ROUTE_TOKEN
    || env.COGENTIA_ADMIN_TOKEN
    || "",
  ).trim() || null;
}

export function buildGuideActionRouteBody(options = {}) {
  const body = {
    model: options.model,
    prompt: options.prompt,
  };

  if (options.capability) body.capability = options.capability;
  if (options.attractorId) body.attractor_id = options.attractorId;
  if (options.hostname) body.hostname = options.hostname;
  if (options.sessionId) body.session_id = options.sessionId;
  if (options.expect) body.expect = options.expect;
  if (options.repl) body.repl = true;
  if (options.allowDegraded) body.allow_degraded = true;

  return body;
}

export async function invokeToolViaGuide(options = {}) {
  const env = options.env || process.env;
  const aggregatorUrl = String(
    options.aggregatorUrl || defaultAggregatorUrl(env),
  ).trim().replace(/\/$/, "");
  const routeUrl = `${aggregatorUrl}/ops/route/action`;
  const routeToken = resolveActionRouteToken(options);

  if (!routeToken) {
    return {
      schema: "operium.invoke.tool.v1",
      ok: false,
      via: "guide",
      error: "missing_action_route_token",
      message: "COGENTIA_ACTION_ROUTE_TOKEN is required for --via guide",
      route_url: routeUrl,
    };
  }

  if (!options.model) {
    return {
      schema: "operium.invoke.tool.v1",
      ok: false,
      via: "guide",
      error: "missing_model",
      message: "--model is required (e.g. shell-repl)",
    };
  }

  if (!options.prompt) {
    return {
      schema: "operium.invoke.tool.v1",
      ok: false,
      via: "guide",
      error: "missing_prompt",
      message: "--prompt is required",
    };
  }

  const fetchImpl = options.fetch || fetchJson;
  const response = await fetchImpl(routeUrl, {
    method: "POST",
    timeoutMs: options.timeoutMs,
    headers: {
      Authorization: `Bearer ${routeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildGuideActionRouteBody(options)),
  });

  const body = response.body || {};
  const ok = response.ok && body.ok !== false;

  const result = ok
    ? {
      schema: "operium.invoke.tool.v1",
      ok: true,
      command: "invoke",
      subcommand: "tool",
      via: "guide",
      route_url: routeUrl,
      service: body.service || "cogentia-action-route",
      model: body.model || options.model,
      content: body.content || "",
      session_id: body.session_id || null,
      timing: body.timing || null,
      route: body.route || null,
      invoke: body,
    }
    : {
      schema: "operium.invoke.tool.v1",
      ok: false,
      via: "guide",
      route_url: routeUrl,
      error: body.error || "route_action_failed",
      message: body.message || null,
      detail: body.detail || null,
      status: response.status || null,
      route: body.route || null,
      invoke: body,
    };

  logActionInvocation({
    env,
    ok: result.ok,
    route: "POST /ops/route/action",
    summary: buildInvocationSummary(result),
  });

  if (options.contentOnly && result.ok) {
    return {
      schema: "operium.invoke.tool.v1",
      ok: true,
      via: "guide",
      content: result.content,
    };
  }

  return result;
}

export async function invokeTool(options = {}) {
  if (options.viaGuide || options.via === "guide") {
    return invokeToolViaGuide(options);
  }

  const script = resolveCogentiaInvokeScript(options.env);
  const cogentiaRoot = resolveCogentiaRoot(options.env);
  if (!script || !cogentiaRoot) {
    return {
      schema: "operium.invoke.tool.v1",
      ok: false,
      error: "cogentia_invoke_script_missing",
      message: "cogentia scripts/agent-gateway-invoke.js not found — set OPERIUM_COGENTIA_ROOT",
    };
  }

  if (!options.model) {
    return {
      schema: "operium.invoke.tool.v1",
      ok: false,
      error: "missing_model",
      message: "--model is required (e.g. shell-repl)",
    };
  }
  if (!options.prompt) {
    return {
      schema: "operium.invoke.tool.v1",
      ok: false,
      error: "missing_prompt",
      message: "--prompt is required",
    };
  }

  const argv = buildInvokeArgv(options);
  const child = spawn(process.execPath, [script, ...argv], {
    cwd: cogentiaRoot,
    env: { ...process.env, ...(options.env || {}) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  const exitCode = await new Promise(resolve => {
    child.on("error", () => resolve(127));
    child.on("close", code => resolve(code ?? 1));
  });

  if (options.contentOnly) {
    const text = stdout.trim();
    if (exitCode !== 0) {
      return {
        schema: "operium.invoke.tool.v1",
        ok: false,
        error: "invoke_failed",
        exit_code: exitCode,
        stderr: stderr.trim() || null,
        stdout: text || null,
      };
    }
    return {
      schema: "operium.invoke.tool.v1",
      ok: true,
      content: text,
      exit_code: 0,
    };
  }

  let invokeBody = null;
  const jsonSource = (stdout || stderr).trim();
  if (jsonSource) {
    try {
      invokeBody = JSON.parse(jsonSource);
    } catch {
      invokeBody = null;
    }
  }

  if (exitCode !== 0 || invokeBody?.ok === false) {
    return {
      schema: "operium.invoke.tool.v1",
      ok: false,
      error: invokeBody?.error || "invoke_failed",
      message: invokeBody?.message || stderr.trim() || null,
      detail: invokeBody?.detail || null,
      exit_code: exitCode,
      invoke: invokeBody,
      argv,
      cogentia_root: cogentiaRoot,
    };
  }

  return {
    schema: "operium.invoke.tool.v1",
    ok: true,
    command: "invoke",
    subcommand: "tool",
    model: invokeBody?.model || options.model,
    content: invokeBody?.content || "",
    session_id: invokeBody?.session_id || null,
    timing: invokeBody?.timing || null,
    route: invokeBody?.route || null,
    invoke: invokeBody,
    cogentia_root: cogentiaRoot,
  };
}

function buildInvocationSummary(result = {}) {
  const routedVia = result.route?.routed_via || result.via || "unknown";
  const model = result.model || "?";
  const attractor = result.route?.attractor_id || "none";
  return `model=${model} ok=${result.ok ? "true" : "false"} routed_via=${routedVia} attractor=${attractor}`;
}