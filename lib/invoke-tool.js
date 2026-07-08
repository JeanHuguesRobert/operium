import { spawn } from "node:child_process";
import {
  defaultAggregatorUrl,
  resolveCogentiaInvokeScript,
  resolveCogentiaRoot,
} from "./paths.js";

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

export async function invokeTool(options = {}) {
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