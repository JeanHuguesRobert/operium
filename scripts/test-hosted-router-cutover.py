"""No real Caddy/service files touched; tests switch an isolated local fixture."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess

SOURCE=Path(__file__).parent/'hosted-router'/'caddy-cutover.py'
spec=importlib.util.spec_from_file_location('router_cutover',SOURCE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

CADDY='''https://browser.fractavolta.com {
    @soma path /.well-known/soma /soma/*
    handle @soma { reverse_proxy 127.0.0.1:8794 }
    @jhn_consent path /api/cop/principal-consent/*
    handle @jhn_consent { reverse_proxy 127.0.0.1:8796 }
    handle {
        route {
            basicauth {
                jhn fake
            }
            reverse_proxy @maguy 127.0.0.1:8446
            reverse_proxy @fred 127.0.0.1:8445
            reverse_proxy 127.0.0.1:8444
        }
    }
}
'''

class Tests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path=Path(tmp.name)
        self.current=self.path/'live.caddy'
        self.backup=self.path/'backup.caddy'
        self.main=self.path/'main.caddy'
        self.current.write_text(CADDY)
        self.current.chmod(0o640)
        self.main.write_text('')
        self.patches=[patch.object(m,'BASE',self.current),patch.object(m,'BACKUP',self.backup),patch.object(m,'CADDY_MAIN',self.main)]
        for p in self.patches:
            p.start();self.addCleanup(p.stop)
    def test_preflight_does_not_mutate_live_config(self):
        with patch.object(m,'run',return_value=None):
            old,new=m.preflight()
        self.assertEqual(old,CADDY)
        self.assertIn('reverse_proxy 127.0.0.1:8768',new)
        self.assertEqual(self.current.read_text(),CADDY)
        self.assertFalse(self.backup.exists())
    def test_apply_and_rollback_with_original_permissions(self):
        response=subprocess.CompletedProcess(args=[],returncode=0,stdout='401',stderr='')
        with patch.object(m,'run',return_value=None),patch.object(m.subprocess,'run',return_value=response):
            m.apply()
            self.assertTrue(self.backup.exists())
            self.assertEqual(self.backup.stat().st_mode&0o777,0o600)
            self.assertEqual(self.current.stat().st_mode&0o777,0o640)
            self.assertNotIn('basicauth',self.current.read_text())
            self.assertIn('reverse_proxy 127.0.0.1:8768',self.current.read_text())
            m.rollback()
        self.assertEqual(self.current.read_text(),CADDY)
        self.assertEqual(self.current.stat().st_mode&0o777,0o640)
    def test_probe_failure_restores_old_config(self):
        response=subprocess.CompletedProcess(args=[],returncode=0,stdout='502',stderr='')
        with patch.object(m,'run',return_value=None),patch.object(m.subprocess,'run',return_value=response):
            with self.assertRaises(RuntimeError):
                m.apply()
        self.assertEqual(self.current.read_text(),CADDY)

if __name__=='__main__':unittest.main()
