import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEventLog } from "./db.js";

const HOUR = 3600_000;
const KIND = "ona.storage_sample";
const GIB = 1024 ** 3;

export function storagePressure(percent, available, minimum = 0) {
  if (percent >= 95) return "critical";
  if (percent >= 90 || available < minimum) return "urgent";
  if (percent >= 80) return "preventive";
  if (percent >= 70) return "watch";
  return "normal";
}

// No path or device identifier is disclosed by the observation.
export function observeStorage({ env = process.env, statfs = fs.statfsSync, now = new Date() } = {}) {
  const observed_at = now.toISOString();
  try {
    const root = env.ONA_STORAGE_PATH || path.parse(os.homedir()).root;
    const s = statfs(root);
    const unit = Number(s.frsize || s.bsize);
    const total = Number(s.blocks) * unit;
    const free = Number(s.bfree) * unit;
    const available = Number(s.bavail) * unit;
    const used = total - free;
    if (![total, free, available, used].every(Number.isSafeInteger)
        || total <= 0 || available < 0 || free < available || used < 0 || used + available <= 0) {
      return { available: false, observed_at, reason: "invalid_filesystem_statistics" };
    }
    // GNU df semantics: reserved blocks are not available to an unprivileged writer.
    const percent = Math.ceil(100 * used / (used + available));
    const configured = Number(env.ONA_STORAGE_MIN_FREE_BYTES || 0);
    const minimum = Number.isSafeInteger(configured) && configured >= 0 ? configured : 0;
    const files = Number(s.files), ffree = Number(s.ffree);
    const inodes = Number.isSafeInteger(files) && Number.isSafeInteger(ffree) && files > 0 && ffree >= 0 && ffree <= files
      ? { total: files, free: ffree, used_percent: Math.ceil(100 * (files - ffree) / files) }
      : null;
    return { available: true, observed_at, total_bytes: total, free_bytes: free,
      available_bytes: available, used_bytes: used, used_percent: percent, inodes,
      minimum_available_bytes: minimum, below_minimum: available < minimum,
      pressure: storagePressure(percent, available, minimum) };
  } catch {
    return { available: false, observed_at, reason: "filesystem_statistics_unavailable" };
  }
}

// One observation per UTC hour; the existing event TTL sweeper retains 14 days.
export function recordStorageSample(db, sample, { append = appendEventLog } = {}) {
  if (!sample.available) return false;
  const latest = db.prepare("SELECT logged_at FROM event_log WHERE kind = ? ORDER BY logged_at DESC LIMIT 1").get(KIND);
  if (latest && Math.floor(Date.parse(latest.logged_at) / HOUR) >= Math.floor(Date.parse(sample.observed_at) / HOUR)) return false;
  append(db, KIND, sample);
  return true;
}

export function storageTrend(samples, current) {
  if (!current?.available) return { state: "unavailable" };
  const now = Date.parse(current.observed_at);
  const points = samples.filter(s => s?.available && s.total_bytes === current.total_bytes
    && Date.parse(s.observed_at) >= now - 24 * HOUR && Date.parse(s.observed_at) < now)
    .sort((a,b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  points.push(current);
  // Restart the estimate after a material reclamation; never extrapolate across it.
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].available_bytes - points[i-1].available_bytes > GIB / 16) start = i;
  }
  const first = points[start];
  const span = (now - Date.parse(first.observed_at)) / HOUR;
  const count = points.length - start;
  if (count < 3 || span < 6) return { state: "insufficient_history", sample_count: count, span_hours: span };
  const rate = (first.available_bytes - current.available_bytes) / span;
  return { state: rate > 0 ? "filling" : "stable_or_recovering", sample_count: count,
    span_hours: span, bytes_per_hour: Math.round(rate),
    estimated_hours_to_full: rate > 0 ? Math.round(current.available_bytes / rate) : null };
}

export function readStorageTrend(db, current) {
  const since = new Date(Date.parse(current.observed_at) - 24 * HOUR).toISOString();
  const rows = db.prepare("SELECT detail_json FROM event_log WHERE kind = ? AND logged_at >= ? ORDER BY logged_at DESC LIMIT 25").all(KIND, since);
  const samples = rows.flatMap(row => { try { return [JSON.parse(row.detail_json)]; } catch { return []; } });
  return storageTrend(samples, current);
}
