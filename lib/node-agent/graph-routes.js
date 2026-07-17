export function handleGraphRequest(req, res, graphDb) {
  if (!graphDb || req.method !== "GET") return false;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const send = (body) => { const payload = JSON.stringify(body); res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload), "Cache-Control": "no-store" }); res.end(payload); };
  if (url.pathname === "/graph/continuations") { send(graphDb.prepare("SELECT * FROM continuations ORDER BY status, opened_at").all()); return true; }
  if (url.pathname === "/graph/snapshot") { send(graphDb.prepare("SELECT * FROM snapshots ORDER BY generated_at DESC LIMIT 1").all()); return true; }
  const node = url.pathname.match(/^\/graph\/node\/(.+)$/); if (node) { send(graphDb.prepare("SELECT * FROM nodes WHERE node_id = ?").all(decodeURIComponent(node[1]))); return true; }
  const relation = url.pathname.match(/^\/graph\/(ancestors|descendants)\/(.+)$/); if (relation) { const incoming = relation[1] === "ancestors"; const column = incoming ? "to_node_id" : "from_node_id"; const join = incoming ? "from_node_id" : "to_node_id"; send(graphDb.prepare(`SELECT e.*, n.node_kind, n.canonical_path, n.external_url FROM edges e LEFT JOIN nodes n ON n.node_id=e.${join} WHERE e.${column} = ?`).all(decodeURIComponent(relation[2]))); return true; }
  if (url.pathname === "/graph/path") { const from = url.searchParams.get("from"); const to = url.searchParams.get("to"); send(graphDb.prepare("WITH RECURSIVE walk(node_id, path, depth) AS (SELECT ?, ?, 0 UNION ALL SELECT e.to_node_id, walk.path || ' -> ' || e.to_node_id, walk.depth + 1 FROM walk JOIN edges e ON e.from_node_id = walk.node_id WHERE walk.depth < 32 AND instr(walk.path, e.to_node_id) = 0) SELECT * FROM walk WHERE node_id = ? ORDER BY depth LIMIT 1").all(from, from, to)); return true; }
  return false;
}
