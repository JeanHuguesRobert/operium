#!/usr/bin/env python3
"""Regression checks for the remote validator's failure and archive boundaries."""
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import time
import unittest

path = Path(__file__).parent / "ops/remote-validation-worker.py"
spec = importlib.util.spec_from_file_location("remote_worker", path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

supervisor_path = Path(__file__).parent / "ops/supervise_task.py"
supervisor_spec = importlib.util.spec_from_file_location("supervise_task", supervisor_path)
supervisor_module = importlib.util.module_from_spec(supervisor_spec)
supervisor_spec.loader.exec_module(supervisor_module)


class RemoteValidationTests(unittest.TestCase):
    def test_task_supervisor_records_success(self):
        with tempfile.TemporaryDirectory() as directory:
            result = supervisor_module.supervise(
                [sys.executable, "-c", "print('supervisor success')"],
                directory,
                phase="success-probe",
            )
            self.assertEqual(result["schema"], "operium.ci.task-result.v1")
            self.assertEqual(result["outcome"], "success")
            self.assertEqual(result["exit_code"], 0)
            self.assertIn("supervisor success", (Path(directory) / "test.log").read_text())

    def test_task_supervisor_records_deliberate_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            result = supervisor_module.supervise(
                [sys.executable, "-c", "raise SystemExit(17)"],
                directory,
                phase="failure-probe",
            )
            self.assertEqual(result["outcome"], "failure")
            self.assertEqual(result["exit_code"], 17)
            stored = json.loads((Path(directory) / "result.json").read_text())
            self.assertEqual(stored["phase"], "failure-probe")

    def test_exit_status_and_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            code = worker.run_command([sys.executable, "-c", "raise SystemExit(7)"], root,
                                      os.environ.copy(), time.monotonic() + 10, root / "exit.log")
            self.assertEqual(code, 7)
            started = time.monotonic()
            code = worker.run_command([sys.executable, "-c", "import time; time.sleep(30)"], root,
                                      os.environ.copy(), started + 0.5, root / "timeout.log")
            self.assertEqual(code, 124)
            self.assertLess(time.monotonic() - started, 5)

    def test_commit_identity_and_path_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            source.mkdir()
            archive = root / "source.tar"
            revision = "a" * 40
            with tarfile.open(archive, "w", format=tarfile.PAX_FORMAT,
                              pax_headers={"comment": revision}) as tar:
                info = tarfile.TarInfo("../escaped")
                info.size = 3
                tar.addfile(info, io.BytesIO(b"bad"))
            with self.assertRaises(ValueError):
                worker.extract_snapshot(archive, source, "b" * 40)
            with self.assertRaises(tarfile.FilterError):
                worker.extract_snapshot(archive, source, revision)
            self.assertFalse((root / "escaped").exists())


if __name__ == "__main__":
    unittest.main()
