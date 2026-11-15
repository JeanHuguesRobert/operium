#!/usr/bin/env python3
"""SSH worker for validate-remote.py; source snapshots and logs are disposable."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time

ROOT = Path("/srv/cogentia/work/validation")
NODE24 = Path.home() / ".local/share/operium/node-v24.21.0-linux-arm64/bin"


def run_command(command, cwd, env, deadline, log):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return 124
    print("$ " + " ".join(command), flush=True)
    with log.open("wb") as output:
        proc = subprocess.Popen(command, cwd=cwd, env=env, stdout=output,
                                stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = proc.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            code = 124
        finally:
            # Reap background descendants even when their parent exits first.
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
    # Keep the full log on the host; stream a bounded tail to the client.
    data = log.read_bytes()
    print(data[-12000:].decode("utf-8", errors="replace"), end="", flush=True)
    return code if code >= 0 else 128 - code


def extract_snapshot(archive, source, revision):
    with tarfile.open(archive) as tar:
        if tar.pax_headers.get("comment") != revision:
            raise ValueError("archive commit identity does not match requested revision")
        tar.extractall(source, filter="data")


def main():
    meta = json.loads(sys.stdin.buffer.readline(8192))
    repo, revision = meta["repository"], meta["revision"]
    if repo not in ("Inox", "inseme") or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("unsupported repository or revision")
    if not isinstance(meta["timeout"], int) or not 10 <= meta["timeout"] <= 3600:
        raise ValueError("invalid timeout")
    if socket.gethostname() != "fracta2":
        raise ValueError("worker must run on fracta2")
    ROOT.mkdir(parents=True, exist_ok=True)
    # A nonblocking node-wide lock prevents concurrent validation builds.
    lock = (ROOT / "build.lock").open("a")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if shutil.disk_usage(ROOT).free < 5 * 1024**3:
        raise RuntimeError("less than 5 GiB free; inspect old validation artifacts first")
    run = Path(tempfile.mkdtemp(prefix=f"{repo}-{revision[:12]}-", dir=ROOT))
    archive = run / "source.tar"
    with archive.open("wb") as output:
        shutil.copyfileobj(sys.stdin.buffer, output)
    with archive.open("rb") as source_file:
        if hashlib.file_digest(source_file, "sha256").hexdigest() != meta["sha256"]:
            raise ValueError("archive transfer checksum mismatch")
    source = run / "source"
    source.mkdir()
    extract_snapshot(archive, source, revision)
    archive.unlink()
    result = dict(repository=repo, revision=revision, archive_sha256=meta["sha256"],
                  host=socket.gethostname(), artifact_dir=str(run), stages=[], exit_code=1)
    # No inherited provider credentials. Builds consume only the Git snapshot.
    env = {key: os.environ[key] for key in ("HOME", "USER", "LANG", "TMPDIR") if key in os.environ}
    env.update(PATH=f"{NODE24}:{Path.home() / '.local/bin'}:/usr/local/bin:/usr/bin:/bin",
               CI="true", MAKEFLAGS="-j1", CMAKE_BUILD_PARALLEL_LEVEL="1",
               NODE_OPTIONS="--max-old-space-size=3072", GIT_TERMINAL_PROMPT="0")
    deadline = time.monotonic() + meta["timeout"]
    if not (NODE24 / "node").is_file():
        raise RuntimeError("isolated Node 24 development runtime is not installed")
    commands = [("node", ["node", "--version"])]
    if repo == "Inox":
        commands += [
            ("install", ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"]),
            ("build", ["npm", "run", "build"]),
            ("shutdown", ["npm", "run", "test:shutdown"]),
            ("session", ["npm", "run", "test:session"]),
            ("serve", ["npm", "run", "test:serve"]),
        ]
    else:
        commands += [
            ("install", ["pnpm", "--filter", "@inseme/app-inseme...", "--filter", "@inseme/cop-core",
                         "install", "--frozen-lockfile", "--ignore-scripts"]),
            ("core-build", ["pnpm", "--filter", "@inseme/cop-core", "run", "build"]),
            ("core-test", ["pnpm", "--filter", "@inseme/cop-core", "exec", "vitest", "run",
                           "--maxWorkers=1", "--minWorkers=1"]),
            ("app-build", ["pnpm", "--filter", "@inseme/app-inseme", "run", "build"]),
        ]
    try:
        for name, command in commands:
            code = run_command(command, source, env, deadline, run / f"{name}.log")
            result["stages"].append(dict(name=name, exit_code=code))
            result["exit_code"] = code
            if code:
                break
    except Exception as error:
        result["exit_code"] = 1
        result["error"] = str(error)
    (run / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    print("OPERIUM_VALIDATION_RESULT " + json.dumps(result), flush=True)
    return result["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
