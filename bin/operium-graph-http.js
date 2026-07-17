#!/usr/bin/env node
import http from "node:http";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.OPERIUM_GRAPH_DB || ".operium/corpus-graph.sqlite");
const port = Number(process.env.OPERIUM_GRAPH_PORT || 8796);
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
const server = http.createServer((req, res) => {
  try {
    if (req.method !== "GET") return send(res, 405, { error: "read_only" });
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health") return send(res, 200, { ok: true, read_only: true });
    if (url.pathname === "/graph/continuations") return send(res, 200, db.prepare("SELECT * FROM continuations ORDER BY status, opened_at").all());
    if (url.pathname === "/graph/snapshot") return send(res, 200, db.prepare("SELECT * FROM snapshots ORDER BY generated_at DESC LIMIT 1").all());
    const node = url.pathname.match(/^\/graph\/node\/(.+)$/); if (node) return send(res, 200, db.prepare("SELECT * FROM nodes WHERE node_id = ?").all(decodeURIComponent(node[1])));
    const relation = url.pathname.match(/^\/graph\/(ancestors|descendants)\/(.+)$/); if (relation) { const incoming = relation[1] === "ancestors"; const column = incoming ? "to_node_id" : "from_node_id"; const join = incoming ? "from_node_id" : "to_node_id"; return send(res, 200, db.prepare(`SELECT e.*, n.node_kind, n.canonical_path, n.external_url FROM edges e LEFT JOIN nodes n ON n.node_id=e.${join} WHERE e.${column} = ?`).all(decodeURIComponent(relation[2]))); }
    if (url.pathname === "/graph/path") return send(res, 200, db.prepare("WITH RECURSIVE walk(node_id, path, depth) AS (SELECT ?, ?, 0 UNION ALL SELECT e.to_node_id, walk.path || ' -> ' || e.to_node_id, walk.depth + 1 FROM walk JOIN edges e ON e.from_node_id = walk.node_id WHERE walk.depth < 32 AND instr(walk.path, e.to_node_id) = 0) SELECT * FROM walk WHERE node_id = ? ORDER BY depth LIMIT 1").all(url.searchParams.get("from"), url.searchParams.get("from"), url.searchParams.get("to")));
    return send(res, 404, { error: "not_found" });
  } catch (error) { return send(res, 500, { error: error.message }); }
});
server.listen(port, "127.0.0.1", () => console.log(`Operium graph HTTP listening on 127.0.0.1:${port}`));
