export const OBLIGATION_SCHEMA = "operium.calendar.obligation.v1";
export const PROJECTION_SCHEMA = "operium.calendar.projection.v1";

export function obligationFromScheduledJob(job, context = {}) {
  const jobId = String(job?.job_id || "").trim();
  return {
    schema: OBLIGATION_SCHEMA,
    id: `job:${jobId}`,
    kind: String(job?.kind || "cadence"),
    status: job?.enabled === false ? "paused" : "active",
    owner_or_mandate: context.owner_or_mandate || "operium-node-agent",
    scope: context.scope || "node",
    target_node: context.node_id || null,
    service: inferService(job),
    project: inferProject(job, context),
    earliest_at: null,
    next_run_at: job?.next_run_at || null,
    cadence_or_trigger: {
      kind: "interval",
      interval_ms: Number(job?.interval_ms || 0),
    },
    deadline: null,
    priority: "normal",
    interruptible: true,
    budget: null,
    stop_condition: { type: "none" },
    escalation_policy: null,
    last_run_at: job?.last_run_at || null,
    last_ok: job?.last_ok ?? null,
    last_evidence: lastEvidenceFromJob(job),
    source_of_truth: `scheduled_jobs:${jobId}`,
    authorized: false,
    executes: true,
    config: job?.config && typeof job.config === "object" ? stripSecrets(job.config) : {},
    run_count: Number(job?.run_count || 0),
    created_at: null,
    updated_at: job?.updated_at || null,
    closed_at: null,
  };
}

export function normalizeObligation(raw = {}, context = {}) {
  const id = String(raw.id || "").trim();
  const cadence = raw.cadence_or_trigger || raw.cadence || null;
  return {
    schema: OBLIGATION_SCHEMA,
    id,
    kind: String(raw.kind || "watch"),
    status: String(raw.status || "active"),
    owner_or_mandate: raw.owner_or_mandate || context.owner_or_mandate || null,
    scope: raw.scope || context.scope || "node",
    target_node: raw.target_node || context.node_id || null,
    service: raw.service || inferService(raw) || null,
    project: raw.project || inferProject(raw, context) || null,
    earliest_at: raw.earliest_at || null,
    next_run_at: raw.status === "closed"
      ? (raw.next_run_at || null)
      : (raw.next_run_at || raw.earliest_at || null),
    cadence_or_trigger: cadence,
    deadline: raw.deadline || null,
    priority: raw.priority || "normal",
    interruptible: raw.interruptible !== false,
    budget: raw.budget || null,
    stop_condition: raw.stop_condition || { type: "none" },
    escalation_policy: raw.escalation_policy || raw.escalation || null,
    last_run_at: raw.last_run_at || null,
    last_ok: raw.last_ok ?? null,
    last_evidence: raw.last_evidence || null,
    source_of_truth: raw.source_of_truth || (id ? `calendar_obligations:${id}` : "unknown"),
    authorized: false,
    executes: Boolean(raw.executes),
    config: raw.config && typeof raw.config === "object" ? stripSecrets(raw.config) : {},
    run_count: Number(raw.run_count || 0),
    created_at: raw.created_at || null,
    updated_at: raw.updated_at || null,
    closed_at: raw.closed_at || null,
  };
}

export function dnsWatchObligation(spec = {}, context = {}) {
  const domain = String(spec.domain || "").trim().toLowerCase();
  if (!domain) throw new Error("dns_watch_requires_domain");
  const expected = normalizeNsList(spec.expected_ns || spec.expectedNameservers || []);
  if (expected.length < 1) throw new Error("dns_watch_requires_expected_ns");

  const nowMs = Date.parse(spec.now || new Date().toISOString());
  const firstDelayMs = Number(spec.first_delay_ms ?? 60 * 60 * 1000);
  const intervalMs = Number(spec.interval_ms ?? 3 * 60 * 60 * 1000);
  const escalateAfterMs = Number(spec.escalate_after_ms ?? 24 * 60 * 60 * 1000);
  const earliest = new Date(nowMs + firstDelayMs).toISOString();
  const deadline = spec.deadline || new Date(nowMs + escalateAfterMs).toISOString();

  return normalizeObligation({
    id: spec.id || `dns-delegation:${domain}`,
    kind: "dns.watch",
    status: "active",
    owner_or_mandate: spec.owner_or_mandate || "observation-only",
    scope: spec.scope || "project",
    target_node: spec.target_node || context.node_id || null,
    service: "dns",
    project: spec.project || domain,
    earliest_at: earliest,
    next_run_at: earliest,
    cadence_or_trigger: {
      kind: "after_first",
      first_delay_ms: firstDelayMs,
      interval_ms: intervalMs,
    },
    deadline,
    priority: spec.priority || "high",
    interruptible: true,
    stop_condition: { type: "nameservers_match" },
    escalation_policy: {
      at: deadline,
      after_ms: escalateAfterMs,
      reason: "public_ns_still_diverge",
    },
    source_of_truth: `calendar_obligations:dns-delegation:${domain}`,
    executes: true,
    config: {
      domain,
      expected_ns: expected,
      doh_url: spec.doh_url || "https://cloudflare-dns.com/dns-query",
    },
  }, context);
}

