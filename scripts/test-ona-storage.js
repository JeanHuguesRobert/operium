import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { observeStorage, storagePressure, storageTrend, recordStorageSample, readStorageTrend } from "../lib/node-agent/storage-health.js";

const now = new Date("2026-11-28T12:00:00Z");
const G = 1024 ** 3;
test("df semantics, reserve, inodes and threshold boundaries", () => {
  const data = observeStorage({now, env: {ONA_STORAGE_MIN_FREE_BYTES: "31"}, statfs: () => ({
    bsize: 8, frsize: 4, blocks: 100, bfree: 20, bavail: 10, files: 100, ffree: 80,
  })});
  assert.equal(data.total_bytes, 400);
  assert.equal(data.used_bytes, 320);
  assert.equal(data.available_bytes, 40);
  assert.equal(data.used_percent, 89);
  assert.equal(data.inodes.used_percent, 20);
  assert.equal(data.pressure, "preventive");
  assert.deepEqual([69,70,80,90,95].map(p => storagePressure(p, 10)), ["normal","watch","preventive","urgent","critical"]);
  assert.equal(storagePressure(40, 9, 10), "urgent");
});
test("unavailable observations do not report invented zeroes", () => {
  assert.equal(observeStorage({now,statfs: () => {throw Error("unsupported");}}).available, false);
  assert.equal(observeStorage({now,statfs: () => ({bsize:4,blocks:0,bfree:0,bavail:0})}).available, false);
  assert.equal(observeStorage({now,statfs: () => ({bsize:4,blocks:100,bfree:50,bavail:50,files:0,ffree:0})}).inodes,null);
});
function sample(hoursAgo, free) {
  return {available:true,total_bytes:45*G,available_bytes:free*G,observed_at:new Date(now-hoursAgo*3600000).toISOString()};
}
test("trend needs history and starts again after a cleanup", () => {
  assert.equal(storageTrend([sample(2,7),sample(1,6)],sample(0,5)).state,"insufficient_history");
  const trend=storageTrend([sample(8,9),sample(4,7)],sample(0,5));
  assert.equal(trend.state,"filling");
  assert.equal(trend.bytes_per_hour,G/2);
  assert.equal(trend.estimated_hours_to_full,10);
  assert.equal(storageTrend([sample(8,9),sample(4,5)],sample(0,8)).state,"insufficient_history");
  assert.equal(storageTrend([sample(8,5),sample(4,5)],sample(0,5)).estimated_hours_to_full,null);
});
test("hourly events use existing event log, with no duplicate within an hour", () => {
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE event_log(kind TEXT,detail_json TEXT,logged_at TEXT,expires_at TEXT)");
    const append=(db,kind,s)=>db.prepare("INSERT INTO event_log VALUES(?,?,?,?)").run(kind,JSON.stringify(s),s.observed_at,s.observed_at);
    assert.equal(recordStorageSample(db,sample(8,9),{append}),true);
    assert.equal(recordStorageSample(db,sample(7.9,9),{append}),false);
    assert.equal(recordStorageSample(db,sample(4,7),{append}),true);
    assert.equal(readStorageTrend(db,sample(0,5)).estimated_hours_to_full,10);
  } finally {db.close();}
});
