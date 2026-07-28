import {
  createManagementAction,
  listManagementActions,
  readManagementAction,
  SOMA_ACTION_DEFINITIONS,
  updateManagementAction,
} from "./management-actions.js";

export function buildSomaActions(db) {
  return {
    schema: "soma.actions.v0",
    definitions: SOMA_ACTION_DEFINITIONS,
    recent: listManagementActions(db),
    generated_at: new Date().toISOString(),
  };
}

export function buildSomaActionStatus(db, actionId) {
  const action = readManagementAction(db, actionId);
  return action
    ? { status: 200, body: action }
    : { status: 404, body: { ok: false, error: "action_not_found" } };
}

export async function executeObservationRefresh(deps = {}) {
  if (typeof deps.runProbe !== "function") {
    return { status: 503, body: { ok: false, error: "probe_unavailable" } };
  }
  const now = new Date().toISOString();
  const action = createManagementAction(deps.db, {
    actionName: "observation.refresh",
    targetId: deps.nodeId,
    state: "running",
    requestedAt: now,
    startedAt: now,
    previousIncarnation: deps.incarnation,
  });
  const result = await deps.runProbe({ log: true });
  if (!result.ok) {
    return {
      status: result.error === "probe_cycle_in_progress" ? 409 : 500,
      body: updateManagementAction(deps.db, action.action_id, {
        state: "failed",
        completed_at: new Date().toISOString(),
        error: result.error || "probe_failed",
        result,
      }),
    };
  }
  return {
    status: 200,
    body: updateManagementAction(deps.db, action.action_id, {
      state: "completed",
      completed_at: new Date().toISOString(),
      current_incarnation: deps.incarnation,
      result: {
        health_score: result.summary?.health_score ?? null,
        probe_count: result.summary?.probe_count ?? null,
        failed_count: result.summary?.failed_count ?? null,
        refreshed_at: result.summary?.probed_at || new Date().toISOString(),
      },
    }),
  };
}

export function acceptAgentRestart(deps = {}) {
  const now = new Date().toISOString();
  const action = createManagementAction(deps.db, {
    actionName: "agent.restart",
    targetId: deps.nodeId,
    state: "restarting",
    requestedAt: now,
    startedAt: now,
    previousIncarnation: deps.incarnation,
  });
  return { status: 202, body: { ...action, expected_interruption: "PT10S" } };
}
