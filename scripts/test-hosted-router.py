"""Fixtures for dynamic hosted-router registry and authentication."""
import base64
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).parent/'hosted-router'))
import bcrypt
from core import load_registry, authorize, RegistryError
from server import Handler

class RouterTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/'registry.json'
        self.record={'version':1,'workspaces':[
            {'id':'workspace-one','login':'person-one','bcrypt_hash':bcrypt.hashpw(b'good1',bcrypt.gensalt(rounds=4)).decode(),'host':'127.0.0.1','port':8444,'enabled':True},
            {'id':'workspace-two','login':'person-two','bcrypt_hash':bcrypt.hashpw(b'good2',bcrypt.gensalt(rounds=4)).decode(),'host':'127.0.0.1','port':8445,'enabled':True},
        ]}
        self.save()
    def save(self): self.path.write_text(json.dumps(self.record))
    def auth(self, username, password):
        return 'Basic '+base64.b64encode((username+':'+password).encode()).decode()
    def test_isolation_and_wrong_password(self):
        db=load_registry(self.path)
        self.assertEqual(authorize(db,self.auth('person-one','good1'))['id'],'workspace-one')
        self.assertEqual(authorize(db,self.auth('person-two','good2'))['id'],'workspace-two')
        for a in (None,'Bearer no',self.auth('person-one','good2'),self.auth('person-two','good1'),self.auth('unknown','good1')):
            self.assertIsNone(authorize(db,a))
    def test_dynamic_creation_and_revocation(self):
        self.record['workspaces'].append({'id':'third','login':'person-three','bcrypt_hash':bcrypt.hashpw(b'good3',bcrypt.gensalt(rounds=4)).decode(),'host':'127.0.0.1','port':8446,'enabled':True})
        self.save()
        self.assertEqual(authorize(load_registry(self.path),self.auth('person-three','good3'))['id'],'third')
        self.record['workspaces'][2]['enabled']=False
        self.save()
        self.assertIsNone(authorize(load_registry(self.path),self.auth('person-three','good3')))
    def test_fail_closed_on_duplicate_or_non_loopback(self):
        self.record['workspaces'].append(dict(self.record['workspaces'][0]))
        self.save()
        with self.assertRaises(RegistryError): load_registry(self.path)
        self.record['workspaces'].pop()
        self.record['workspaces'][0]['host']='0.0.0.0'
        self.save()
        with self.assertRaises(RegistryError): load_registry(self.path)
    def test_reject_malformed_auth(self):
        for header in ('Basic !', 'Basic '+base64.b64encode(b'nocolon').decode(), 'Basic '+base64.b64encode(b'person-one:'+(b'x'*1200)).decode()):
            self.assertIsNone(authorize(load_registry(self.path),header))
    def test_registry_cli_disable_enable_without_caddy(self):
        cli=Path(__file__).parent/'hosted-router'/'manage.py'
        def run(action):
            subprocess.run([sys.executable,str(cli),'--registry',str(self.path),action,'person-one'],check=True,capture_output=True,text=True)
        run('disable')
        self.assertIsNone(authorize(load_registry(self.path),self.auth('person-one','good1')))
        run('enable')
        self.assertEqual(authorize(load_registry(self.path),self.auth('person-one','good1'))['id'],'workspace-one')
        self.assertTrue(Path(str(self.path)+'.lock').exists())

    def test_proxy_forwards_kasm_login_but_not_forged_identity(self):
        class Fake:
            headers={'Authorization':'Basic abc','X-Forwarded-User':'root','X-Workspace-Id':'private','Connection':'Upgrade','Upgrade':'websocket','Sec-WebSocket-Key':'123','Host':'example.org'}
        headers=Handler.outgoing_headers(Fake(),ws=True)
        self.assertEqual(headers.get('Authorization'),'Basic abc')
        self.assertNotIn('X-Forwarded-User',headers)
        self.assertNotIn('X-Workspace-Id',headers)
        self.assertEqual(headers['Host'],'127.0.0.1')
if __name__=='__main__': unittest.main()
