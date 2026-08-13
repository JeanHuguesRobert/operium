import { HealthBadge } from "./HealthBadge.jsx";

export function FleetView({ status, blackboard, nodes, loading, error }) {
  const summary = status?.body?.summary || {};
  const layers = status?.body?.layers || {};
  const action = layers.action || {};
  const blackboardLayer = layers.blackboard || {};

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Fleet health"
          value={summary.headline || summary.status || "unknown"}
          badge={<HealthBadge score={summary.health_score} />}
        />
        <MetricCard
          title="Aggregator"
          value={layers.public_face?.aggregator_reachable ? "reachable" : "unreachable"}
        />
        <MetricCard
          title="ONA attractors"
          value={`${blackboardLayer.fresh_attractor_count ?? 0} fresh / ${blackboard?.body?.count ?? nodes.length}`}
        />
        <MetricCard
          title="Action plane"
          value={`${action.online_attractor_count ?? 0} gateway hosts`}
        />
      </section>

      {error ? (
        <Panel title="Fleet error">
          <p className="text-sm text-ops-bad">{error}</p>
        </Panel>
      ) : null}

      <Panel title="Participating node agents">
        {loading && nodes.length === 0 ? (
          <p className="text-sm text-ops-muted">Loading fleet…</p>
        ) : null}
        {!loading && nodes.length === 0 ? (
          <p className="text-sm text-ops-muted">No operium.node.v1 attractors on blackboard.</p>
        ) : null}
        {nodes.length ? (
          <p className="text-sm text-ops-muted">
            {nodes.length} advertised node{nodes.length === 1 ? "" : "s"}; identities and endpoints stay private.
          </p>
        ) : null}
      </Panel>

      <Panel title="Guide / retrieval">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <Item label="Guide MCP" value={layers.services?.remote?.fracta?.guide?.ok ? "ok" : "down"} />
          <Item label="Retrieval backend" value={layers.retrieval?.backend || "—"} />
          <Item label="Blackboard store" value={blackboardLayer.store_path || "—"} />
          <Item label="Snapshot" value={blackboardLayer.snapshot_at || blackboard?.body?.snapshot_at || "—"} />
        </dl>
      </Panel>
    </div>
  );
}

function MetricCard({ title, value, badge = null }) {
  return (
    <div className="rounded-lg border border-ops-border bg-ops-panel px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-ops-muted">{title}</div>
      <div className="mt-1 flex items-center gap-2 text-base font-semibold">{value}</div>
      {badge ? <div className="mt-2">{badge}</div> : null}
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