export function evaluateStopCondition(condition, evidence = {}) {
  const type = String(condition?.type || "none");
  if (type === "none") return { met: false, reason: "none" };
  if (type === "always") return { met: true, reason: "one_shot" };
  if (type === "nameservers_match") {
    return {
      met: evidence?.matched === true,
      reason: evidence?.matched === true ? "nameservers_match" : "nameservers_diverge",
    };
  }
  if (type === "predicate") {
    const field = condition.field;
    const met = evidence?.[field] === condition.equals;
    return { met, reason: met ? "predicate_match" : "predicate_unmet" };
  }
  return { met: false, reason: "unknown_stop_condition" };
}

export function computeNextRun(options = {}) {
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const cadence = options.cadence || { kind: "once" };
  const kind = String(cadence.kind || "once");
  const lastRunMs = options.last_run_at ? Date.parse(options.last_run_at) : null;
  const earliestMs = options.earliest_at ? Date.parse(options.earliest_at) : null;
  const runCount = Number(options.run_count || 0);

  if (kind === "once") {
    if (runCount > 0 || lastRunMs) return null;
    if (earliestMs && earliestMs > nowMs) return new Date(earliestMs).toISOString();
    return new Date(nowMs).toISOString();
  }

  if (kind === "after_first") {
    if (runCount === 0 && !lastRunMs) {
      if (earliestMs && earliestMs > nowMs) return new Date(earliestMs).toISOString();
      const delay = Number(cadence.first_delay_ms || 0);
      return new Date(nowMs + delay).toISOString();
    }
    return new Date(nowMs + Number(cadence.interval_ms || 0)).toISOString();
  }

  const intervalMs = Number(cadence.interval_ms || 0);
  if (lastRunMs) return new Date(nowMs + intervalMs).toISOString();
  if (earliestMs && earliestMs > nowMs) return new Date(earliestMs).toISOString();
  return new Date(nowMs + Math.min(intervalMs, 30_000)).toISOString();
}

export function evaluateEscalation(obligation, nowIso) {
  if (!obligation || obligation.status === "closed") {
    return { escalated: false, reason: null };
  }
  const nowMs = Date.parse(nowIso || new Date().toISOString());
  if (obligation.deadline && nowMs >= Date.parse(obligation.deadline)) {
    return { escalated: true, reason: "deadline" };
  }
  const policy = obligation.escalation_policy || {};
  if (policy.at && nowMs >= Date.parse(policy.at)) {
    return { escalated: true, reason: "escalation_at" };
  }
  if (policy.after_ms && obligation.created_at) {
    if (nowMs >= Date.parse(obligation.created_at) + Number(policy.after_ms)) {
      return { escalated: true, reason: "escalation_after_ms" };
    }
  }
  return { escalated: false, reason: null };
}

export function buildCalendarProjection(options = {}) {
  const now = options.now || new Date().toISOString();
  const jobs = Array.isArray(options.jobs) ? options.jobs : [];
  const obligations = Array.isArray(options.obligations) ? options.obligations : [];
  const context = {
    node_id: options.nodeId || options.node_id || null,
    hostname: options.hostname || null,
    owner_or_mandate: options.owner_or_mandate,
    scope: options.scope,
  };

  const fromJobs = jobs.map(job => obligationFromScheduledJob(job, context));
  const fromStore = obligations.map(item => normalizeObligation(item, context));
  const items = applyFilters([...fromJobs, ...fromStore], options);

  return {
    schema: PROJECTION_SCHEMA,
    node_id: context.node_id,
    hostname: context.hostname,
    generated_at: now,
    not_an_executor: true,
    summary: summarize(items, fromJobs.length, fromStore.length),
    items,
    views: {
      by_node: groupBy(items, "target_node"),
      by_service: groupBy(items, "service"),
      by_project: groupBy(items, "project"),
    },
    personal_calendar: {
      ics_is_projection_only: true,
      personal_calendar_is_executor: false,
    },
  };
}

