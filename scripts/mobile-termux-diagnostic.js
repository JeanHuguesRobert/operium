import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { requestDigest, digest, executeMobilePacket, fetchMobilePacket, MOBILE_ISSUE, MOBILE_OPERATION } from "../lib/node-agent/mobile-diagnostic.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const execute = args.includes("--execute-authorized");
const direct = args.includes("--on-fracta");
const allowed = new Set(["--execute-authorized", "--on-fracta", "--db"]);
let dbPath;
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw new Error("unknown_argument");
  if (args[i] === "--db") {
    dbPath = args[++i];
    if (!dbPath || dbPath.startsWith("--") || dbPath === ":memory:") throw new Error("persistent_db_path_required");
  }
}
if (execute && !dbPath) throw new Error("explicit_diagnostic_db_required");
const files = ["lib/node-agent/mobile-diagnostic.js", "lib/node-agent/cop-events.js",
  "scripts/mobile-termux-diagnostic.js", "../inseme/packages/cop-core/src/github-ingress.js",
  "../inseme/packages/magistral/src/execution.js"];
const hashes = Object.fromEntries(files.map(file => [file, digest(fs.readFileSync(path.resolve(root, file)))]));
const revision = repo => {
  const result = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 5000 });
  if (result.status !== 0) throw new Error("source_revision_unavailable");
  return result.stdout.trim();
};
const source = { operium_commit: revision(root), inseme_commit: revision(path.resolve(root, "../inseme")),
  implementation_sha256: digest(JSON.stringify(hashes)), files: hashes };
const packet = await fetchMobilePacket({ source });
if (!execute) {
  console.log(JSON.stringify({ status: "prepared", packet, authorization_required: true }, null, 2));
} else {
  const authorization = { issue: MOBILE_ISSUE, operation: MOBILE_OPERATION,
    principal: "JeanHuguesRobert", execution: true, request_sha256: requestDigest(packet.request),
    basis: "Issue #141 controlling handoff, resumed by Principal; explicit local --execute-authorized" };
  const { db } = openNodeMemoryDb({ dbPath: path.resolve(dbPath), seedLocalState: false, backfillCopEvents: false });
  try {
    const result = executeMobilePacket(packet, { db, authorization, route: direct ? "fracta-local" : "via-fracta" });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } finally { db.close(); }
}
