"""Operator-run H3 acceptance: synthetic TLS backend + ephemeral identity.

This changes ONLY the private router registry (temporary test entry), never Caddy.
A finally block always tries to remove the entry and shut down the mock server.
Run as root after explicitly approving live fixture lifecycle testing.
"""
import base64
import hashlib
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import os
from pathlib import Path
import secrets
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import bcrypt

BASE=Path(__file__).resolve().parent
REGISTRY=Path('/etc/operium/hosted-browser/router.json')
CADDY=Path('/etc/caddy/fracta2-edge-https/browser-tls.caddy')
MANAGE=BASE/'manage.py'
TEST_LOGIN='h3-fixture-local-20261120'
TEST_ID='h3-fixture-ephemeral'
TEST_PORT=18846

class Backend(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def do_GET(self):
        if self.headers.get('Authorization') != self.server.expected:
            self.send_response(401)
            self.send_header('Content-Length','0')
            self.end_headers()
            return
        if self.headers.get('Upgrade','').lower()=='websocket':
            if not self.headers.get('Sec-WebSocket-Origin'):
                self.send_response(400)
                self.send_header('Content-Length','0')
                self.end_headers()
                return
            self.send_response(101)
            self.send_header('Connection','Upgrade')
            self.send_header('Upgrade','websocket')
            self.send_header('Sec-WebSocket-Accept','fixture')
            self.end_headers()
            return
        payload=b'operium-h3-fixture-ok'
        self.send_response(200)
        self.send_header('Content-Type','text/plain')
        self.send_header('Content-Length',str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self,*args):pass

def call(*args):
    p=subprocess.run([sys.executable,'-B',str(MANAGE),'--registry',str(REGISTRY),*args],capture_output=True,text=True)
    if p.returncode:
        raise RuntimeError('registry management failed: '+args[0])

def request_basic(authorization):
    # Hostname TLS is normally public; local proxy access through curl --resolve
    cmd=['curl','-ksS','--max-time','8','--resolve','browser.fractavolta.com:443:127.0.0.1',
         '-o','/dev/null','-w','%{http_code}','https://browser.fractavolta.com/']
    if authorization:
        cmd[1:1]=['-H','Authorization: Basic '+authorization]
    p=subprocess.run(cmd,capture_output=True,text=True)
    return p.stdout.strip() if p.returncode==0 else 'transport-error'

def request_websocket(authorization):
    key=base64.b64encode(os.urandom(16)).decode('ascii')
    request=('GET /websockify HTTP/1.1\r\n'
             'Host: browser.fractavolta.com\r\n'
             'Connection: Upgrade\r\n'
             'Upgrade: websocket\r\n'
             'Origin: https://browser.fractavolta.com\r\n'
             'Sec-WebSocket-Origin: https://browser.fractavolta.com\r\n'
             'Sec-WebSocket-Version: 13\r\n'
             'Sec-WebSocket-Protocol: binary\r\n'
             f'Sec-WebSocket-Key: {key}\r\n'
             f'Authorization: Basic {authorization}\r\n\r\n')
    with socket.create_connection(('127.0.0.1',443),timeout=8) as raw:
        with ssl._create_unverified_context().wrap_socket(raw,server_hostname='browser.fractavolta.com') as sock:
            sock.settimeout(8)
            sock.sendall(request.encode('ascii'))
            line=b''
            while b'\r\n' not in line and len(line)<1024:
                chunk=sock.recv(1024)
                if not chunk: break
                line+=chunk
            parts=line.split(b'\r\n',1)[0].split(b' ',2)
            return parts[1].decode() if len(parts)>=2 and parts[1].isdigit() else 'invalid'


def main():
    if os.geteuid()!=0:
        raise RuntimeError('requires root to edit the private registry')
    from core import load_registry
    if any(w['login']==TEST_LOGIN or w['id']==TEST_ID or w['port']==TEST_PORT for w in load_registry(REGISTRY)['workspaces']):
        raise RuntimeError('fixture identity/port already present; no mutation')
    with socket.socket() as s:
        s.bind(('127.0.0.1',TEST_PORT))
    original_hash=hashlib.sha256(CADDY.read_bytes()).hexdigest()
    credential=secrets.token_urlsafe(28)
    auth=base64.b64encode((TEST_LOGIN+':'+credential).encode()).decode()
    with tempfile.TemporaryDirectory(prefix='h3-router-fixture-') as d:
        d=Path(d)
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes',
                       '-keyout',str(d/'key.pem'),'-out',str(d/'cert.pem'),
                       '-subj','/CN=localhost','-days','1'],
                       check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        server=ThreadingHTTPServer(('127.0.0.1',TEST_PORT),Backend)
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(str(d/'cert.pem'),str(d/'key.pem'))
        server.socket=context.wrap_socket(server.socket,server_side=True)
        server.expected='Basic '+auth
        threading.Thread(target=server.serve_forever,daemon=True).start()
        hashed=d/'hash'
        hashed.write_bytes(bcrypt.hashpw(credential.encode(),bcrypt.gensalt(rounds=5)))
        hashed.chmod(0o600)
        added=False
        try:
            call('add',TEST_LOGIN,'--id',TEST_ID,'--port',str(TEST_PORT),'--hash-file',str(hashed))
            added=True
            result=request_basic(auth)
            print('registered_public_http='+result)
            if result!='200': raise RuntimeError('newly registered account not served')
            ws=request_websocket(auth)
            print('registered_public_websocket='+ws)
            if ws!='101': raise RuntimeError('newly registered account WebSocket not upgraded')
            call('disable',TEST_LOGIN)
            result=request_basic(auth)
            print('suspended_public_http='+result)
            if result!='401': raise RuntimeError('suspension did not deny public HTTP')
            ws=request_websocket(auth)
            print('suspended_public_websocket='+ws)
            if ws!='401': raise RuntimeError('suspension did not deny WebSocket')
            call('enable',TEST_LOGIN)
            result=request_basic(auth)
            print('restored_public_http='+result)
            if result!='200': raise RuntimeError('restoration did not allow public HTTP')
        finally:
            if added:
                call('remove',TEST_LOGIN)
            server.shutdown()
        result=request_basic(auth)
        print('removed_public_http='+result)
        if result!='401': raise RuntimeError('removal did not deny public HTTP')
        ws=request_websocket(auth)
        print('removed_public_websocket='+ws)
        if ws!='401': raise RuntimeError('removal did not deny WebSocket')
    if hashlib.sha256(CADDY.read_bytes()).hexdigest()!=original_hash:
        raise RuntimeError('Caddy vhost changed unexpectedly')
    if any(w['login']==TEST_LOGIN for w in load_registry(REGISTRY)['workspaces']):
        raise RuntimeError('test identity retained unexpectedly')
    print('caddy_config_unchanged=yes')
    print('temporary_identity_absent=yes')
    print('h3_fixture_cycle=PASS')

if __name__=='__main__':
    main()
