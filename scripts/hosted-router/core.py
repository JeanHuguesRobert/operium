"""Local hosted-browser registry and authentication, separate from Caddy.

Registry contains bcrypt hashes, never plaintext credentials. The registry file
must remain private to the service administrator.
"""
import base64
import json
from pathlib import Path
import bcrypt

class RegistryError(ValueError):
    pass

def load_registry(path):
    return validate_registry(json.loads(Path(path).read_text()))

def validate_registry(data):
    if data.get('version') != 1 or not isinstance(data.get('workspaces'), list):
        raise RegistryError('unsupported registry format')
    seen = set()
    seen_ids = set()
    seen_ports = set()
    for w in data['workspaces']:
        if not isinstance(w, dict) or set(w) != {'id', 'login', 'bcrypt_hash', 'host', 'port', 'enabled'}:
            raise RegistryError('invalid workspace attributes')
        if not isinstance(w['id'], str) or not w['id'] or not isinstance(w['login'], str) or not w['login']:
            raise RegistryError('invalid identity')
        if w['login'] in seen:
            raise RegistryError('duplicate login')
        seen.add(w['login'])
        if w['id'] in seen_ids or w['port'] in seen_ports:
            raise RegistryError('duplicate workspace id or endpoint')
        seen_ids.add(w['id'])
        seen_ports.add(w['port'])
        if w['host'] != '127.0.0.1' or type(w['port']) is not int or not (1024 <= w['port'] <= 65535):
            raise RegistryError('endpoint must be a fixed loopback port')
        if type(w['enabled']) is not bool or not w['bcrypt_hash'].startswith(('$2a$', '$2b$', '$2y$')):
            raise RegistryError('invalid authorization fields')
    return data

def authorize(data, header):
    if not header or not header.startswith('Basic '):
        return None
    try:
        raw = base64.b64decode(header[6:], validate=True)
        if len(raw) > 1024:
            return None
        user, secret = raw.split(b':', 1)
        username = user.decode('utf-8')
    except (ValueError, UnicodeError):
        return None
    for w in data['workspaces']:
        if w['enabled'] and w['login'] == username:
            try:
                if bcrypt.checkpw(secret, w['bcrypt_hash'].encode('ascii')):
                    return w
            except (ValueError, UnicodeError):
                return None
    return None
