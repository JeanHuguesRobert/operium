import { useState } from "react";
import { executeNodeSomaAction } from "../lib/ops-api.js";

export function SomaActionsPanel({ nodeId, actions }) {
  const [runningAction, setRunningAction] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);

  const actionList = Array.isArray(actions?.body?.actions)
    ? actions.body.actions
    : [
        {
          name: "sleep_cycle.run",
          title: "Run preemptible Corpus Sleep Cycle",
          semantics: "Execute dynamic availability check, Monte Carlo pairwise audit, and dual static projections",
          authority: "admin",
        },
        {
          name: "observation.refresh",
          title: "Refresh observations",
          semantics: "Resample node SOMA observations in real time",
          authority: "admin",
        },
        {
          name: "agent.restart",
          title: "Restart management agent",
          semantics: "Restart only the SOMA management agent process",
          authority: "admin",
        },
      ];

  const handleRun = async (actionName) => {
    setRunningAction(actionName);
    setError(null);
    setLastResult(null);

    try {
      const res = await executeNodeSomaAction(nodeId, actionName);
      if (res.ok) {
        setLastResult({ actionName, result: res.body });
      } else {
        setError(`Failed to execute ${actionName}: ${res.body?.error || res.status}`);
      }
    } catch (err) {
      setError(`Error executing ${actionName}: ${err.message}`);
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actionList.map((act) => {
          const isRunning = runningAction === act.name;
          return (
            <div
              key={act.name}
              className="flex flex-col justify-between rounded-lg border border-ops-border bg-black/20 p-4 transition-colors hover:border-ops-accent/50"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-ops-text">{act.title || act.name}</h4>
                  <span className="rounded bg-ops-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase text-ops-accent">
                    {act.authority || "admin"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-ops-muted">{act.name}</p>
                <p className="mt-2 text-xs text-ops-muted">{act.semantics}</p>
              </div>
              <button
                type="button"
                disabled={isRunning}
                onClick={() => handleRun(act.name)}
                className="mt-4 w-full rounded bg-ops-accent/20 px-3 py-1.5 text-xs font-semibold text-ops-accent hover:bg-ops-accent hover:text-black disabled:opacity-50"
              >
                {isRunning ? "Executing..." : "Execute Action"}
              </button>
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="rounded border border-ops-bad/50 bg-ops-bad/10 p-3 text-xs text-ops-bad">
          {error}
        </div>
      ) : null}

      {lastResult ? (
        <div className="rounded border border-ops-ok/50 bg-ops-ok/10 p-3 text-xs">
          <div className="font-semibold text-ops-ok">
            ✓ Action {lastResult.actionName} executed successfully
          </div>
          <pre className="mt-2 max-h-48 overflow-auto text-ops-muted font-mono">
            {JSON.stringify(lastResult.result, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
