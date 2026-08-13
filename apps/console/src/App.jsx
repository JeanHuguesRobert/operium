import { useCallback, useEffect, useState } from "react";
import { FleetView } from "./components/FleetView.jsx";
import { FixBugsFirstView } from "./components/FixBugsFirstView.jsx";
import {
  fetchFleetBlackboard,
  fetchFleetStatus,
  listOnaAttractors,
} from "./lib/ops-api.js";

const FLEET_POLL_MS = 30_000;

function initialView() {
  if (typeof window === "undefined") return "fleet";
  return new URLSearchParams(window.location.search).get("view") === "fix-bugs-first"
    ? "fix-bugs-first"
    : "fleet";
}

export default function App() {
  const [view, setView] = useState(initialView);
  const [fleetStatus, setFleetStatus] = useState(null);
  const [fleetBlackboard, setFleetBlackboard] = useState(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetError, setFleetError] = useState(null);
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

  useEffect(() => {
    const controller = new AbortController();
    refreshFleet(controller.signal);
    const timer = setInterval(() => refreshFleet(controller.signal), FLEET_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refreshFleet]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-ops-border px-5 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-wide">La Nasa · public view</h1>
            <p className="text-sm text-ops-muted">
              Read-only operational projection. No credentials, private node detail, or actions.
            </p>
          </div>
          <div className="text-right text-xs text-ops-muted">
            <div>public status only</div>
            {lastRefresh ? <div>updated {lastRefresh}</div> : null}
          </div>
        </div>
        <div className="mx-auto mt-4 flex max-w-6xl gap-2">
          <button className={`rounded border px-3 py-1.5 text-xs ${view === "fleet" ? "border-ops-accent text-ops-accent" : "border-ops-border text-ops-muted"}`} onClick={() => setView("fleet")}>Fleet</button>
          <button className={`rounded border px-3 py-1.5 text-xs ${view === "fix-bugs-first" ? "border-ops-accent text-ops-accent" : "border-ops-border text-ops-muted"}`} onClick={() => setView("fix-bugs-first")}>Work / Fix Bugs First</button>
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
          />
        ) : view === "fix-bugs-first" ? (
          <FixBugsFirstView onBack={() => setView("fleet")} />
        ) : null}
      </main>
    </div>
  );
}
