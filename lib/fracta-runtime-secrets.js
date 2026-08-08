/**
 * Fracta runtime secret hygiene — project SoT keys into systemd/env copies.
 *
 * Authority: workstation inseme/.env (same dual-authority model as secrets-management.md).
 * Runtime copies are NOT authority: /etc/cogentia/magistral.env, guide.env, jhn-mcp.env.
 *
 * Never prints secret values. Reports fingerprints only.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fingerprintValue,
  isValidEnvKey,
  readKeyFromFile,
} from "./env-key-file.js";
import { expandHome } from "./paths.js";

const operiumRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

/** Keys that must stay aligned on Fracta for Guide / Magistral / JHN OpenAI surface. */
export const FRACTA_RUNTIME_KEY_CATALOG = [
  {
    key: "OPENAI_API_KEY",
    required: true,
    targets: [
      "/etc/cogentia/magistral.env",
      "/srv/cogentia/secrets/guide.env",
    ],
    restarts: ["magistral.service", "mcp-cogentia.service"],
    note: "Embeddings + chat providers via Magistral/Guide",
  },
  {
    key: "COGENTIA_API_KEY",
    required: false,
    targets: ["/etc/cogentia/magistral.env"],
    restarts: ["magistral.service"],
    note: "System bearer for coding map / gateway",
  },
  {
    key: "COGENTIA_MCP_JHN_TOKEN",
    required: false,
    targets: ["/srv/cogentia/secrets/jhn-mcp.env"],
    restarts: ["mcp-cogentia.service"],
    note: "JHN MCP mutate attestation",
  },
  {
    key: "COGENTIA_JHN_OWNER_API_KEY",
    required: false,
    targets: [
      "/srv/cogentia/secrets/jhn-mcp.env",
      "/srv/cogentia/secrets/guide.env",
    ],
    restarts: ["mcp-cogentia.service"],
    note: "Jean Hugues owner tier for OpenAI surface /guide/v1",
  },
  {
    key: "OPENAI_ADMIN_KEY",
    required: false,
    targets: ["/srv/cogentia/secrets/guide.env"],
    restarts: [],
    note: "OpenAI Admin API key for Organization usage & costs queries",
  },
];

export function defaultSotPath(env = process.env) {
  const configured = expandHome(env.OPERIUM_SECRET_SOT || env.INSEME_ENV || "");
  if (configured) return path.resolve(configured);
  return path.resolve(operiumRoot, "..", "inseme", ".env");
}

/**
 * @param {object} options
 * @param {boolean} [options.apply=false]
 * @param {boolean} [options.restart=true] with apply: restart consumers after writes
 * @param {string} [options.sot]
 * @param {string} [options.host='fracta']
 * @param {string[]} [options.keys] subset of catalog keys
 * @param {(cmd: string[], opts?) => {status:number, stdout:string, stderr:string}} [options.run]
 * @param {typeof FRACTA_RUNTIME_KEY_CATALOG} [options.catalog]
 */
