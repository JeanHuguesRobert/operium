#!/usr/bin/env python3
"""Run a bounded CI task and persist its outcome without failing the job."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import time


def _text(value):
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value or "")


def supervise(command, output_dir, phase="test", timeout=240):
    if not command or not phase or timeout < 1:
        raise ValueError("command, phase, and positive timeout are required")

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / "test.log"
    started = datetime.now(timezone.utc).isoformat()
    start_clock = time.monotonic()
    exit_code = None
    error = None

    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            check=False,
        )
        output = _text(result.stdout)
        exit_code = result.returncode
    except subprocess.TimeoutExpired as exc:
        output = _text(exc.stdout)
        exit_code = 124
        error = {"code": "TASK_TIMEOUT", "message": f"task exceeded {timeout}s"}
    except OSError as exc:
        output = ""
        error = {"code": "TASK_START_FAILED", "message": str(exc)}

    passed = exit_code == 0 and error is None
    receipt = {
        "schema": "operium.ci.task-result.v1",
        "phase": phase,
        "outcome": "success" if passed else "failure",
        "exit_code": exit_code,
        "error": error,
        "command": command,
        "started_at": started,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "duration_ms": round((time.monotonic() - start_clock) * 1000),
        "log_file": log_path.name,
    }
    log_path.write_text(output, encoding="utf-8")
    (output_dir / "result.json").write_text(
        json.dumps(receipt, indent=2) + "\n", encoding="utf-8"
    )

    if output:
        sys.stdout.write(output)
        if not output.endswith("\n"):
            sys.stdout.write("\n")
    sys.stdout.write(json.dumps(receipt) + "\n")
    return receipt


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    try:
        separator = argv.index("--")
    except ValueError:
        raise SystemExit("usage: supervise_task.py --out DIR [--phase NAME] [--timeout SECONDS] -- COMMAND [ARGS...]")

    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--phase", default="test")
    parser.add_argument("--timeout", type=int, default=240)
    options = parser.parse_args(argv[:separator])
    command = argv[separator + 1:]
    try:
        supervise(command, options.out, options.phase, options.timeout)
        return 0
    except Exception as exc:  # Preserve handled supervisor failures as data too.
        output_dir = Path(options.out)
        try:
            output_dir.mkdir(parents=True, exist_ok=True)
            receipt = {
                "schema": "operium.ci.task-result.v1",
                "phase": options.phase,
                "outcome": "failure",
                "exit_code": None,
                "error": {"code": "SUPERVISOR_FAILED", "message": str(exc)},
                "command": command,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "log_file": "test.log",
            }
            (output_dir / "test.log").write_text(str(exc) + "\n", encoding="utf-8")
            (output_dir / "result.json").write_text(
                json.dumps(receipt, indent=2) + "\n", encoding="utf-8"
            )
            sys.stdout.write(json.dumps(receipt) + "\n")
            return 0
        except Exception as final_error:
            print(f"supervisor and receipt finalization failed: {final_error}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
