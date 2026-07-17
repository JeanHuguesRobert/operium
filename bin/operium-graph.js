#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.OPERIUM_GRAPH_DB || ".operium/corpus-graph.sqlite");
const [command, ...args] = process.argv.slice(2);
const json = process.argv.includes("--json");
const id = args.find((arg) => !arg.startsWith("--"));
const output = (value) => console.log(json ? JSON.stringify(value, null, 2) : value.map ? value.map((row) => JSON.stringify(row)).join("\n") : JSON.stringify(value, null, 2));
if (command === "node") output(db.prepare("SELECT * FROM nodes WHERE node_id = ?").all(id));
else if (command === "ancestors" || command === "descendants") {
  const column = command === "ancestors" ? "to_node_id" : "from_node_id";
  const join = command === "ancestors" ? "from_node_id" : "to_node_id";
  output(db.prepare(`SELECT e.*, n.node_kind, n.canonical_path, n.external_url FROM edges e LEFT JOIN nodes n ON n.node_id=e.${join} WHERE e.${column} = ?`).all(id));
} else if (command === "continuations") output(db.prepare("SELECT * FROM continuations ORDER BY status, opened_at").all());
else if (command === "snapshot") output(db.prepare("SELECT * FROM snapshots ORDER BY generated_at DESC LIMIT 1").all());
else throw new Error("Usage: operium-graph node|ancestors|descendants|continuations|snapshot [id] [--json]");
db.close();
