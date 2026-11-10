#!/usr/bin/env python3
"""Read-only DNS-vhost audit for public Fracta2 migration, Operium #77.

Source zone export is historical; live DNS and live Caddy define observed state.
Never contact or change external provider APIs.
"""
import json
import re
import socket
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/srv/cogentia/repos/operium')
zone = (ROOT / 'docs/fractavolta-dns.md').read_text()
legacy = sorted(set(re.findall(r'^([\w.-]+)\s+\d+ IN CNAME fracta\.fractavolta\.com\.', zone, re.M)))
legacy += ['fracta', 'mail', 'browser']
legacy = sorted(set(legacy))
site_files = list(Path('/etc/caddy/fracta2-edge-https').glob('*.caddy')) + list(Path('/etc/caddy/Caddyfile.d').glob('*.caddy'))
site_files += list((ROOT / 'templates/fracta2-public-edge').glob('*.caddy'))
registered = {}
for file in site_files:
    for line in file.read_text().splitlines():
        if line.strip().startswith('#') or '{' not in line or 'https://' not in line and 'http://' not in line:
            continue
        before = line.split('{', 1)[0]
        for host in re.findall(r'https?://([a-z0-9.-]+)', before):
            registered.setdefault(host, []).append(str(file))

def lookup(host):
    try:
        return sorted(set(row[4][0] for row in socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)))
    except OSError:
        return []

rows = []
for sub in legacy:
    host = f'{sub}.fractavolta.com'
    live = [p for p in registered.get(host, []) if '/etc/caddy/' in p]
    proposed = [p for p in registered.get(host, []) if p not in live]
    rows.append({'host':host, 'a':lookup(host), 'live_vhost':bool(live), 'staged_vhost':bool(proposed), 'category': ('existing' if live else 'prepared' if proposed else 'unassigned')})
other = ['services.acorsica.org','capable.acorsica.org','browser.fractavolta.com','suicidecorse.baronsmariani.org','riseandfall.baronsmariani.org']
for host in other:
    if any(row['host']==host for row in rows):continue
    live = [p for p in registered.get(host, []) if '/etc/caddy/' in p]
    proposed = [p for p in registered.get(host, []) if p not in live]
    rows.append({'host':host,'a':lookup(host),'live_vhost':bool(live),'staged_vhost':bool(proposed),'category':'existing' if live else 'prepared' if proposed else 'unassigned'})
print(json.dumps({'observed_at': datetime.now(timezone.utc).isoformat(), 'reference_ipv4':'82.70.234.207','warning':'historical zone snapshot, live DNS checked; unknown hosts are not approved for arbitrary publication','rows':rows},indent=2))
