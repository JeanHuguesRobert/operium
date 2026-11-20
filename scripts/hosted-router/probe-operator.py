"""Manual authenticated HTTP and WS checks for one registered account.

Use from an SSH tty: prompts for a password without storing it on disk or
embedding it in a shell command. Prints only protocol status codes, not secrets.
"""
import argparse
import base64
import getpass
import http.client
import os
from pathlib import Path
import socket
import ssl
from core import load_registry


def ws_probe(port, credentials, tls):
    key = base64.b64encode(os.urandom(16)).decode('ascii')
    req = ('GET /websockify HTTP/1.1\r\n'
           'Host: browser.fractavolta.com\r\n'
           'Connection: Upgrade\r\n'
           'Upgrade: websocket\r\n'
           'Origin: https://browser.fractavolta.com\r\n'
           'Sec-WebSocket-Origin: https://browser.fractavolta.com\r\n'
           'Sec-WebSocket-Protocol: binary\r\n'
           'Sec-WebSocket-Version: 13\r\n'
           f'Sec-WebSocket-Key: {key}\r\n'
           f'Authorization: Basic {credentials}\r\n\r\n')
    with socket.create_connection(('127.0.0.1',port),timeout=10) as raw:
        sock = (ssl._create_unverified_context().wrap_socket(raw,server_hostname='localhost') if tls else raw)
        with sock:
            sock.settimeout(10)
            sock.sendall(req.encode('ascii'))
            response = b''
            while b'\r\n' not in response and len(response)<1024:
                part=sock.recv(1024)
                if not part:
                    break
                response+=part
            parts=response.split(b'\r\n',1)[0].split(b' ',2)
            return parts[1].decode('ascii') if len(parts)>=2 and parts[1].isdigit() else 'invalid'


def http_probe(port, credentials, tls):
    client=(http.client.HTTPSConnection('127.0.0.1',port,timeout=10,
                                      context=ssl._create_unverified_context()) if tls else
            http.client.HTTPConnection('127.0.0.1',port,timeout=10))
    try:
        client.request('GET','/',headers={'Authorization':'Basic '+credentials,
                                          'Host':'browser.fractavolta.com'})
        resp=client.getresponse()
        resp.read(256)
        return str(resp.status)
    finally:
        client.close()


def main():
    parser=argparse.ArgumentParser(description='Test existing account without printing password')
    parser.add_argument('login')
    parser.add_argument('--registry',default='/etc/operium/hosted-browser/router.json')
    args=parser.parse_args()
    w=next((w for w in load_registry(args.registry)['workspaces'] if w['login']==args.login and w['enabled']),None)
    if w is None: parser.error('unknown or disabled login')
    password=getpass.getpass('KasmVNC/Caddy password for '+w['login']+': ')
    encoded=base64.b64encode((w['login']+':'+password).encode()).decode('ascii')
    for label,port,tls in [('direct',w['port'],True),('router',8768,False)]:
        try:
            print(f'{label}: HTTP {http_probe(port,encoded,tls)}, WebSocket {ws_probe(port,encoded,tls)}')
        except (OSError, ssl.SSLError, ValueError) as error:
            print(f'{label}: {type(error).__name__}')

if __name__=='__main__': main()
