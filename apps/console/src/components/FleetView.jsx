import { HealthBadge } from "./HealthBadge.jsx";

export function FleetView({ status, blackboard, nodes, loading, error, onSelectNode }) {
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

      <Panel title="Operium node agents">
        {loading && nodes.length === 0 ? (
          <p className="text-sm text-ops-muted">Loading fleet…</p>
        ) : null}
        {!loading && nodes.length === 0 ? (
          <p className="text-sm text-ops-muted">No operium.node.v1 attractors on blackboard.</p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ops-muted">
              <tr className="border-b border-ops-border">
                <th className="px-3 py-2">Hostname</th>
                <th className="px-3 py-2">Node ID</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Fresh</th>
                <th className="px-3 py-2">Health</th>
                <th className="px-3 py-2">Endpoint</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(node => (
                <tr
                  key={node.id || node.node_id}
                  className="border-b border-ops-border/70 hover:bg-ops-panel/80 cursor-pointer"
                  onClick={() => onSelectNode(node)}
                >
                  <td className="px-3 py-2 font-medium text-ops-accent">{node.hostname}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ops-muted">{node.node_id || "—"}</td>
                  <td className="px-3 py-2">{node.status}</td>
                  <td className="px-3 py-2">{node.fresh ? "yes" : "no"}</td>
                  <td className="px-3 py-2">
                    <HealthBadge score={node.health_score} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ops-muted">{node.endpoint || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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