export function runFractaRuntimeSecretsProcedure(options = {}) {
  const apply = Boolean(options.apply);
  const wantRestart = options.restart !== false;
  const host = options.host || "fracta";
  const sotPath = path.resolve(options.sot || defaultSotPath());
  const catalog = filterCatalog(
    options.catalog || FRACTA_RUNTIME_KEY_CATALOG,
    options.keys
  );
  const run = options.run || defaultRun;

  const steps = [];
  let ok = true;
  const restarts = new Set();

  if (!fs.existsSync(sotPath)) {
    return finalize({
      ok: false,
      apply,
      host,
      sot: { path: sotPath, present: false },
      steps: [],
      error: "sot_missing",
      message: `SoT missing: ${sotPath}`,
      value_disclosed: false,
    });
  }

  const sotKeys = {};
  for (const entry of catalog) {
    if (!isValidEnvKey(entry.key)) {
      ok = false;
      steps.push({ id: entry.key, error: "invalid_env_key" });
      continue;
    }
    const read = readKeyFromFile(sotPath, entry.key);
    const fp = fingerprintValue(read.value);
    sotKeys[entry.key] = {
      present: read.present && !read.empty,
      fingerprint: fp || null, // full SHA-256 for compare; slice only in reports
      value: read.present && !read.empty ? read.value : null,
    };
    if (entry.required && !sotKeys[entry.key].present) {
      ok = false;
      steps.push({
        id: `sot:${entry.key}`,
        action: "missing_required",
        required: true,
      });
    }
  }

  // Remote verify (fingerprints only)
  for (const entry of catalog) {
    const sot = sotKeys[entry.key];
    if (!sot?.present) {
      steps.push({
        id: entry.key,
        action: "skip_not_in_sot",
        targets: entry.targets,
      });
      continue;
    }

    const targetReports = [];
    let keyAligned = true;

    for (const target of entry.targets) {
      const remoteFp = remoteKeyFingerprint(run, host, target, entry.key);
      const match =
        remoteFp.ok &&
        remoteFp.fingerprint &&
        remoteFp.fingerprint === sot.fingerprint;
      if (!match) keyAligned = false;
      targetReports.push({
        path: target,
        present: remoteFp.present,
        match,
        fingerprint: remoteFp.fingerprint
          ? remoteFp.fingerprint.slice(0, 12)
          : null,
        error: remoteFp.error || null,
      });
    }

    const step = {
      id: entry.key,
      note: entry.note,
      sot_fingerprint: sot.fingerprint?.slice(0, 12) || null,
      targets: targetReports,
      aligned: keyAligned,
      action: apply
        ? keyAligned
          ? "noop"
          : "write"
        : keyAligned
          ? "ok"
          : "would_write",
      restarts: entry.restarts || [],
    };

    if (apply && !keyAligned) {
      const write = remoteWriteKey(run, host, entry.key, sot.value, entry.targets);
      step.write = {
        ok: write.ok,
        error: write.error || null,
        targets: write.targets,
      };
      if (!write.ok) {
        ok = false;
        step.action = "write_failed";
      } else {
        step.aligned = true;
        step.action = "wrote";
        for (const svc of entry.restarts || []) restarts.add(svc);
      }
    } else if (!apply && !keyAligned) {
      ok = false;
    }

    steps.push(step);
  }

  const restartStep = {
    id: "restarts",
    services: [...restarts],
    action: "planned",
  };

  if (apply && wantRestart && restarts.size) {
    const rr = remoteRestart(run, host, [...restarts]);
    restartStep.action = rr.ok ? "restarted" : "restart_failed";
    restartStep.ok = rr.ok;
    restartStep.stderr_present = Boolean(rr.stderr?.trim());
    if (!rr.ok) ok = false;
  } else if (apply && restarts.size && !wantRestart) {
    restartStep.action = "skipped_no_restart_flag";
    restartStep.note = "Pass restart:true (default) or re-run with restarts";
  } else if (!apply && !ok) {
    restartStep.action = "would_restart_on_apply";
    restartStep.services = uniqueRestarts(catalog, steps);
  }

  steps.push(restartStep);

  // Smoke: OpenAI models from remote with OPENAI key if present
  const smoke = { id: "smoke", action: "planned" };
  if (apply && sotKeys.OPENAI_API_KEY?.present) {
    const sm = remoteOpenAiModelsSmoke(run, host);
    smoke.action = "ran";
    smoke.openai_models_http = sm.http;
    smoke.ok = sm.http === 200;
    if (!sm.ok) {
      // soft: key file may be fine but network blip
      smoke.note = sm.error || "openai_models_not_200";
    }
  }
  steps.push(smoke);

  return finalize({
    ok,
    apply,
    host,
    sot: {
      path: sotPath,
      present: true,
      keys: Object.fromEntries(
        Object.entries(sotKeys).map(([k, v]) => [
          k,
          { present: v.present, fingerprint: v.fingerprint?.slice(0, 12) || null },
        ])
      ),
    },
    steps,
    value_disclosed: false,
    next_actions: ok
      ? apply
        ? ["Done. Re-run dry-run to confirm aligned."]
        : ["node scripts/ops/apply-fracta-runtime-secrets.js --apply --host fracta"]
      : [
          "Fix SoT missing required keys in inseme/.env",
          "node scripts/ops/apply-fracta-runtime-secrets.js --apply --host fracta",
          "Optional vault: cd inseme/apps/platform && node scripts/sync-secrets.js --apply --vault",
        ],
  });
}

function filterCatalog(catalog, keys) {
  if (!keys?.length) return catalog;
  const set = new Set(keys.map(String));
  return catalog.filter((e) => set.has(e.key));
}

function uniqueRestarts(catalog, steps) {
  const out = new Set();
  for (const step of steps) {
    if (step.action === "would_write" || step.action === "write") {
      const entry = catalog.find((c) => c.key === step.id);
      for (const s of entry?.restarts || []) out.add(s);
    }
  }
  return [...out];
}

