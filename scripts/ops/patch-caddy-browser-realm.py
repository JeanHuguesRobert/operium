#!/usr/bin/env python3
from pathlib import Path

p = Path("/etc/caddy/Caddyfile")
text = p.read_text(encoding="utf-8")
old = """browser.fractavolta.com {
    reverse_proxy http://100.84.109.87:80
}"""
new = """browser.fractavolta.com {
    handle /hint {
        header Content-Type "text/html; charset=utf-8"
        respond `<!doctype html><meta charset="utf-8"><title>Hosted Browser</title><p>Utilisateur <code>jeanhuguesrobert</code><br>Mot de passe lab <code>sesame</code></p><p>Si le navigateur renvoie l ancien mot de passe: fermez tous les onglets vers ce site, puis rouvrez (fenetre normale).</p><p><a href="/">Ouvrir la session</a></p>` 200
    }
    reverse_proxy http://100.84.109.87:80 {
        header_down WWW-Authenticate "Basic realm=\\"sesame\\""
    }
}"""
if old not in text:
    raise SystemExit("browser.fractavolta.com block not found or already patched")
p.write_text(text.replace(old, new, 1), encoding="utf-8")
print("patched", p)
