import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runGit(args, options = {}) {
  const cwd = options.cwd || options.repoPath || process.cwd();
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      env: { ...process.env, ...(options.env || {}) },
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
    });
    return {
      ok: true,
      code: 0,
      stdout: result.stdout.trimEnd(),
      stderr: result.stderr.trimEnd(),
    };
  } catch (error) {
    const failed = {
      ok: false,
      code: error.code ?? 1,
      stdout: String(error.stdout || "").trimEnd(),
      stderr: String(error.stderr || error.message || "").trimEnd(),
    };
    if (options.allowFailure) return failed;
    const message = failed.stderr || failed.stdout || `git ${args.join(" ")} failed`;
    const thrown = new Error(message);
    thrown.git = failed;
    thrown.args = args;
    throw thrown;
  }
}

export async function getGitRepoStatus(repoPath = process.cwd(), options = {}) {
  const remote = options.remote || "origin";
  const resolvedInput = path.resolve(repoPath || process.cwd());
  const top = await runGit(["rev-parse", "--show-toplevel"], {
    cwd: resolvedInput,
    allowFailure: true,
  });
  if (!top.ok) {
    return {
      ok: false,
      error: "not_a_git_repository",
      repo: { path: resolvedInput, remote },
      risks: ["not_a_git_repository"],
    };
  }

  const root = path.resolve(top.stdout);
  const gitDirResult = await runGit(["rev-parse", "--git-dir"], { cwd: root });
  const gitDir = path.resolve(root, gitDirResult.stdout);
  const branchResult = await runGit(["branch", "--show-current"], { cwd: root });
  const branch = branchResult.stdout || null;
  const detached = !branch;
  const head = (await runGit(["rev-parse", "HEAD"], { cwd: root })).stdout;
  const remoteUrlResult = await runGit(["remote", "get-url", remote], {
    cwd: root,
    allowFailure: true,
  });
  const upstreamResult = await runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
    cwd: root,
    allowFailure: true,
  });
  const upstream = upstreamResult.ok ? upstreamResult.stdout : null;
  const porcelain = (
    await runGit(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root })
  ).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  const workingTree = parsePorcelain(porcelain);
  const mergeInProgress = fs.existsSync(path.join(gitDir, "MERGE_HEAD"));
  const rebaseInProgress =
    fs.existsSync(path.join(gitDir, "rebase-merge")) || fs.existsSync(path.join(gitDir, "rebase-apply"));
  const conflicts = porcelain
    .filter(line => isUnmergedStatus(line.slice(0, 2)))
    .map(line => parsePorcelainPath(line.slice(3)));

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const counts = await revListCounts(root, `${upstream}...HEAD`);
    behind = counts.left;
    ahead = counts.right;
  }

  return {
    ok: true,
    repo: {
      path: root,
      name: path.basename(root),
      remote,
      remote_url: remoteUrlResult.ok ? remoteUrlResult.stdout : null,
      current_branch: branch,
      head,
      detached,
      upstream,
    },
    working_tree: workingTree,
    sync: {
      upstream,
      ahead,
      behind,
      diverged: ahead > 0 && behind > 0,
    },
    git_state: {
      git_dir: gitDir,
      detached,
      merge_in_progress: mergeInProgress,
      rebase_in_progress: rebaseInProgress,
      conflicts,
    },
  };
}

export function resolveWipBranch(status, options = {}) {
  if (options.branch) {
    return { candidate_branch: options.branch, reason: "branch_option" };
  }
  if (options.topic) {
    return { candidate_branch: `wip/${normalizeTopic(options.topic)}`, reason: "topic" };
  }
  const current = status?.repo?.current_branch;
  if (current?.startsWith("wip/")) {
    return { candidate_branch: current, reason: "current_branch" };
  }
  return { candidate_branch: null, reason: "none" };
}

export function detectDangerousGitState(status) {
  const risks = [];
  if (!status?.ok) risks.push(status?.error || "invalid_git_status");
  if (status?.git_state?.detached) risks.push("detached_head");
  if (status?.git_state?.merge_in_progress) risks.push("merge_in_progress");
  if (status?.git_state?.rebase_in_progress) risks.push("rebase_in_progress");
  if (status?.git_state?.conflicts?.length) risks.push("unresolved_conflicts");
  return risks;
}

