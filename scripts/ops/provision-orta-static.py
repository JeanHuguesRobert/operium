#!/usr/bin/env python3
"""Initial Orta origin provisioning. Explicit owner apply, no DNS credentials.

Uses the exact approved working release from the Living Book Factory.
No execution of code from that release; only checked static bytes.
Refuses a competing current pointer or differing Caddy fragments.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.request

HOST = "orta.acorsica.org"
SITE = Path("/srv/www/orta")
CADDY = Path("/etc/caddy/Caddyfile")
CANDIDATE = Path("/tmp/lbf348-delivery-real.ebrdsd/books/orta-resources-60446b1e64e01ad375f63e8de9689640f9b868f17d7827580bd6c7ab0dd0d6f1")
TREE = "60446b1e64e01ad375f63e8de9689640f9b868f17d7827580bd6c7ab0dd0d6f1"
RECEIPT = "54268813b6a5edfd759fc6bb132add707b6606b626c330de40ee46e82129d553"
FRAGMENTS = {
    Path("/etc/caddy/Caddyfile.d/orta.caddy"): "http",
    Path("/etc/caddy/fracta2-edge-https/orta-tls.caddy"): "https",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def inventory(root):
    out = {}
    for f in sorted(root.rglob("*")):
        if f.is_symlink():
            raise ValueError("Unexpected symlink in release")
        if f.is_file():
            out[f.relative_to(root).as_posix()] = f.read_bytes()
        elif not f.is_dir():
            raise ValueError("Unexpected nonregular entry")
    return out


def metadata(files):
    return {name: {"sha256": sha(data), "size": len(data)} for name, data in files.items()}


def fragment(scheme):
    return (f"{scheme}://{HOST} {{\n"
            f"    root * {SITE}/current\n"
            "    encode zstd gzip\n\n"
            "    @webmanifest path *.webmanifest\n"
            "    header @webmanifest Content-Type application/manifest+json\n\n"
            "    file_server\n}\n").encode()


def run_caddy(command):
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def preflight(apply, candidate):
    raw = (candidate / "receipt.json").read_bytes()
    if sha(raw) != RECEIPT:
        raise ValueError("Receipt digest mismatch")
    r = json.loads(raw)
    files = inventory(candidate / "site")
    if (r["book_id"] != "orta" or r["canonical_host"] != HOST
            or r["release"] != CANDIDATE.name or r["tree_sha256"] != TREE
            or metadata(files) != r["files"] or sha(canonical(r["files"])) != TREE):
        raise ValueError("Exact release mismatch")
    dest = SITE / "releases" / CANDIDATE.name
    current = SITE / "current"
    for p in (SITE, SITE / "releases", dest):
        if p.is_symlink() or (p.exists() and not p.is_dir()):
            raise ValueError("Unexpected deployment path")
        if p.exists() and (p.stat().st_uid != 0 or p.stat().st_mode & 0o022):
            raise ValueError("Unexpected deployment directory ownership or mode")
    if current.exists() or current.is_symlink():
        if not current.is_symlink() or current.resolve(strict=True) != dest:
            raise ValueError("Competing current pointer")
    if dest.exists() and inventory(dest) != files:
        raise ValueError("Existing release differs")
    missing = []
    for p, scheme in FRAGMENTS.items():
        if p.is_symlink() or (p.exists() and p.read_bytes() != fragment(scheme)):
            raise ValueError("Competing Caddy fragment")
        if not p.exists():
            missing.append(p)
    # Validate the complete configuration with all existing imports, not just the new host.
    with tempfile.TemporaryDirectory(prefix="orta-caddy-check-") as tmp:
        config = Path(tmp) / "Caddyfile"
        config.write_bytes(CADDY.read_bytes() + b"\n" + b"\n".join(
            fragment(FRAGMENTS[p]) for p in missing))
        run_caddy(["/usr/bin/caddy", "adapt", "--config", str(config), "--adapter", "caddyfile"])
        if apply:
            run_caddy(["/usr/bin/caddy", "validate", "--config", str(config), "--adapter", "caddyfile"])
    print(json.dumps({"status": "PREFLIGHT_PASS", "host": HOST, "release": str(dest),
                      "files": len(files), "missing_fragments": len(missing)}), flush=True)
    return files, dest, current, missing


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true")
    p.add_argument("--check", action="store_true")
    p.add_argument("--candidate", type=Path, default=CANDIDATE,
                   help="Location of the exact pinned release and receipt")
    a = p.parse_args()
    if a.apply and (a.check or os.geteuid() != 0):
        raise ValueError("Explicit owner root apply required")
    files, dest, current, missing = preflight(a.apply, a.candidate)
    if not a.apply:
        return
    SITE.mkdir(mode=0o755, exist_ok=True)
    dest.parent.mkdir(mode=0o755, exist_ok=True)
    if not dest.exists():
        stage = Path(tempfile.mkdtemp(prefix=".orta-", dir=dest.parent))
        try:
            stage.chmod(0o755)
            for name, data in files.items():
                f = stage / name
                f.parent.mkdir(parents=True, exist_ok=True)
                with f.open("xb") as out:
                    out.write(data)
                f.chmod(0o644)
            if inventory(stage) != files:
                raise ValueError("Staging differs from approved bytes")
            stage.rename(dest)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    if not current.is_symlink():
        current.symlink_to(Path("releases") / dest.name)
    if current.resolve(strict=True) != dest or inventory(dest) != files:
        raise ValueError("Publication pointer or bytes changed")
    for path in missing:
        with path.open("xb") as f:
            f.write(fragment(FRAGMENTS[path]))
        path.chmod(0o644)
    run_caddy(["/usr/bin/caddy", "validate", "--config", str(CADDY), "--adapter", "caddyfile"])
    def verify_origin():
        for name, data in files.items():
            req = urllib.request.Request("http://127.0.0.1/" + ("" if name == "index.html" else name),
                                         headers={"Host": HOST, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=8) as res:
                if res.status != 200 or res.read() != data:
                    raise ValueError("Origin verification failed: " + name)
    reloaded = bool(missing)
    if not reloaded:
        try:
            verify_origin()
        except (OSError, ValueError):
            reloaded = True
    if reloaded:
        subprocess.run(["systemctl", "reload", "caddy"], check=True)
        verify_origin()
    print(json.dumps({"status": "ORIGIN_VERIFIED", "host": HOST, "release": str(dest),
                      "tree_sha256": TREE, "files": len(files),
                      "caddy_reloaded": reloaded, "public_https": "verify_separately"}))


if __name__ == "__main__":
    main()
