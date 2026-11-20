import sys
import unittest
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
p=Path(__file__).parent/'hosted-router'/'render-caddy-candidate.py'
spec=spec_from_file_location('render_caddy',p)
m=module_from_spec(spec);spec.loader.exec_module(m)
class CaddyMigrationTests(unittest.TestCase):
    def test_preserves_special_paths_and_replaces_static_auth(self):
        old='''https://browser.fractavolta.com {
    @jhn_consent path /api/cop/principal-consent/*
    handle @jhn_consent { reverse_proxy 127.0.0.1:8796 }
    @soma path /.well-known/soma /soma/*
    handle @soma { reverse_proxy 127.0.0.1:8794 }
    handle {
        route {
            basicauth {
                user hash
            }
            reverse_proxy @maguy 127.0.0.1:8446
            reverse_proxy @fred 127.0.0.1:8445
            reverse_proxy 127.0.0.1:8444
        }
    }
}
'''
        new=m.render(old)
        for special in ('/api/cop/principal-consent/*','/.well-known/soma','/soma/*'):
            self.assertIn(special,new)
        self.assertEqual(new.count('reverse_proxy 127.0.0.1:8768'),1)
        for forbidden in ('basicauth','@fred','@maguy','8444','8445','8446'):
            self.assertNotIn(forbidden,new)
    def test_rejects_unrecognized_caddy_layout(self):
        with self.assertRaises(ValueError):m.render('foo')
if __name__=='__main__':unittest.main()
