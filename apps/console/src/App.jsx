import { useCallback, useEffect, useState } from "react";
import { FleetView } from "./components/FleetView.jsx";
import { NodeDetail } from "./components/NodeDetail.jsx";
import {
  fetchFleetBlackboard,
  fetchFleetStatus,
  fetchNodeDrift,
  fetchNodeStatus,
  getOpsConfig,
  listOnaAttractors,
} from "./lib/ops-api.js";

const FLEET_POLL_MS = 30_000;
const NODE_POLL_MS = 15_000;

export default function App() {
  const [view, setView] = useState("fleet");
  const [selectedNode, setSelectedNode] = useState(null);
  const [fleetStatus, setFleetStatus] = useState(null);
  const [fleetBlackboard, setFleetBlackboard] = useState(null);
  const [nodeStatus, setNodeStatus] = useState(null);
  const [nodeDrift, setNodeDrift] = useState(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [fleetError, setFleetError] = useState(null);
  const [nodeError, setNodeError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const nodes = listOnaAttractors(fleetBlackboard?.body || {});

  const refreshFleet = useCallback(async (signal) => {
    setFleetLoading(true);
    setFleetError(null);
    try {
      const [status, blackboard] = await Promise.all([
        fetchFleetStatus(signal),
        fetchFleetBlackboard(signal),
      ]);
      setFleetStatus(status);
      setFleetBlackboard(blackboard);
      if (!status.ok) {
        setFleetError(status.body?.error || `HTTP ${status.status}`);
      }
      setLastRefresh(new Date().toISOString());
    } catch (error) {
      if (error.name !== "AbortError") {
        setFleetError(error.message || "fleet_fetch_failed");
      }
    } finally {
      setFleetLoading(false);
    }
  }, []);

  const refreshNode = useCallback(async (node, signal) => {
    if (!node?.node_id) return;
    setNodeLoading(true);
    setNodeError(null);
    try {
      const [status, drift] = await Promise.all([
        fetchNodeStatus(node.node_id, signal),
        fetchNodeDrift(node.node_id, signal),
      ]);
      setNodeStatus(status);
      setNodeDrift(drift);
      if (!status.ok && !drift.ok) {
        setNodeError(status.body?.error || drift.body?.error || `HTTP ${status.status}`);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        setNodeError(error.message || "node_fetch_failed");
      }
    } finally {
      setNodeLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refreshFleet(controller.signal);
    const timer = setInterval(() => refreshFleet(controller.signal), FLEET_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refreshFleet]);

  useEffect(() => {
    if (view !== "node" || !selectedNode) return undefined;
    const controller = new AbortController();
    refreshNode(selectedNode, controller.signal);
    const timer = setInterval(() => refreshNode(selectedNode, controller.signal), NODE_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [view, selectedNode, refreshNode]);

  const config = getOpsConfig();

  return (
    <div className="min-h-screen">
      <header className="border-b border-ops-border px-5 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-wide">Operium Console</h1>
            <p className="text-sm text-ops-muted">
              Fracta aggregator views only — no browser calls to peer :8794
            </p>
          </div>
          <div className="text-right text-xs text-ops-muted">
            <div>ops base: {config.baseUrl || "(same-origin / proxy)"}</div>
            <div>node token: {config.hasToken ? "configured" : "not set"}</div>
            {lastRefresh ? <div>updated {lastRefresh}</div> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        {view === "fleet" ? (
          <FleetView
            status={fleetStatus}
            blackboard={fleetBlackboard}
            nodes={nodes}
            loading={fleetLoading}
            error={fleetError}
            onSelectNode={(node) => {
              if (!node.node_id) return;
              setSelectedNode(node);
              setView("node");
            }}
          />
        ) : (
          <NodeDetail
            node={selectedNode}
            status={nodeStatus}
            drift={nodeDrift}
            loading={nodeLoading}
            error={nodeError}
            onBack={() => {
              setView("fleet");
              setSelectedNode(null);
              setNodeStatus(null);
              setNodeDrift(null);
              setNodeError(null);
            }}
          />
        )}
      </main>
    </div>
  );
}