/**
 * Operium backlog — Fix Bugs First register (backlog/items.yaml).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BACKLOG = path.resolve(__dirname, "../backlog/items.yaml");

const BLOCKING_SEVERITIES = new Set(["critical", "high"]);
const VALID_KINDS = new Set(["bug", "feature", "incident", "debt"]);
const VALID_STATUS = new Set(["open", "in_progress", "blocked", "deferred", "done"]);

export function defaultBacklogPath() {
  return process.env.OPERIUM_BACKLOG || DEFAULT_BACKLOG;
}

export function loadBacklog(filePath = defaultBacklogPath()) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    const err = new Error(`backlog_missing: ${abs}`);
    err.code = "backlog_missing";
    throw err;
  }
  const raw = fs.readFileSync(abs, "utf8");
  const doc = YAML.parse(raw);
  if (!doc || typeof doc !== "object") {
    const err = new Error("backlog_invalid: root must be a mapping");
    err.code = "backlog_invalid";
    throw err;
  }
  const items = Array.isArray(doc.items) ? doc.items : [];
  return {
    schema: doc.schema || "operium.backlog.v1",
    updated_at: doc.updated_at || null,
    owner: doc.owner || null,
    path: abs.replaceAll("\\", "/"),
    items: items.map(normalizeItem).filter(Boolean),
  };
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const kind = String(item.kind || "").toLowerCase();
  const status = String(item.status || "open").toLowerCase();
  return {
    id: item.id || null,
    kind: VALID_KINDS.has(kind) ? kind : kind || "unknown",
    title: item.title || "(untitled)",
    subsystem: item.subsystem || "meta",
    severity: item.severity ? String(item.severity).toLowerCase() : null,
    priority: item.priority || null,
    status: VALID_STATUS.has(status) ? status : status,
    evidence: item.evidence || null,
    next_action: item.next_action || null,
    github_issue: item.github_issue ?? null,
    blocks_features:
      item.blocks_features != null
        ? Boolean(item.blocks_features)
        : kind === "bug" && BLOCKING_SEVERITIES.has(String(item.severity || "").toLowerCase()),
    waiver: item.waiver || null,
    opened_at: item.opened_at || null,
    closed_at: item.closed_at || null,
    notes: item.notes || null,
  };
}

export function isWaiverActive(waiver, now = new Date()) {
  if (!waiver || typeof waiver !== "object") return false;
  if (!waiver.reason || !String(waiver.reason).trim()) return false;
  if (waiver.expires_at) {
    const exp = new Date(waiver.expires_at);
    if (Number.isNaN(exp.getTime()) || exp.getTime() < now.getTime()) return false;
  }
  return true;
}

export function isOpenStatus(status) {
  return status === "open" || status === "in_progress" || status === "blocked";
}

/**
 * Bugs that hard-block features in a subsystem.
 */
export function blockingBugs(items, subsystem, now = new Date()) {
  const sub = String(subsystem || "").toLowerCase();
  return (items || []).filter((item) => {
    if (item.kind !== "bug") return false;
    if (!isOpenStatus(item.status)) return false;
    if (String(item.subsystem || "").toLowerCase() !== sub) return false;
    if (!BLOCKING_SEVERITIES.has(String(item.severity || "").toLowerCase())) return false;
    if (item.blocks_features === false) return false;
    if (isWaiverActive(item.waiver, now)) return false;
    return true;
  });
}

export function filterItems(items, query = {}) {
  let out = [...(items || [])];
  if (query.kind) {
    const k = String(query.kind).toLowerCase();
    out = out.filter((i) => i.kind === k);
  }
  if (query.status) {
    const s = String(query.status).toLowerCase();
    if (s === "openish") {
      out = out.filter((i) => isOpenStatus(i.status));
    } else {
      out = out.filter((i) => i.status === s);
    }
  }
  if (query.subsystem) {
    const sub = String(query.subsystem).toLowerCase();
    out = out.filter((i) => String(i.subsystem).toLowerCase() === sub);
  }
  if (query.severity) {
    const sev = String(query.severity).toLowerCase();
    out = out.filter((i) => String(i.severity || "").toLowerCase() === sev);
  }
  return out;
}

export function evaluateGate(backlog, subsystem, now = new Date()) {
  const blockers = blockingBugs(backlog.items, subsystem, now);
  return {
    schema: "operium.backlog.gate.v1",
    subsystem,
    blocked: blockers.length > 0,
    blocking_bugs: blockers.map((b) => ({
      id: b.id,
      title: b.title,
      severity: b.severity,
      next_action: b.next_action,
      github_issue: b.github_issue,
    })),
    rule: "Open bug severity critical|high without active waiver blocks features in subsystem",
    doctrine: "docs/fix-bugs-first.md",
  };
}

export function formatBacklogHuman(backlog, filtered) {
  const items = filtered || backlog.items;
  const lines = [
    `Operium backlog (${backlog.path})`,
    `updated_at: ${backlog.updated_at || "?"} · items: ${items.length}`,
    "",
  ];
  if (!items.length) {
    lines.push("(no items match)");
    return lines.join("\n");
  }
  for (const item of items) {
    const sev = item.severity ? ` sev=${item.severity}` : "";
    const pri = item.priority ? ` pri=${item.priority}` : "";
    const gh = item.github_issue != null ? ` #${item.github_issue}` : "";
    lines.push(
      `- ${item.id || "?"} [${item.kind}/${item.status}] ${item.subsystem}${sev}${pri}${gh}`
    );
    lines.push(`  ${item.title}`);
    if (item.next_action) {
      const na = String(item.next_action).replace(/\s+/g, " ").trim();
      lines.push(`  next: ${na.length > 120 ? na.slice(0, 117) + "…" : na}`);
    }
  }
  return lines.join("\n");
}

export function formatGateHuman(gate) {
  if (!gate.blocked) {
    return `GATE OK — subsystem "${gate.subsystem}" has no blocking bugs (critical/high unwaived).`;
  }
  const lines = [
    `GATE BLOCKED — subsystem "${gate.subsystem}" (${gate.blocking_bugs.length} bug(s))`,
    `Fix Bugs First: do not start features here until bugs are fixed or waived.`,
    "",
  ];
  for (const b of gate.blocking_bugs) {
    lines.push(`- ${b.id} [${b.severity}] ${b.title}`);
    if (b.next_action) {
      const na = String(b.next_action).replace(/\s+/g, " ").trim();
      lines.push(`  next: ${na.length > 120 ? na.slice(0, 117) + "…" : na}`);
    }
  }
  return lines.join("\n");
}
