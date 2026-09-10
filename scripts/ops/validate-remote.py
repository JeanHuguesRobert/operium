#!/usr/bin/env python3
"""Validate a clean committed Inox/Inseme snapshot on Fracta2 over SSH."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import time

MARKER = "OPERIUM_VALIDATION_RESULT "


def checked(*args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, text=True).strip()


def ssh_command(host, via, command):
    inner = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, command]
    if via:
        return ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", via, shlex.join(inner)]
    return inner


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", choices=["Inox", "inseme"])
    parser.add_argument("--host", default="fracta2")
    parser.add_argument("--via", default="fracta", help="SSH relay; empty string uses direct SSH")
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--timeout", type=int, default=1200, help="Total build/test deadline in seconds")
    parser.add_argument("--log-dir", default="/tmp/operium-validation")
    args = parser.parse_args()
    if not 10 <= args.timeout <= 3600:
        parser.error("timeout must be between 10 and 3600 seconds")
    if any(not value or value.startswith("-") or any(c.isspace() for c in value)
           for value in [args.host] + ([args.via] if args.via else [])):
        parser.error("invalid SSH alias")
    workspace = Path(__file__).resolve().parents[3]
    repo = workspace / args.repository
    if checked("git", "status", "--porcelain", cwd=repo):
        parser.error("source checkout must be clean; commit or preserve outstanding work first")
    revision = checked("git", "rev-parse", "--verify", "--end-of-options", args.revision + "^{commit}", cwd=repo)
    # Archive the requested commit, never a mutable checkout or untracked .env.
    with tempfile.TemporaryFile() as archive:
        subprocess.run(["git", "archive", "--format=tar", revision], cwd=repo, stdout=archive, check=True)
        archive.seek(0)
        digest = hashlib.file_digest(archive, "sha256").hexdigest()
        archive.seek(0)
        metadata = dict(repository=args.repository, revision=revision, sha256=digest, timeout=args.timeout)
        worker = Path(__file__).with_name("remote-validation-worker.py").read_bytes()
        encoded = base64.b64encode(worker).decode("ascii")
        command = "python3 -c " + shlex.quote("import base64; exec(compile(base64.b64decode(" + repr(encoded) + "), 'remote-validation-worker.py', 'exec'))")
        log_dir = Path(args.log_dir)
        log_dir.mkdir(parents=True, exist_ok=True)
        run_id = f"{args.repository}-{revision[:12]}-{time.time_ns()}"
        log_path = log_dir / (run_id + ".log")
        result = None
        print(f"Validating {args.repository}@{revision} on {args.host}; log: {log_path}", flush=True)
        with log_path.open("w") as log:
            proc = subprocess.Popen(ssh_command(args.host, args.via, command), stdin=subprocess.PIPE,
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            try:
                try:
                    proc.stdin.write((json.dumps(metadata) + "\n").encode())
                    shutil.copyfileobj(archive, proc.stdin)
                    proc.stdin.close()
                except BrokenPipeError:
                    # Drain the worker's diagnostic when a preflight rejects the run.
                    pass
                for raw in proc.stdout:
                    line = raw.decode("utf-8", errors="replace")
                    print(line, end="", flush=True)
                    log.write(line)
                    log.flush()
                    if line.startswith(MARKER):
                        result = json.loads(line[len(MARKER):])
                code = proc.wait()
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    proc.wait()
        if result is None or result.get("revision") != revision or result.get("repository") != args.repository:
            print("Remote validation did not return a matching result", file=sys.stderr)
            return code or 1
        result["local_log"] = str(log_path)
        summary = log_dir / (run_id + ".json")
        summary.write_text(json.dumps(result, indent=2) + "\n")
        print(f"Summary: {summary}")
        return code or result["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
