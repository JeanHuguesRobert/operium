#!/usr/bin/env python3
"""Provision two private Stalwart 1.1.0 agent accounts through documented JMAP.

Owner-root invocation required: deliberately switches the already-private server
into recovery mode temporarily for API administration, then restores normal mode.
Never emits messages, enables SMTP, changes TLS/DNS, or enables service at boot.
No backups or archived copies are made.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

SERVICE = "stalwart.service"
DROPIN = pathlib.Path("/etc/systemd/system/stalwart.service.d/10-private-bootstrap.conf")
ENVFILE = pathlib.Path("/etc/stalwart/stalwart.env")
CREDS = pathlib.Path("/etc/stalwart/jhn-agent-mailboxes.json")
DOMAIN = "mail.fractavolta.com"
ACCOUNTS = ("john", "john-worker")
URI = "http://127.0.0.1:8080/jmap"
RECOVERY = """[Service]
Environment=STALWART_RECOVERY_MODE=true
ExecStartPre=
ExecStartPre=/usr/bin/test -s /etc/stalwart/config.json
IPAddressDeny=
IPAddressAllow=
NoNewPrivileges=true
"""


def run(*args: str) -> str:
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT).strip()


def service_status(verb: str) -> str:
    """systemctl is-enabled returns exit 1 for the valid 'disabled' state."""
    if verb not in ("is-active", "is-enabled"):
        raise ValueError("unsupported status query")
    result = subprocess.run(("systemctl", verb, SERVICE), capture_output=True, text=True, check=False)
    status = result.stdout.strip()
    if status not in ("active", "inactive", "failed", "activating", "deactivating", "disabled", "enabled", "static", "masked"):
        raise RuntimeError(f"Unexpected systemctl {verb} status (rc={result.returncode}): {status or result.stderr.strip()}")
    return status


def assert_ports(private: bool) -> None:
    sockets = run("ss", "-ltnH").splitlines()
    admin = []
    for line in sockets:
        parts = line.split()
        if len(parts) < 4:
            continue
        local = parts[3]
        try:
            port = int(local.rsplit(":", 1)[1])
        except (ValueError, IndexError):
            continue
        if port in (25, 465, 587, 993, 995, 4190, 2525):
            raise RuntimeError(f"Unexpected mail listener :{port}; refusing to proceed")
        if port == 8080:
            admin.append(local)
    if private and admin != ["127.0.0.1:8080"]:
        raise RuntimeError(f"Normal listener is not loopback-only: {admin}")
    if not admin:
        raise RuntimeError("Administration listener missing")


def api(credential: str, calls: list[list]) -> dict[str, tuple[str, dict]]:
    body = json.dumps({"using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"], "methodCalls": calls}).encode()
    token = base64.b64encode(credential.encode()).decode()
    request = urllib.request.Request(URI, body, {"Authorization": "Basic " + token, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=10) as response:
        data = json.load(response)
    return {cid: (name, obj) for name, obj, cid in data.get("methodResponses", [])}


def expect(result: dict, cid: str, method: str) -> dict:
    if cid not in result or result[cid][0] != method:
        raise RuntimeError(f"Unexpected JMAP response for {cid}: {result.get(cid, ('missing',))[0]}")
    return result[cid][1]


def setup(credential: str) -> None:
    ans = api(credential, [["x:Domain/get", {"ids": None}, "d"], ["x:Account/query", {"filter": {}}, "q"], ["x:Role/query", {"filter": {}}, "r"]])
    domains = expect(ans, "d", "x:Domain/get").get("list", [])
    matches = [d for d in domains if d.get("name") == DOMAIN]
    if len(matches) != 1:
        raise RuntimeError("Expected exactly one internal mail domain; no account changes")
    domain_id = matches[0]["id"]
    ids = expect(ans, "q", "x:Account/query").get("ids", [])
    if not expect(ans, "r", "x:Role/query").get("ids"):
        raise RuntimeError("No roles after normal bootstrap; refusing account creation")
    accounts = expect(api(credential, [["x:Account/get", {"ids": ids, "properties": ["id", "name", "domainId", "roles"]}, "a"]]), "a", "x:Account/get").get("list", []) if ids else []
    present = {(a.get("name"), a.get("domainId")): a for a in accounts}
    for name in ACCOUNTS:
        entry = present.get((name, domain_id))
        if entry:
            if entry.get("roles", {}).get("@type") != "User":
                raise RuntimeError("Existing agent account role differs from User: " + name)
            print("ALREADY_PRESENT " + name + " (not overwritten)")
            continue
        local = load_credential_file()
        key = name + "@" + DOMAIN
        if key not in local:
            local[key] = secrets.token_urlsafe(32)
            persist_credentials(local)
        new_obj = {
            "@type": "User", "name": name, "domainId": domain_id,
            "description": "Private JHN agent mailbox: " + name,
            "credentials": {"0": {"@type": "Password", "secret": local[key]}},
            "aliases": {}, "memberGroupIds": {},
            "roles": {"@type": "User"}, "permissions": {"@type": "Inherit"},
            "quotas": {"maxDiskQuota": 268435456},
            "encryptionAtRest": {"@type": "Disabled"},
        }
        result = expect(api(credential, [["x:Account/set", {"create": {"agent": new_obj}}, "create"]]), "create", "x:Account/set")
        if "agent" not in result.get("created", {}):
            raise RuntimeError("Account creation rejected for " + name + ": " + json.dumps(result.get("notCreated", {})))
        print("CREATED " + key + " (256 MiB quota, User role)")
    verify = expect(api(credential, [["x:Account/query", {"filter": {"domainId": domain_id}}, "verify"]]), "verify", "x:Account/query")
    print("DOMAIN_ACCOUNT_COUNT=" + str(len(verify.get("ids", []))))


def load_credential_file() -> dict:
    if not CREDS.exists():
        return {}
    data = json.loads(CREDS.read_text())
    if not isinstance(data, dict):
        raise RuntimeError("Credentials file not a dict")
    return data


def persist_credentials(data: dict) -> None:
    with tempfile.NamedTemporaryFile("w", dir=str(CREDS.parent), prefix=".jhn-mailbox-", delete=False) as f:
        os.fchmod(f.fileno(), 0o600)
        json.dump(data, f, indent=2)
        f.write("\n")
        temp = f.name
    os.replace(temp, CREDS)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="temporarily enter recovery, provision, return to normal")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError("Owner-root required for reading private local recovery credential")
    if run("/usr/local/bin/stalwart", "--version") != "1.1.0":
        raise RuntimeError("Unexpected Stalwart version")
    if service_status("is-active") != "active" or service_status("is-enabled") != "disabled":
        raise RuntimeError("Unexpected service state")
    if "STALWART_RECOVERY_MODE=true" in run("systemctl", "show", "-p", "Environment", "--value", SERVICE):
        raise RuntimeError("Server must start in normal mode, not already in recovery")
    assert_ports(private=True)
    if not DROPIN.exists() or not ENVFILE.exists():
        raise RuntimeError("Missing configured service or local credential")
    lines = dict(line.split("=", 1) for line in ENVFILE.read_text().splitlines() if "=" in line and not line.startswith("#"))
    credential = lines.get("STALWART_RECOVERY_ADMIN", "")
    if not credential.startswith("admin:") or len(credential) < 12:
        raise RuntimeError("Missing local recovery admin credential")
    if not args.apply:
        print("PREFLIGHT_OK: normal localhost HTTP service; recovery credential found (not printed). Run with --apply to provision accounts.")
        return 0
    old = DROPIN.read_text()
    try:
        run("systemctl", "stop", SERVICE)
        DROPIN.write_text(RECOVERY)
        run("systemctl", "daemon-reload")
        run("systemctl", "start", SERVICE)
        for _ in range(20):
            try:
                assert_ports(private=False)
                setup(credential)
                break
            except urllib.error.URLError:
                time.sleep(1)
        else:
            raise RuntimeError("Recovery management API unreachable")
    finally:
        # Restore normal mode even when JMAP has rejected a request.
        run("systemctl", "stop", SERVICE)
        DROPIN.write_text(old)
        run("systemctl", "daemon-reload")
        run("systemctl", "start", SERVICE)
    assert_ports(private=True)
    if service_status("is-active") != "active" or service_status("is-enabled") != "disabled":
        raise RuntimeError("Normal service status mismatch after restoring")
    print("PASS: provisioned/reconciled private mailboxes; NORMAL MODE restored; no SMTP listeners; service disabled at boot.")
    print("LOCAL_CREDENTIAL_FILE=/etc/stalwart/jhn-agent-mailboxes.json (root-only; never paste contents)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("FAILED: " + str(e), file=sys.stderr)
        sys.exit(1)