function remoteKeyFingerprint(run, host, filePath, key) {
  const b64 = Buffer.from(
    [
      "set -e",
      `f=${shellQuote(filePath)}`,
      `key=${shellQuote(key)}`,
      'if [ ! -f "$f" ]; then echo MISSING; exit 0; fi',
      'line=$(grep -m1 "^${key}=" "$f" 2>/dev/null || true)',
      'if [ -z "$line" ]; then echo ABSENT; exit 0; fi',
      'v=${line#${key}=}',
      'v=$(printf %s "$v" | tr -d "\\r")',
      'printf %s "$v" | sha256sum | awk \'{print $1}\'',
    ].join("\n"),
    "utf8"
  ).toString("base64");

  const r = run(
    ["ssh", "-o", "BatchMode=yes", host, `echo ${b64} | base64 -d | sudo bash`],
    { timeout: 60000 }
  );
  if (r.status !== 0) {
    return {
      ok: false,
      present: false,
      fingerprint: null,
      error: "ssh_failed",
    };
  }
  const out = String(r.stdout || "").trim().split(/\r?\n/).pop();
  if (out === "MISSING" || out === "ABSENT") {
    return { ok: true, present: false, fingerprint: null };
  }
  if (!/^[a-f0-9]{64}$/i.test(out)) {
    return {
      ok: false,
      present: false,
      fingerprint: null,
      error: "bad_fingerprint_output",
    };
  }
  return { ok: true, present: true, fingerprint: out.toLowerCase() };
}

function remoteWriteKey(run, host, key, value, targets) {
  const script2 = buildRemoteWriteScript(key, value, targets);
  const scriptB64 = Buffer.from(script2, "utf8").toString("base64");
  const r = run(
    [
      "ssh",
      "-o",
      "BatchMode=yes",
      host,
      `echo ${scriptB64} | base64 -d | sudo bash`,
    ],
    { timeout: 120000 }
  );
  return {
    ok: r.status === 0 && String(r.stdout || "").includes("OK"),
    error: r.status === 0 ? null : "remote_write_failed",
    targets,
    stdout_tail: String(r.stdout || "")
      .split(/\r?\n/)
      .filter((l) => l && !l.includes(value))
      .slice(-8),
  };
}

function buildRemoteWriteScript(key, value, targets) {
  // Embed key/value as base64 to avoid shell metachar issues
  const keyB64 = Buffer.from(key, "utf8").toString("base64");
  const valB64 = Buffer.from(value, "utf8").toString("base64");
  const targetsList = targets.map((t) => shellQuote(t)).join(" ");
  return `#!/usr/bin/env bash
set -euo pipefail
KEY=$(printf %s '${keyB64}' | base64 -d)
VALUE=$(printf %s '${valB64}' | base64 -d)
SHA=$(printf %s "$VALUE" | sha256sum | awk '{print $1}')
for f in ${targetsList}; do
  if [ ! -f "$f" ]; then
    mkdir -p "$(dirname "$f")"
    touch "$f"
    chmod 640 "$f" || true
  fi
  cp -a "$f" "$f.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  tmp=$(mktemp)
  awk -v k="$KEY" -v v="$VALUE" 'BEGIN{done=0} index($0, k"=")==1 {print k"="v; done=1; next} {print} END{if(!done) print k"="v}' "$f" > "$tmp"
  cat "$tmp" > "$f"
  rm -f "$tmp"
  got=$(grep -m1 "^$KEY=" "$f" | sed "s/^$KEY=//" | tr -d '\\r')
  gsha=$(printf %s "$got" | sha256sum | awk '{print $1}')
  echo "WROTE $f sha8=\${gsha:0:8}"
  [ "$gsha" = "$SHA" ] || exit 3
done
echo OK
`;
}

function remoteRestart(run, host, services) {
  const list = services.map(shellQuote).join(" ");
  const r = run(
    [
      "ssh",
      "-o",
      "BatchMode=yes",
      host,
      `sudo systemctl restart ${list} && sleep 2 && systemctl is-active ${list}`,
    ],
    { timeout: 120000 }
  );
  return {
    ok: r.status === 0,
    stderr: r.stderr,
    stdout: r.stdout,
  };
}

function remoteOpenAiModelsSmoke(run, host) {
  const script = `
set -e
KEY=$(grep -m1 '^OPENAI_API_KEY=' /etc/cogentia/magistral.env | sed 's/^OPENAI_API_KEY=//' | tr -d '\\r')
code=$(curl -sS -o /tmp/oai_m.json -w '%{http_code}' -m 45 -H "Authorization: Bearer $KEY" https://api.openai.com/v1/models || echo err)
echo "$code"
`.trim();
  const b64 = Buffer.from(script, "utf8").toString("base64");
  const r = run(
    ["ssh", "-o", "BatchMode=yes", host, `echo ${b64} | base64 -d | sudo bash`],
    { timeout: 90000 }
  );
  const http = String(r.stdout || "").trim().split(/\r?\n/).pop();
  return {
    ok: http === "200",
    http: http === "err" ? 0 : Number(http) || 0,
    error: r.status !== 0 ? "smoke_ssh_failed" : null,
  };
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function defaultRun(cmd, opts = {}) {
  const r = spawnSync(cmd[0], cmd.slice(1), {
    encoding: "utf8",
    timeout: opts.timeout || 120000,
    env: process.env,
    shell: false,
  });
  return {
    status: r.status == null ? 1 : r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

function finalize(report) {
  return {
    schema: "operium.fracta-runtime-secrets.v1",
    value_disclosed: false,
    ...report,
  };
}
