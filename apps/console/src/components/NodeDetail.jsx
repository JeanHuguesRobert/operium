import { HealthBadge } from "./HealthBadge.jsx";
import { getOpsConfig } from "../lib/ops-api.js";

export function NodeDetail({
  node,
  status,
  drift,
  loading,
  error,
  onBack,
}) {
  const config = getOpsConfig();
  const statusBody = status?.body || null;
  const driftBody = drift?.body || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-ops-border px-3 py-1.5 text-sm text-ops-muted hover:text-ops-text"
        >
          ← Fleet
        </button>
        <div>
          <h2 className="text-lg font-semibold text-ops-accent">{node.hostname}</h2>
          <p className="font-mono text-xs text-ops-muted">{node.node_id}</p>
        </div>
        {statusBody ? <HealthBadge score={statusBody.health_score} /> : null}
      </div>

      {!config.hasToken ? (
        <Panel title="Authentication">
          <p className="text-sm text-ops-warn">
            Set <code className="text-ops-text">VITE_COGENTIA_OPS_TOKEN</code> at build time for node detail
            routes. Fleet views work without a token.
          </p>
        </Panel>
      ) : null}

      {error ? (
        <Panel title="Node fetch error">
          <p className="text-sm text-ops-bad">{error}</p>
          <p className="mt-2 text-xs text-ops-muted">
            Node detail requires fracta <code>/ops/node/…</code> proxy with <code>COGENTIA_OPS_READ_TOKEN</code> on the aggregator and <code>ONA_READ_TOKEN</code> for peer forwarding.
          </p>
        </Panel>
      ) : null}

      {loading ? <p className="text-sm text-ops-muted">Loading node projection…</p> : null}

      {statusBody ? (
        <Panel title="ONA status">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Item label="OK" value={statusBody.ok ? "yes" : "no"} />
            <Item label="ONA version" value={statusBody.ona_version || "—"} />
            <Item label="Uptime" value={`${statusBody.uptime_seconds ?? "?"}s`} />
            <Item label="Fresh peers" value={String(statusBody.peer_count_fresh ?? 0)} />
            <Item label="Last probe" value={statusBody.probes?.last_at || "—"} />
            <Item label="Failed probes" value={String(statusBody.probes?.failed_count ?? 0)} />
          </dl>
          <ProbeList probes={statusBody.probes?.latest || []} />
        </Panel>
      ) : null}

      {driftBody ? (
        <Panel title="Drift">
          <ul className="space-y-2 text-sm">
            {(driftBody.drift || []).map((item, index) => (
              <li key={`${item.kind}-${index}`} className="rounded border border-ops-border/70 px-3 py-2">
                <span className="font-semibold text-ops-warn">[{item.severity}]</span>{" "}
                <span className="text-ops-muted">{item.kind}</span>
                <div className="mt-1 text-ops-text">{item.observed}</div>
              </li>
            ))}
            {(driftBody.drift || []).length === 0 ? (
              <li className="text-ops-muted">No drift findings.</li>
            ) : null}
          </ul>
          {(driftBody.next_actions || []).length ? (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ops-muted">Next actions</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {driftBody.next_actions.map(action => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

function ProbeList({ probes }) {
  if (!probes.length) return null;
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ops-muted">Recent probes</h3>
      <ul className="mt-2 space-y-1 font-mono text-xs">
        {probes.map(probe => (
          <li key={`${probe.probe_kind}-${probe.probed_at}`} className="text-ops-muted">
            {probe.probe_kind} · {probe.ok ? "ok" : "fail"} · {probe.target}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-lg border border-ops-border bg-ops-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-ops-accent">{title}</h2>
      {children}
    </section>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ops-muted">{label}</dt>
      <dd className="mt-0.5 break-all">{value}</dd>
    </div>
  );
}