import { randomUUID } from "node:crypto";

export const SOMA_ACTION_DEFINITIONS = Object.freeze({
  "observation.refresh": {
    title: "Refresh observations",
    semantics: "Immediately resample the applicable observations of the target object",
    target_class: "soma.managed-object",
    authority: "admin",
    interruption: false,
    implemented: true,
  },
  "agent.restart": {
    title: "Restart management agent",
    semantics: "Restart only the SOMA management agent, not the underlying node",
    target_class: "operium.node",
    authority: "admin",
    interruption: true,
    implemented: true,
  },
  "agent.upgrade": {
    title: "Upgrade management agent",
    semantics: "Install and activate a newer management-agent runtime",
    target_class: "operium.node",
    authority: "admin",
    interruption: true,
    implemented: false,
  },
});

export function createManagementAction(db, input = {}) {
  const action = {
    action_id: input.actionId || `action:${randomUUID()}`,
    action_name: String(input.actionName || "").trim(),
    target_id: String(input.targetId || "").trim(),
    state: input.state || "accepted",
    requested_at: input.requestedAt || new Date().toISOString(),
    started_at: input.startedAt || null,
    completed_at: null,
    previous_incarnation: input.previousIncarnation || null,
    current_incarnation: null,
    result_json: null,
    error: null,
  };
  db.prepare(`
    INSERT INTO management_actions (
      action_id, action_name, target_id, state, requested_at, started_at,
      completed_at, previous_incarnation, current_incarnation, result_json, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    action.action_id,
    action.action_name,
    action.target_id,
    action.state,
    action.requested_at,
    action.started_at,
    action.completed_at,
    action.previous_incarnation,
    action.current_incarnation,
    action.result_json,
    action.error,
  );
  return serializeAction(action);
}

export function updateManagementAction(db, actionId, patch = {}) {
  const current = db.prepare("SELECT * FROM management_actions WHERE action_id = ?").get(actionId);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    result_json: patch.result === undefined ? current.result_json : JSON.stringify(patch.result),
  };
  db.prepare(`
    UPDATE management_actions SET
      state = ?, started_at = ?, completed_at = ?, previous_incarnation = ?,
      current_incarnation = ?, result_json = ?, error = ?
    WHERE action_id = ?
  `).run(
    next.state,
    next.started_at,
    next.completed_at,
    next.previous_incarnation,
    next.current_incarnation,
    next.result_json,
    next.error,
    actionId,
  );
  return readManagementAction(db, actionId);
}

export function readManagementAction(db, actionId) {
  const row = db.prepare("SELECT * FROM management_actions WHERE action_id = ?").get(actionId);
  return row ? serializeAction(row) : null;
}

export function listManagementActions(db, limit = 20) {
  const bounded = Math.min(Math.max(Number(limit), 1), 100);
  return db.prepare(`
    SELECT * FROM management_actions ORDER BY requested_at DESC LIMIT ?
  `).all(bounded).map(serializeAction);
}

export function completePendingRestartActions(db, currentIncarnation) {
  const pending = db.prepare(`
    SELECT action_id FROM management_actions
    WHERE action_name = 'agent.restart' AND state = 'restarting'
    ORDER BY requested_at ASC
  `).all();
  return pending.map(row => updateManagementAction(db, row.action_id, {
    state: "completed",
    completed_at: new Date().toISOString(),
    current_incarnation: currentIncarnation,
    result: { restarted: true, current_incarnation: currentIncarnation },
  }));
}

function serializeAction(row) {
  let result = null;
  if (row.result_json) {
    try { result = JSON.parse(row.result_json); } catch { result = null; }
  }
  return {
    schema: "soma.action.v0",
    action_id: row.action_id,
    action_name: row.action_name,
    target_id: row.target_id,
    state: row.state,
    requested_at: row.requested_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    previous_incarnation: row.previous_incarnation,
    current_incarnation: row.current_incarnation,
    result,
    error: row.error,
  };
}
