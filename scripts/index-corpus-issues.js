#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const reposArg = process.argv.find((item) => item.startsWith("--repos="));
const repoFilter = reposArg ? new Set(reposArg.slice(8).split(",").map((value) => value.trim()).filter(Boolean)) : null;
const registryPath = path.resolve(process.env.COGENTIA_REGISTRY || "../JeanHuguesRobert/.cogentia.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const root = path.dirname(registryPath);
const schemaPath = path.join(process.cwd(), "schemas", "corpus-graph-cache.sql");
const dbPath = path.resolve(process.env.OPERIUM_GRAPH_DB || ".operium/corpus-graph.sqlite");
const reports = [];
const references = [];

function remoteSlug(repoPath) {
  try {
    const cwd = path.resolve(root, repoPath);
    const remote = execFileSync("git", ["config", "--get", "remote.origin.url"], { cwd, encoding: "utf8" }).trim();
    return remote.replace(/^https?:\/\/github.com\//, "").replace(/^git@github.com:/, "").replace(/\.git$/, "");
  } catch { return null; }
}

for (const repo of registry.repos || []) {
  if (repoFilter && !repoFilter.has(repo.name) && !repoFilter.has(repo.path)) continue;
  const slug = remoteSlug(repo.path);
  if (!slug || !slug.includes("/")) { reports.push({ repository: repo.name, state: "blocked", reason: "no-github-remote" }); continue; }
  try {
    const raw = execFileSync("gh", ["issue", "list", "--repo", slug, "--state", "all", "--limit", "100", "--json", "number,title,state,labels,createdAt,updatedAt,url"], { encoding: "utf8" });
    const issues = JSON.parse(raw).map((issue) => ({ ...issue, node_id: `${slug}#${issue.number}`, repository: slug }));
    const cwd = path.resolve(root, repo.path);
    const files = execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    for (const file of files) {
      if (!/\.(md|markdown|ya?ml|json)$/i.test(file)) continue;
      const text = fs.readFileSync(path.join(cwd, file), "utf8");
      for (const match of text.matchAll(/https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/g)) references.push({ repository: repo.name, artifact_path: file, issue_id: `${match[1]}#${match[2]}` });
    }
    reports.push({ repository: repo.name, repository_slug: slug, state: "indexed", issues });
  } catch (error) { reports.push({ repository: repo.name, repository_slug: slug, state: "blocked", reason: error.message }); }
}

if (apply) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(schemaPath, "utf8"));
  const repositoryId = db.prepare("SELECT repository_id FROM repositories WHERE repository_id = ?");
  const insert = db.prepare("INSERT INTO nodes (node_id,node_kind,repository_id,external_url,state,observed_at) VALUES (?,?,?,?,?,?) ON CONFLICT(node_id) DO UPDATE SET external_url=excluded.external_url,state=excluded.state,observed_at=excluded.observed_at");
  const edge = db.prepare("INSERT OR IGNORE INTO edges (edge_id,from_node_id,to_node_id,relation,source_revision,confidence,state,observed_at) VALUES (?,?,?,?,?,?,?,?)");
  const now = new Date().toISOString();
  for (const report of reports.filter((item) => item.state === "indexed")) for (const issue of report.issues) {
    const repoId = `${report.repository_slug}`;
    if (!repositoryId.get(repoId)) db.prepare("INSERT OR IGNORE INTO repositories (repository_id,name,root_path,source_revision,observed_at) VALUES (?,?,?,?,?)").run(repoId, report.repository, "", issue.updatedAt, now);
    insert.run(issue.node_id, "issue", repoId, issue.url, issue.state.toLowerCase(), now);
  }
  for (const ref of references) {
    const artifactId = `${ref.repository}:${ref.artifact_path}`;
    insert.run(artifactId, "artifact", null, null, "observed", now);
    edge.run(`${artifactId}->${ref.issue_id}:tracks_issue`, artifactId, ref.issue_id, "tracks_issue", null, "explicit", "observed", now);
  }
  db.close();
}

const totals = { repositories: reports.length, indexed: reports.filter((r) => r.state === "indexed").length, blocked: reports.filter((r) => r.state === "blocked").length, issues: reports.reduce((n, r) => n + (r.issues?.length || 0), 0), references: references.length };
console.log(JSON.stringify({ schema: "operium.corpus-issues-index.v1", generated_at: new Date().toISOString(), registry: registryPath.replaceAll("\\", "/"), read_only: !apply, applied: apply, db_path: apply ? dbPath.replaceAll("\\", "/") : null, totals, repositories: reports }, null, 2));