export function detectSecretLikePaths(paths) {
  return [...new Set((paths || []).filter(isSecretLikePath))].sort();
}

export async function buildWipStatus(options = {}) {
  const status = await getGitRepoStatus(options.repoPath || options.repo || process.cwd(), options);
  const wip = resolveWipBranch(status, options);
  const risks = [
    ...detectDangerousGitState(status),
    ...(!status?.repo?.remote_url ? ["missing_remote"] : []),
  ];
  const nextActions = [];
  if (!wip.candidate_branch) {
    nextActions.push("Provide --topic <slug> or --branch <name>.");
  }
  if (risks.includes("detached_head")) {
    nextActions.push("Switch to a branch before handoff or resume.");
  }
  if (risks.includes("missing_remote")) {
    nextActions.push("Configure a Git remote before WIP handoff.");
  }

  return {
    schema: "operium.wip.status.v1",
    ok: status.ok === true,
    repo: status.repo,
    working_tree: status.working_tree,
    sync: status.sync,
    wip: wip,
    risks,
    next_actions: nextActions,
  };
}

export async function handoffWip(options = {}) {
  const schema = "operium.wip.handoff.v1";
  const remote = options.remote || "origin";
  const repoPath = options.repoPath || options.repo || process.cwd();
  let status = await getGitRepoStatus(repoPath, { remote });
  const headBefore = status.repo?.head || null;
  const wip = resolveWipBranch(status, options);

  if (!status.ok) return failure(schema, status.error, { repo: status.repo });
  if (!wip.candidate_branch) {
    return failure(schema, "missing_wip_branch", {
      repo: status.repo,
      next_actions: ["Retry with --topic <slug> or --branch <name>."],
    });
  }
  if (!status.repo.remote_url) {
    return failure(schema, "missing_remote", {
      repo: status.repo,
      next_actions: [`Configure remote '${remote}' before handoff.`],
    });
  }

  const dangerous = detectDangerousGitState(status);
  if (dangerous.length) return failure(schema, dangerous[0], { repo: status.repo, risks: dangerous });

  const pathsToCommit = pathsFromWorkingTree(status.working_tree);
  const blockedPaths = detectSecretLikePaths(pathsToCommit);
  if (blockedPaths.length) {
    return failure(schema, "secret_like_paths_detected", {
      repo: status.repo,
      blocked_paths: blockedPaths,
      next_actions: ["Remove blocked paths from the working tree or commit an explicit sanitized change."],
    });
  }

  if (options.dryRun) {
    return {
      schema,
      ok: true,
      dry_run: true,
      repo: handoffRepo(status, wip.candidate_branch, headBefore, headBefore),
      handoff: {
        created_commit: false,
        commit: null,
        pushed: false,
        message: buildHandoffMessage(wip.candidate_branch, options),
      },
      working_tree: { clean_after: status.working_tree?.clean === true },
      risks: [],
      next_actions: [`Resume elsewhere with: operium resume wip --branch ${wip.candidate_branch}`],
    };
  }

  await runGit(["fetch", remote], { cwd: status.repo.path });
  const currentBranch = status.repo.current_branch;
  const targetBranch = wip.candidate_branch;
  const localExists = await branchExists(status.repo.path, targetBranch);
  const remoteExists = await remoteBranchExists(status.repo.path, remote, targetBranch);

  if (currentBranch !== targetBranch) {
    if (localExists) {
      await runGit(["switch", targetBranch], { cwd: status.repo.path });
    } else if (remoteExists) {
      await runGit(["switch", "--track", "-c", targetBranch, `${remote}/${targetBranch}`], {
        cwd: status.repo.path,
      });
    } else {
      await runGit(["switch", "-c", targetBranch], { cwd: status.repo.path });
    }
  }

  status = await getGitRepoStatus(status.repo.path, { remote });
  if (remoteExists) {
    const counts = await revListCounts(status.repo.path, `${remote}/${targetBranch}...HEAD`);
    if (counts.left > 0) {
      return failure(schema, "remote_wip_ahead", {
        repo: status.repo,
        sync: { remote_branch: `${remote}/${targetBranch}`, ahead: counts.right, behind: counts.left },
        next_actions: [`Run: operium resume wip --branch ${targetBranch}`],
      });
    }
  }

  if (options.includeUntracked === false) {
    await runGit(["add", "-u"], { cwd: status.repo.path });
  } else {
    await runGit(["add", "-A"], { cwd: status.repo.path });
  }
  const stagedStatus = await getGitRepoStatus(status.repo.path, { remote });
  const stagedPaths = stagedStatus.working_tree?.staged || [];
  const blockedStaged = detectSecretLikePaths(stagedPaths);
  if (blockedStaged.length) {
    await runGit(["reset", "--", ...blockedStaged], { cwd: status.repo.path, allowFailure: true });
    return failure(schema, "secret_like_paths_detected", {
      repo: status.repo,
      blocked_paths: blockedStaged,
      next_actions: ["Remove or unstage blocked paths, then retry."],
    });
  }

  let createdCommit = false;
  let commit = null;
  const message = buildHandoffMessage(targetBranch, options);
  if (stagedPaths.length || options.allowEmpty) {
    const args = ["commit", "-m", message];
    if (!stagedPaths.length && options.allowEmpty) args.splice(1, 0, "--allow-empty");
    await runGit(args, { cwd: status.repo.path });
    createdCommit = true;
    commit = (await runGit(["rev-parse", "HEAD"], { cwd: status.repo.path })).stdout;
  }

  let pushed = false;
  if (!options.noPush) {
    await runGit(["push", "-u", remote, targetBranch], { cwd: status.repo.path });
    pushed = true;
  }

  const finalStatus = await getGitRepoStatus(status.repo.path, { remote });
  return {
    schema,
    ok: true,
    repo: handoffRepo(finalStatus, targetBranch, headBefore, finalStatus.repo.head),
    handoff: { created_commit: createdCommit, commit, pushed, message },
    working_tree: { clean_after: finalStatus.working_tree.clean },
    risks: [],
    next_actions: [`Resume elsewhere with: operium resume wip --branch ${targetBranch}`],
  };
}

