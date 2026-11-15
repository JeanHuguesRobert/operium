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
import subprocess

path = Path(__file__).parent / "ops/remote-validation-worker.py"
spec = importlib.util.spec_from_file_location("remote_worker", path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class RemoteValidationTests(unittest.TestCase):
    def test_git_archive_identity_round_trip_and_dry_run(self):
        with tempfile.TemporaryDirectory() as workspace:
            root = Path(workspace)
            src = root / "Inox"
            src.mkdir()
            subprocess.run(["git", "init", "-q", str(src)], check=True)
            (src / "README.md").write_text("# test archive identity\n")
            subprocess.run(["git", "-C", str(src), "add", "README.md"], check=True)
            subprocess.run(["git", "-C", str(src), "-c", "user.name=Fixture",
                            "-c", "user.email=fixture@example.invalid",
                            "commit", "-q", "-m", "fixture"], check=True)
            revision = subprocess.check_output(["git","-C",str(src),"rev-parse","HEAD"],text=True).strip()
            archive = root / "fixture.tar"
            with archive.open("wb") as fd:
                subprocess.run(["git","-C",str(src),"archive","--format=tar",revision],
                               stdout=fd,check=True)
            extract = root / "extracted"
            extract.mkdir()
            worker.extract_snapshot(archive, extract, revision)
            env = os.environ.copy()
            script = (Path(__file__).parent / "ops/validate-remote.py").read_text()
            # The dry-run requires a known workspace parent, so run via an
            # injected source path inside the synthetic workspace, never SSH.
            tool_dir = root / "operium/scripts/ops"
            tool_dir.mkdir(parents=True)
            local_caller = tool_dir / "validate-remote.py"
            local_caller.write_text(script)
            result = subprocess.run([sys.executable,str(local_caller),"Inox",
                     "--host","fracta2","--via","","--revision",revision],
                     capture_output=True,text=True,timeout=10)
            self.assertEqual(result.returncode,0,result.stderr)
            plan = json.loads(result.stdout)
            self.assertEqual(plan["revision"],revision)
            self.assertEqual(plan["will_execute"],False)
            self.assertEqual(plan["effect_authorized"],False)
            self.assertEqual(len(plan["archive_sha256"]),64)

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
