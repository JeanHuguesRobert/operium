import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveCogentiaRoot } from "../paths.js";
import { parseBooleanEnv } from "./config.js";

export const DEFAULT_NAV_ASSIST_GATEWAY_PORT = 8765;
export const DEFAULT_NAV_ASSIST_GATEWAY_RETRY_MS = 10_000;

/**
 * Hold the local navigation-assistant extension on loopback even when the
 * TUI is down. Imports Cogentia's gateway from the sibling checkout
 * (resolveCogentiaRoot). Bind is 127.0.0.1 only; EADDRINUSE is retried so a
 * live TUI bridge can keep the port until it exits.
 */
export async function attachNavigationAssistantGateway(options = {}) {
  const env = options.env || process.env;
  const stop = async () => {};

  if (!parseBooleanEnv(env.ONA_NAV_ASSIST_GATEWAY, true)) {
    return { ok: true, skipped: true, reason: "disabled", listening: false, deferred: false, stop };
  }

  const port = Number(options.port ?? env.ONA_NAV_ASSIST_GATEWAY_PORT ?? env.NAV_ASSIST_PORT ?? DEFAULT_NAV_ASSIST_GATEWAY_PORT);
  const retryMs = Number(options.retryMs ?? env.ONA_NAV_ASSIST_GATEWAY_RETRY_MS ?? DEFAULT_NAV_ASSIST_GATEWAY_RETRY_MS);
  const hosts = options.hosts || ["127.0.0.1"];
  const instance = options.instance || env.NAV_ASSIST_GATEWAY_INSTANCE || env.ONA_HOSTNAME || "local";

  let create = options.createNavigationGateway;
  if (!create) {
    const resolveRoot = options.resolveCogentiaRoot || resolveCogentiaRoot;
    const root = resolveRoot(env);
    if (!root) {
      return { ok: true, skipped: true, reason: "cogentia_root_missing", listening: false, deferred: false, stop };
    }
    const modulePath = path.join(root, "scripts", "ops", "navigation-assistant-gateway.js");
    try {
      ({ createNavigationGateway: create } = await import(pathToFileURL(modulePath).href));
    } catch (error) {
      return {
        ok: false,
        skipped: true,
        reason: "import_failed",
        message: error.message,
        listening: false,
        deferred: false,
        stop,
      };
    }
  }

  const handle = {
    ok: true,
    skipped: false,
    listening: false,
    deferred: false,
    port,
    hosts,
    instance,
    gateway: null,
    reason: null,
    message: null,
  };

  let stopped = false;
  let timer = null;
  let gateway = null;

  handle.stop = async () => {
    stopped = true;
    clearTimeout(timer);
    if (gateway) {
      await gateway.close().catch(() => {});
    }
    gateway = null;
    handle.gateway = null;
    handle.listening = false;
  };

  const attempt = async () => {
    if (stopped) return;
    try {
      gateway = create({ instance });
      await gateway.listen(port, hosts);
      handle.gateway = gateway;
      handle.listening = true;
      handle.deferred = false;
      handle.reason = null;
      handle.message = null;
    } catch (error) {
      if (gateway) await gateway.close().catch(() => {});
      gateway = null;
      handle.gateway = null;
      handle.listening = false;
      if (error.code === "EADDRINUSE") {
        handle.deferred = true;
        handle.reason = "eaddrinuse";
        handle.message = error.message;
        timer = setTimeout(() => {
          attempt().catch(() => {});
        }, retryMs);
        return;
      }
      handle.ok = false;
      handle.reason = error.code || "listen_failed";
      handle.message = error.message;
    }
  };

  await attempt();
  return handle;
}