export async function resumeWip(options = {}) {
  const schema = "operium.wip.resume.v1";
  const remote = options.remote || "origin";
  const repoPath = options.repoPath || options.repo || process.cwd();
  let status = await getGitRepoStatus(repoPath, { remote });
  const wip = resolveWipBranch(status, options);

  if (!status.ok) return failure(schema, status.error, { repo: status.repo });
  if (!wip.candidate_branch) {
    return failure(schema, "missing_wip_branch", {
      repo: status.repo,
      next_actions: ["Retry with --topic <slug> or --branch <name>."],
    });
  }

  if (!status.working_tree.clean && !options.allowDirty) {
    if (options.autoHandoffFirst) {
      const handoff = await handoffWip({ ...options, remote });
      if (!handoff.ok) return handoff;
      status = await getGitRepoStatus(repoPath, { remote });
    } else {
      return failure(schema, "dirty_working_tree", {
        repo: status.repo,
        next_actions: ["Commit, clean, or run with --allow-dirty / --auto-handoff-first."],
      });
    }
  }

  const dangerous = detectDangerousGitState(status);
  if (dangerous.length) return failure(schema, dangerous[0], { repo: status.repo, risks: dangerous });

  await runGit(["fetch", remote], { cwd: status.repo.path });
  const branch = wip.candidate_branch;
  const remoteExists = await remoteBranchExists(status.repo.path, remote, branch);
  if (!remoteExists) {
    return failure(schema, "remote_wip_branch_not_found", {
      repo: status.repo,
      next_actions: [`Create it with: operium handoff wip --branch ${branch}`],
    });
  }

  const localExists = await branchExists(status.repo.path, branch);
  const headBefore = status.repo.head;
  if (status.repo.current_branch !== branch) {
    if (localExists) {
      await runGit(["switch", branch], { cwd: status.repo.path });
    } else {
      await runGit(["switch", "--track", "-c", branch, `${remote}/${branch}`], { cwd: status.repo.path });
    }
  }
  await runGit(["pull", "--ff-only"], { cwd: status.repo.path });
  const finalStatus = await getGitRepoStatus(status.repo.path, { remote });
  const recovered = headBefore === finalStatus.repo.head ? 0 : await revListCount(status.repo.path, `${headBefore}..HEAD`);

  return {
    schema,
    ok: true,
    repo: {
      path: finalStatus.repo.path,
      name: finalStatus.repo.name,
      remote,
      branch,
      head: finalStatus.repo.head,
      upstream: finalStatus.repo.upstream,
    },
    working_tree: { clean: finalStatus.working_tree.clean },
    sync: finalStatus.sync,
    resume: { commits_recovered: recovered },
    risks: [],
    next_actions: finalStatus.working_tree.clean ? [] : ["Review local working tree before handoff."],
  };
}

