#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.OPERIUM_GRAPH_DB || ".operium/corpus-graph.sqlite");
const [command, ...args] = process.argv.slice(2);
const json = process.argv.includes("--json");
const id = args.find((arg) => !arg.startsWith("--"));
const from = process.argv.find((arg) => arg.startsWith("--from="))?.slice(7);
const to = process.argv.find((arg) => arg.startsWith("--to="))?.slice(5);
const output = (value) => console.log(json ? JSON.stringify(value, null, 2) : value.map ? value.map((row) => JSON.stringify(row)).join("\n") : JSON.stringify(value, null, 2));
if (command === "node") output(db.prepare("SELECT * FROM nodes WHERE node_id = ?").all(id));
else if (command === "ancestors" || command === "descendants") {
  const column = command === "ancestors" ? "to_node_id" : "from_node_id";
  const join = command === "ancestors" ? "from_node_id" : "to_node_id";
  output(db.prepare(`SELECT e.*, n.node_kind, n.canonical_path, n.external_url FROM edges e LEFT JOIN nodes n ON n.node_id=e.${join} WHERE e.${column} = ?`).all(id));
} else if (command === "continuations") output(db.prepare("SELECT * FROM continuations ORDER BY status, opened_at").all());
else if (command === "snapshot") output(db.prepare("SELECT * FROM snapshots ORDER BY generated_at DESC LIMIT 1").all());
else if (command === "path") {
  if (!from || !to) throw new Error("path requires --from=<id> --to=<id>");
  output(db.prepare("WITH RECURSIVE walk(node_id, path, depth) AS (SELECT ?, ?, 0 UNION ALL SELECT e.to_node_id, walk.path || ' -> ' || e.to_node_id, walk.depth + 1 FROM walk JOIN edges e ON e.from_node_id = walk.node_id WHERE walk.depth < 32 AND instr(walk.path, e.to_node_id) = 0) SELECT * FROM walk WHERE node_id = ? ORDER BY depth LIMIT 1").all(from, from, to));
}
else throw new Error("Usage: operium-graph node|ancestors|descendants|path|continuations|snapshot [id] [--json]");
db.close();
