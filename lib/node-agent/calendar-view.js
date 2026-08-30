import { buildCalendarProjection } from "../calendar.js";
import { listScheduledJobs } from "./job-scheduler.js";
import { listCalendarObligations } from "./calendar-store.js";
import { readLocalState, readLocalStateByNodeId } from "./db.js";

export function buildNodeCalendar(deps = {}) {
  const config = deps.config || {};
  const db = deps.db;
  const nodeId = deps.nodeId || config.nodeId;
  const local = db
    ? (readLocalStateByNodeId(db, nodeId) || readLocalState(db))
    : null;
  const hostname = local?.hostname || config.hostname || deps.hostname || null;
  const jobs = db ? listScheduledJobs(db) : [];
  const obligations = db ? listCalendarObligations(db) : [];

  return buildCalendarProjection({
    jobs,
    obligations,
    nodeId,
    hostname,
    now: deps.now,
    service: deps.service,
    project: deps.project,
    status: deps.status,
    kind: deps.kind,
    node: deps.node,
  });
}
