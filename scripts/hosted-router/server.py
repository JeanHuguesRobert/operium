"""Loopback HTTP/WebSocket gateway for independent KasmVNC browser instances.

Caddy terminates public TLS. This process owns Basic authentication and routing.
It never trusts client-provided identity, workspace or upstream headers.
"""
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
import select
import socket
import ssl
import sys
from urllib.parse import urlsplit
from core import authorize, load_registry

HOP = {'connection','keep-alive','proxy-connection','te','trailer','transfer-encoding','upgrade'}
DENY = {'proxy-authorization','proxy-authenticate','x-forwarded-user','x-authenticated-user','x-remote-user','x-workspace-id'}
REGISTRY = os.environ.get('HOSTED_ROUTER_REGISTRY', '/etc/operium/hosted-browser/router.json')

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'HostedRouter/1'
    def log_message(self, fmt, *args):
        # Deliberately no URL, usernames, auth values or WS payload in logs.
        sys.stderr.write('hosted-router request completed\n')

    def reply(self, status):
        self.send_response(status)
        self.send_header('Content-Length','0')
        self.send_header('Cache-Control','no-store')
        if status == 401:
            self.send_header('WWW-Authenticate','Basic realm="Hosted Browser"')
        self.end_headers()

    def do_GET(self): self.dispatch()
    def do_POST(self): self.dispatch()
    def do_HEAD(self): self.dispatch()
    def do_PUT(self): self.dispatch()
    def do_DELETE(self): self.dispatch()
    def do_OPTIONS(self): self.dispatch()

    def dispatch(self):
        try:
            entry = authorize(load_registry(REGISTRY), self.headers.get('Authorization'))
        except (OSError, ValueError):
            return self.reply(503)
        if not entry:
            return self.reply(401)
        parts = urlsplit(self.path)
        if parts.scheme or parts.netloc or not self.path.startswith('/'):
            return self.reply(400)
        if self.headers.get('Upgrade','').lower() == 'websocket':
            return self.websocket(entry)
        if 'upgrade' in self.headers.get('Connection','').lower():
            return self.reply(400)
        return self.http_proxy(entry)

    def outgoing_headers(self, ws=False):
        headers = {}
        for k, v in self.headers.items():
            key=k.lower()
            if key in DENY or key == 'host':
                continue
            if not ws and key in HOP:
                continue
            if key in {'authorization','content-length', 'content-type','accept', 'accept-encoding','accept-language','cookie', 'origin','sec-websocket-key','sec-websocket-version','sec-websocket-protocol','sec-websocket-extensions','user-agent','referer','cache-control','pragma','range','if-none-match','if-modified-since','connection','upgrade'}:
                headers[k] = v
        headers['Host']='127.0.0.1'
        return headers

    def http_proxy(self, entry):
        conn = http.client.HTTPSConnection(entry['host'],entry['port'],timeout=15,context=ssl._create_unverified_context())
        try:
            n = self.headers.get('Content-Length')
            if self.headers.get('Transfer-Encoding'):
                return self.reply(400)
            if n is not None and (not n.isdecimal() or int(n)>1024*1024):
                return self.reply(413)
            body = self.rfile.read(int(n)) if n else None
            conn.request(self.command,self.path,body=body,headers=self.outgoing_headers())
            response=conn.getresponse()
            data=response.read(16*1024*1024+1)
            if len(data)>16*1024*1024:
                return self.reply(502)
            self.send_response_only(response.status,response.reason)
            for k,v in response.getheaders():
                if k.lower() not in HOP and k.lower() not in {'content-length','server','date'}:
                    self.send_header(k,v)
            self.send_header('Content-Length',str(len(data)))
            self.end_headers()
            if self.command != 'HEAD': self.wfile.write(data)
        except (OSError, http.client.HTTPException, ssl.SSLError):
            self.reply(502)
        finally:
            conn.close()

    def websocket(self,entry):
        if self.command != 'GET' or self.headers.get('Connection','').lower().find('upgrade')<0:
            return self.reply(400)
        upstream=socket.create_connection((entry['host'],entry['port']),timeout=12)
        tls=ssl._create_unverified_context().wrap_socket(upstream,server_hostname='localhost')
        try:
            tls.settimeout(12)
            headers=self.outgoing_headers(ws=True)
            headers['Connection']='Upgrade'; headers['Upgrade']='websocket'
            request=f'{self.command} {self.path} HTTP/1.1\r\n'+''.join(f'{k}: {v}\r\n' for k,v in headers.items())+'\r\n'
            tls.sendall(request.encode('latin-1'))
            head=b''
            while b'\r\n\r\n' not in head and len(head)<32768:
                chunk=tls.recv(4096)
                if not chunk: break
                head+=chunk
            if b'\r\n\r\n' not in head or not head.startswith(b'HTTP/1.1 '):
                return self.reply(502)
            status=int(head.split(b' ',2)[1])
            if status != 101:
                # Never leak upstream response or login challenge to a different realm.
                return self.reply(502)
            self.connection.sendall(head)
            self.close_connection=True
            tls.settimeout(None)
            self.connection.settimeout(None)
            pipes=[self.connection,tls]
            while True:
                readable,_,_=select.select(pipes,[],[],120)
                if not readable: break
                for source in readable:
                    data=source.recv(65536)
                    if not data: return
                    (tls if source is self.connection else self.connection).sendall(data)
        except (OSError, ssl.SSLError, ValueError):
            if not self.close_connection:
                self.reply(502)
        finally:
            tls.close()

if __name__ == '__main__':
    host=os.environ.get('HOSTED_ROUTER_BIND','127.0.0.1')
    port=int(os.environ.get('HOSTED_ROUTER_PORT','8768'))
    if host != '127.0.0.1':
        raise SystemExit('refusing non-loopback bind')
    ThreadingHTTPServer((host,port),Handler).serve_forever()