export function toIcs(projection, options = {}) {
  const calName = options.name || "FractaCalendar";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Operium//FractaCalendar//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcs(calName)}`,
    "X-OPERIUM-NOT-EXECUTOR:1",
    "X-OPERIUM-PROJECTION-ONLY:1",
  ];

  for (const item of projection.items || []) {
    const stamp = icsDate(projection.generated_at || new Date().toISOString());
    const start = icsDate(item.next_run_at || item.earliest_at || projection.generated_at);
    const description = [
      "Projection only. Importing this event does not authorize or execute the obligation.",
      `Source of truth: ${item.source_of_truth}`,
      `Kind: ${item.kind}`,
      `Status: ${item.status}`,
      item.last_evidence ? `Last evidence: ${compactEvidence(item.last_evidence)}` : null,
    ].filter(Boolean).join("\\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:operium-${escapeIcs(item.id)}@fractacalendar`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${start}`);
    if (item.deadline) lines.push(`DTEND:${icsDate(item.deadline)}`);
    lines.push(`SUMMARY:${escapeIcs(item.id)}`);
    lines.push(`DESCRIPTION:${escapeIcs(description)}`);
    lines.push(`STATUS:${item.status === "closed" ? "COMPLETED" : "CONFIRMED"}`);
    lines.push(`X-OPERIUM-SOURCE:${escapeIcs(item.source_of_truth)}`);
    lines.push("X-OPERIUM-NOT-EXECUTOR:1");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function normalizeNsList(values) {
  const list = Array.isArray(values)
    ? values
    : String(values || "").split(/[,\s]+/);
  return [...new Set(
    list
      .map(value => String(value || "").trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean),
  )].sort();
}

function inferService(item = {}) {
  const id = String(item.job_id || item.id || "").toLowerCase();
  const kind = String(item.kind || "").toLowerCase();
  if (kind === "dns.watch" || id.startsWith("dns-delegation:") || id.startsWith("dns.")) return "dns";
  if (id.includes("agent-gateway") || kind.includes("gateway")) return "agent-gateway";
  if (id.includes("retrieval") || id.includes("attractor")) return "retrieval";
  if (kind === "ona.heartbeat" || id.includes("operium-node")) return "ona";
  if (kind) return kind.split(".")[0];
  return "operium";
}

function inferProject(item = {}, context = {}) {
  const id = String(item.job_id || item.id || "");
  if (id.startsWith("dns-delegation:")) return id.slice("dns-delegation:".length);
  if (item.project) return item.project;
  if (item.config?.domain) return String(item.config.domain);
  return context.hostname || "operium";
}

function lastEvidenceFromJob(job = {}) {
  if (job.last_ok === false) {
    return { ok: false, error: job.last_error || "failed", run_count: job.run_count || 0 };
  }
  if (job.last_ok === true) {
    return { ok: true, run_count: job.run_count || 0, last_run_at: job.last_run_at };
  }
  return null;
}

function stripSecrets(config) {
  const blocked = /token|secret|password|key|authorization/i;
  const out = {};
  for (const [key, value] of Object.entries(config)) {
    if (blocked.test(key)) continue;
    if (key === "env_files") {
      out.env_files_count = Array.isArray(value) ? value.length : 0;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function applyFilters(items, options = {}) {
  return items.filter(item => {
    if (options.service && item.service !== options.service) return false;
    if (options.project && item.project !== options.project) return false;
    if (options.node && item.target_node !== options.node && item.target_node !== options.nodeId) return false;
    if (options.status && item.status !== options.status) return false;
    if (options.kind && item.kind !== options.kind) return false;
    return true;
  });
}

function summarize(items, fromJobs, fromObligations) {
  return {
    total: items.length,
    active: items.filter(item => item.status === "active").length,
    escalated: items.filter(item => item.status === "escalated").length,
    closed: items.filter(item => item.status === "closed").length,
    from_jobs: fromJobs,
    from_obligations: fromObligations,
  };
}

function groupBy(items, field) {
  const groups = {};
  for (const item of items) {
    const key = item[field] || "unscoped";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item.id);
  }
  return groups;
}

function icsDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return icsDate(new Date().toISOString());
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function compactEvidence(evidence) {
  try {
    return JSON.stringify(evidence);
  } catch {
    return String(evidence);
  }
}
