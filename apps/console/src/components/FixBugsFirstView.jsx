import { useEffect, useState } from "react";
import { fetchFixBugsFirstDashboard } from "../lib/ops-api.js";

export function FixBugsFirstView({ onBack }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchFixBugsFirstDashboard(controller.signal)
      .then(value => {
        setResult(value);
        if (!value.ok) setError(value.body?.error || `HTTP ${value.status}`);
      })
      .catch(value => { if (value.name !== "AbortError") setError(value.message || "dashboard_fetch_failed"); });
    return () => controller.abort();
  }, []);

  const dashboard = result?.body;
  const metadata = dashboard?.metadata || {};
  const gates = Object.values(dashboard?.gates || {});

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">Fix Bugs First</h2>
        <p className="text-sm text-ops-muted">Public read-only work view derived from the Operium backlog and native GitHub references.</p>
      </div>
      <button className="rounded border border-ops-border px-3 py-1.5 text-xs text-ops-muted" onClick={onBack}>Back to Fleet</button>
    </div>

    {error ? <Panel title="View unavailable"><p className="text-sm text-ops-bad">{error}</p><p className="mt-2 text-xs text-ops-muted">Generate and publish the Fix Bugs First view from Cogentia, then refresh this panel.</p></Panel> : null}
    {!result && !error ? <Panel title="Loading work view"><p className="text-sm text-ops-muted">Loading the public Cogentia projection…</p></Panel> : null}
    {dashboard ? <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Open bugs" value={metadata.open_bugs_count ?? 0} />
        <Metric title="Open features" value={metadata.open_features_count ?? 0} />
        <Metric title="Subsystems" value={metadata.subsystems_count ?? 0} />
        <Metric title="Generated" value={formatDate(dashboard.generated_at)} />
      </section>
      <Panel title="Authority and freshness"><p className="text-sm text-ops-muted">This is a derived, public read-only view. Operium backlog items and linked GitHub issues remain authoritative. Actions are available only through the authenticated John workspace.</p><p className="mt-2 font-mono text-xs text-ops-muted">schema: {dashboard.schema} · generated: {dashboard.generated_at || "unknown"}</p></Panel>
      <Panel title="Subsystem gates"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{gates.map(gate => <div key={gate.subsystem} className="rounded border border-ops-border bg-ops-bg p-3"><div className="flex justify-between gap-2"><strong>{gate.subsystem}</strong><span className={gate.state === "OK" ? "text-ops-ok" : "text-ops-bad"}>{gate.state}</span></div><div className="mt-2 text-xs text-ops-muted">open bugs: {gate.open_bugs} · blocking: {gate.blocking_bugs?.length || 0}</div></div>)}</div></Panel>
      <WorkList title="Open bugs — fix first" items={dashboard.open_bugs} empty="No open bugs reported." />
      <WorkList title="Features and planned work" items={dashboard.open_features} empty="No active open features." gates={dashboard.gates} />
      <WorkList title="Other open work" items={(dashboard.items || []).filter(item => ["open", "in_progress", "blocked"].includes(item.status) && item.kind !== "bug" && item.kind !== "feature")} empty="No other open work in the current projection." gates={dashboard.gates} />
    </> : null}
  </div>;
}

function WorkList({ title, items = [], empty, gates = {} }) {
  return <Panel title={title}>{items.length ? <div className="space-y-3">{items.map(item => { const gate = gates[item.subsystem]; return <article key={`${item.repository}:${item.id}`} className="rounded border border-ops-border bg-ops-bg p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong>[{item.id}] {item.title}</strong><div className="mt-1 text-xs text-ops-muted">{item.repository} · {item.subsystem} · {item.status}{item.severity ? ` · ${item.severity}` : ""}{gate ? ` · gate ${gate.state}` : ""}</div></div>{item.url ? <a className="text-xs text-ops-accent hover:underline" href={item.url} target="_blank" rel="noreferrer">Open native issue ↗</a> : null}</div>{item.next_action ? <p className="mt-2 text-sm text-ops-muted">Next: {item.next_action}</p> : null}</article>; })}</div> : <p className="text-sm text-ops-muted">{empty}</p>}</Panel>;
}

function Panel({ title, children }) { return <section className="rounded-lg border border-ops-border bg-ops-panel p-4"><h3 className="mb-3 text-sm font-semibold text-ops-accent">{title}</h3>{children}</section>; }
function Metric({ title, value }) { return <div className="rounded-lg border border-ops-border bg-ops-panel px-4 py-3"><div className="text-xs font-semibold uppercase tracking-wide text-ops-muted">{title}</div><div className="mt-1 text-base font-semibold">{value}</div></div>; }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "unknown" : date.toLocaleString(); }
