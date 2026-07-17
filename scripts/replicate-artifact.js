#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const get = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const source = path.resolve(get("source") || "");
const target = path.resolve(get("target") || "");
if (!source || !target) throw new Error("Usage: node scripts/replicate-artifact.js --source=file --target=file");
const data = fs.readFileSync(source);
const hash = crypto.createHash("sha256").update(data).digest("hex");
fs.mkdirSync(path.dirname(target), { recursive: true });
const temp = `${target}.replication-tmp-${process.pid}`;
fs.writeFileSync(temp, data);
if (crypto.createHash("sha256").update(fs.readFileSync(temp)).digest("hex") !== hash) throw new Error("temporary copy hash mismatch");
fs.renameSync(temp, target);
console.log(JSON.stringify({ schema: "operium.replication-result.v1", source: source.replaceAll("\\", "/"), target: target.replaceAll("\\", "/"), content_hash: hash, size_bytes: data.length, state: "replicated" }, null, 2));
