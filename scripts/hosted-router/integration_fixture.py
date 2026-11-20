"""End-to-end HTTP and WebSocket fixture using an isolated loopback TLS upstream."""
import base64
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import bcrypt

DIR=Path(__file__).parent

class Backend(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def do_GET(self):
        if self.path == '/large':
            chunk = b'0' * (1024*1024)
            self.send_response(200)
            self.send_header('Content-Length', str(18*len(chunk)))
            self.end_headers()
            for _ in range(18): self.wfile.write(chunk)
            return
        if self.headers.get('Authorization') != 'Basic '+base64.b64encode(b'tester:password').decode():
            self.send_response(401); self.send_header('Content-Length','0'); self.end_headers(); return
        if self.headers.get('Upgrade','').lower() == 'websocket':
            self.send_response(101)
            self.send_header('Connection','Upgrade')
            self.send_header('Upgrade','websocket')
            self.send_header('Sec-WebSocket-Accept','fixture')
            self.end_headers()
            self.wfile.flush()
            self.connection.sendall(b'fixture-ws-bytes')
            return
        body=b'test-backend'
        self.send_response(200); self.send_header('Content-Length',str(len(body))); self.end_headers();self.wfile.write(body)
    def log_message(self,*args): pass

class RouterIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        p=Path(cls.tmp.name)
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(p/'key.pem'),'-out',str(p/'cert.pem'),'-subj','/CN=localhost','-days','1'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        cls.backend=ThreadingHTTPServer(('127.0.0.1',0),Backend)
        ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(str(p/'cert.pem'),str(p/'key.pem'))
        cls.backend.socket=ctx.wrap_socket(cls.backend.socket,server_side=True)
        threading.Thread(target=cls.backend.serve_forever,daemon=True).start()
        registry={'version':1,'workspaces':[{'id':'demo','login':'tester','bcrypt_hash':bcrypt.hashpw(b'password',bcrypt.gensalt(rounds=4)).decode(),'host':'127.0.0.1','port':cls.backend.server_port,'enabled':True}]}
        (p/'registry.json').write_text(json.dumps(registry))
        sock=socket.socket();sock.bind(('127.0.0.1',0));cls.port=sock.getsockname()[1];sock.close()
        env=dict(os.environ,HOSTED_ROUTER_REGISTRY=str(p/'registry.json'),HOSTED_ROUTER_PORT=str(cls.port))
        cls.proc=subprocess.Popen([sys.executable,'-B',str(DIR/'server.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(40):
            try:
                with socket.create_connection(('127.0.0.1',cls.port),timeout=.2): break
            except OSError: time.sleep(.05)
    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate();cls.proc.wait(timeout=5);cls.backend.shutdown();cls.tmp.cleanup()
    def test_http_rejected_without_auth_and_valid_proxied(self):
        url=f'http://127.0.0.1:{self.port}/'
        with self.assertRaises(HTTPError) as ctx: urlopen(url)
        self.assertEqual(ctx.exception.code,401)
        good='Basic '+base64.b64encode(b'tester:password').decode()
        self.assertEqual(urlopen(Request(url,headers={'Authorization':good})).read(),b'test-backend')
    def test_http_streaming_over_old_16mib_ceiling(self):
        url=f'http://127.0.0.1:{self.port}/large'
        auth='Basic '+base64.b64encode(b'tester:password').decode()
        with urlopen(Request(url,headers={'Authorization':auth}),timeout=15) as response:
            self.assertEqual(response.status,200)
            self.assertEqual(len(response.read()),18*1024*1024)

    def test_websocket_upgrade(self):
        sock=socket.create_connection(('127.0.0.1',self.port),timeout=5)
        auth=base64.b64encode(b'tester:password').decode()
        req=(f'GET /websockify HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Basic {auth}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: Zml4dHVyZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')
        sock.sendall(req.encode())
        response=b''
        while b'fixture-ws-bytes' not in response and len(response)<8192:
            chunk=sock.recv(4096)
            if not chunk: break
            response+=chunk
        sock.close()
        self.assertIn(b'101 Switching Protocols',response)
        self.assertIn(b'fixture-ws-bytes',response)

if __name__=='__main__': unittest.main()