function parsePorcelain(lines) {
  const staged = [];
  const modified = [];
  const deleted = [];
  const untracked = [];
  for (const line of lines) {
    const xy = line.slice(0, 2);
    const filePath = parsePorcelainPath(line.slice(3));
    if (xy === "??") {
      untracked.push(filePath);
      continue;
    }
    if (xy[0] !== " ") staged.push(filePath);
    if (xy[1] === "M" || xy[0] === "M") modified.push(filePath);
    if (xy[1] === "D" || xy[0] === "D") deleted.push(filePath);
  }
  return {
    clean: lines.length === 0,
    modified: [...new Set(modified)].sort(),
    deleted: [...new Set(deleted)].sort(),
    untracked: [...new Set(untracked)].sort(),
    staged: [...new Set(staged)].sort(),
  };
}

function parsePorcelainPath(raw) {
  const value = raw.includes(" -> ") ? raw.split(" -> ").pop() : raw;
  return value.replace(/^"|"$/g, "");
}

function pathsFromWorkingTree(tree = {}) {
  return [...new Set([...(tree.modified || []), ...(tree.deleted || []), ...(tree.untracked || []), ...(tree.staged || [])])];
}

function isUnmergedStatus(xy) {
  return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(xy);
}

function isSecretLikePath(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/").toLowerCase();
  const base = path.posix.basename(normalized);
  const ext = path.posix.extname(normalized);
  if (base === ".env" || base.endsWith(".env")) return true;
  if (["id_rsa", "id_ed25519"].includes(base)) return true;
  if ([".pem", ".key", ".p12", ".pfx"].includes(ext)) return true;
  return /secret|token|credential|fractanet-mesh/.test(normalized);
}

function normalizeTopic(topic) {
  const slug = String(topic || "")
    .trim()
    .replace(/^wip\//, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("invalid_topic");
  return slug;
}

async function branchExists(repoPath, branch) {
  const result = await runGit(["show-ref", "--verify", `refs/heads/${branch}`], {
    cwd: repoPath,
    allowFailure: true,
  });
  return result.ok;
}

async function remoteBranchExists(repoPath, remote, branch) {
  const result = await runGit(["show-ref", "--verify", `refs/remotes/${remote}/${branch}`], {
    cwd: repoPath,
    allowFailure: true,
  });
  return result.ok;
}

async function revListCounts(repoPath, range) {
  const result = await runGit(["rev-list", "--left-right", "--count", range], {
    cwd: repoPath,
    allowFailure: true,
  });
  if (!result.ok || !result.stdout) return { left: 0, right: 0 };
  const [left, right] = result.stdout.split(/\s+/).map(value => Number(value || 0));
  return { left, right };
}

async function revListCount(repoPath, range) {
  const result = await runGit(["rev-list", "--count", range], {
    cwd: repoPath,
    allowFailure: true,
  });
  if (!result.ok || !result.stdout) return 0;
  return Number(result.stdout) || 0;
}

function buildHandoffMessage(branch, options = {}) {
  if (options.message) return options.message;
  const topic = branch.startsWith("wip/") ? branch.slice(4) : branch;
  return `wip: handoff ${topic} from ${os.hostname()} at ${new Date().toISOString()}`;
}

function handoffRepo(status, branch, headBefore, headAfter) {
  return {
    path: status.repo.path,
    name: status.repo.name,
    remote: status.repo.remote,
    branch,
    head_before: headBefore,
    head_after: headAfter,
  };
}

function failure(schema, error, extra = {}) {
  return {
    schema,
    ok: false,
    error,
    ...extra,
  };
}
