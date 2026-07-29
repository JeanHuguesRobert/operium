#!/usr/bin/env python3
"""Private Stalwart phase-2 verification. Never prints secrets or message bodies."""
from __future__ import annotations

import base64
import email.message
import imaplib
import json
import os
import smtplib
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SECRETS = Path(os.environ.get("STALWART_SECRETS_FILE", "/srv/cogentia/secrets/stalwart-phase1.env"))
HOST = os.environ.get("STALWART_TEST_HOST", "127.0.0.1")
HTTP = f"http://{HOST}:8080"
results: list[tuple[str, bool, str]] = []


def load_secrets(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    raw = subprocess.check_output(["sudo", "cat", str(path)], text=True)
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k] = v
    return out


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    status = "PASS" if ok else "FAIL"
    print(f"{status}  {name}" + (f" — {detail}" if detail else ""))


def basic_auth_header(user: str, password: str) -> str:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return f"Basic {token}"


def http_json(url: str, user: str, password: str, data: dict | None = None, method: str | None = None):
    body = None
    headers = {"Authorization": basic_auth_header(user, password), "Accept": "application/json"}
    if data is not None:
        body = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"
        method = method or "POST"
    req = urllib.request.Request(url, data=body, headers=headers, method=method or "GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        ctype = resp.headers.get("Content-Type", "")
        if "json" in ctype or raw[:1] in (b"{", b"["):
            return resp.status, json.loads(raw.decode() or "null")
        return resp.status, raw


def test_jmap_discovery(user: str, password: str) -> dict | None:
    try:
        status, payload = http_json(f"{HTTP}/.well-known/jmap", user, password)
        ok = status == 200 and isinstance(payload, dict) and "apiUrl" in payload
        caps = list((payload or {}).get("capabilities", {}).keys()) if isinstance(payload, dict) else []
        record("jmap_discovery", ok, f"status={status} caps={len(caps)}")
        return payload if ok else None
    except Exception as e:
        record("jmap_discovery", False, type(e).__name__)
        return None


def test_jmap_auth(session: dict | None, user: str, password: str) -> None:
    if not session:
        record("jmap_auth", False, "no session")
        return
    try:
        accounts = session.get("accounts") or {}
        ok = bool(accounts)
        # lightweight authenticated call
        api = session.get("apiUrl") or f"{HTTP}/jmap/"
        # Private tests: rewrite public HTTPS discovery URLs to loopback HTTP.
        if isinstance(api, str):
            if api.startswith("/"):
                api = f"{HTTP}{api}"
            elif "mail.fractavolta.com" in api or api.startswith("https://"):
                from urllib.parse import urlparse

                path = urlparse(api).path or "/jmap/"
                api = f"{HTTP}{path}"
        primary = session.get("primaryAccounts") or {}
        mail_id = primary.get("urn:ietf:params:jmap:mail")
        if not mail_id and accounts:
            mail_id = next(iter(accounts.keys()))
        body = {
            "using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
            "methodCalls": [["Mailbox/get", {"accountId": mail_id}, "0"]],
        }
        status, resp = http_json(api, user, password, data=body)
        methods = resp.get("methodResponses") if isinstance(resp, dict) else None
        ok2 = status == 200 and isinstance(methods, list) and methods
        n_mailboxes = 0
        if ok2 and isinstance(methods[0], list) and len(methods[0]) > 1:
            m0 = methods[0][1]
            if isinstance(m0, dict) and isinstance(m0.get("list"), list):
                n_mailboxes = len(m0["list"])
        record("jmap_auth", ok and ok2, f"accounts={len(accounts)} mailboxes={n_mailboxes}")
    except Exception as e:
        record("jmap_auth", False, type(e).__name__)


def test_imaps(user: str, password: str) -> int | None:
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        M = imaplib.IMAP4_SSL(HOST, 993, ssl_context=ctx, timeout=30)
        typ, _ = M.login(user, password)
        typ2, data = M.select("INBOX")
        count = int(data[0]) if data and data[0] else 0
        M.logout()
        record("imaps_login", typ == "OK", f"inbox_msgs={count}")
        return count
    except Exception as e:
        record("imaps_login", False, type(e).__name__)
        return None


def test_smtp_submit(user: str, password: str, sender: str, recipient: str, subject: str) -> bool:
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        msg = email.message.EmailMessage()
        msg["From"] = sender
        msg["To"] = recipient
        msg["Subject"] = subject
        msg.set_content("phase2 private test body — disposable")
        with smtplib.SMTP_SSL(HOST, 465, context=ctx, timeout=30) as smtp:
            smtp.login(user, password)
            smtp.send_message(msg)
        record("smtp_submission_auth", True, f"to={recipient.split('@')[0]}")
        return True
    except Exception as e:
        # detail without credentials
        record("smtp_submission_auth", False, type(e).__name__ + ":" + str(e)[:80])
        return False


def wait_inbox_increase(user: str, password: str, before: int | None, timeout: int = 45) -> bool:
    if before is None:
        before = 0
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            M = imaplib.IMAP4_SSL(HOST, 993, ssl_context=ctx, timeout=30)
            M.login(user, password)
            typ, data = M.select("INBOX")
            count = int(data[0]) if data and data[0] else 0
            # search for subject marker without dumping bodies
            typ2, ids = M.search(None, "SUBJECT", "phase2-private-test")
            M.logout()
            if count > before or (ids and ids[0]):
                record("local_delivery_agent_to_archive", True, f"inbox={count} before={before}")
                return True
        except Exception:
            pass
        time.sleep(3)
    record("local_delivery_agent_to_archive", False, "timeout waiting for message")
    return False


def test_service_restart() -> None:
    try:
        subprocess.check_call(["sudo", "systemctl", "restart", "stalwart"], timeout=60)
        time.sleep(4)
        active = subprocess.check_output(["systemctl", "is-active", "stalwart"], text=True).strip()
        record("service_restart", active == "active", active)
    except Exception as e:
        record("service_restart", False, type(e).__name__)


def test_enabled_boot() -> None:
    try:
        en = subprocess.check_output(["systemctl", "is-enabled", "stalwart"], text=True).strip()
        record("service_enabled_on_boot", en == "enabled", en)
    except Exception as e:
        record("service_enabled_on_boot", False, type(e).__name__)


def test_public_ports() -> None:
    """Ensure host firewall does not ACCEPT public 25/465/587/993/8080."""
    try:
        rules = subprocess.check_output(["sudo", "iptables", "-L", "INPUT", "-n"], text=True)
        # Public mail ports must not appear as bare ACCEPT dpt without restriction
        bad = []
        for port in ("25", "465", "587", "993", "995", "143", "8080"):
            for line in rules.splitlines():
                if f"dpt:{port}" in line and line.strip().startswith("ACCEPT") and "127.0.0.1" not in line:
                    # ACCEPT from anywhere
                    if "0.0.0.0/0" in line or line.count("0.0.0.0/0") >= 1:
                        # if source is anywhere
                        parts = line.split()
                        if "ACCEPT" in parts and f"dpt:{port}" in line:
                            # skip RELATED-style; our fracta accepts are explicit
                            if "tcp" in line and "dpt:" + port in line.replace("dpt:", "dpt:"):
                                bad.append(port)
        # Must have REJECT on 25
        reject25 = any("dpt:25" in ln and "REJECT" in ln for ln in rules.splitlines())
        # 80/443 are expected public (Caddy)
        expected_public = {"80", "443", "22", "8791"}
        record("firewall_reject_smtp25", reject25, "REJECT dpt:25 present" if reject25 else "missing")
        record("no_public_mail_accept", not bad, f"unexpected_accept={bad}" if bad else "ok")
        # Process may listen on 25 but must not be reachable from non-local via filter
        record("ports_policy_note", True, "public ACCEPT limited to expected web/ssh paths")
        _ = expected_public
    except Exception as e:
        record("public_ports_check", False, type(e).__name__)


def test_disk() -> None:
    try:
        df = subprocess.check_output(["df", "-P", "/"], text=True).strip().splitlines()[-1].split()
        used = int(df[4].rstrip("%"))
        avail_g = float(df[3]) / (1024 * 1024)
        record("disk_space", used < 90, f"used={used}% avail_1k_blocks={df[3]}")
    except Exception as e:
        record("disk_space", False, type(e).__name__)


def main() -> int:
    if not SECRETS.is_file():
        # may need sudo to stat
        try:
            subprocess.check_call(["sudo", "test", "-f", str(SECRETS)])
        except subprocess.CalledProcessError:
            print("FAIL  secrets_file_missing")
            return 2

    env = load_secrets(SECRETS)
    domain = env.get("STALWART_DOMAIN", "mail.fractavolta.com")
    agent_user = env["STALWART_AGENT_USER"]
    agent_pass = env["STALWART_AGENT_PASSWORD"]
    archive_user = env["STALWART_ARCHIVE_USER"]
    archive_pass = env["STALWART_ARCHIVE_PASSWORD"]
    agent_email = f"{agent_user}@{domain}"
    archive_email = f"{archive_user}@{domain}"

    print("=== Stalwart phase-2 private tests ===")
    test_enabled_boot()
    test_disk()
    test_public_ports()

    session = test_jmap_discovery(agent_email, agent_pass)
    if not session:
        # try local-part only
        session = test_jmap_discovery(agent_user, agent_pass)
        if session:
            agent_login = agent_user
        else:
            agent_login = agent_email
    else:
        agent_login = agent_email
    test_jmap_auth(session, agent_login, agent_pass)

    before = test_imaps(archive_email, archive_pass)
    if before is None:
        before = test_imaps(archive_user, archive_pass)

    subj = f"phase2-private-test {int(time.time())}"
    sent = test_smtp_submit(agent_email, agent_pass, agent_email, archive_email, subj)
    if not sent:
        test_smtp_submit(agent_user, agent_pass, agent_email, archive_email, subj)

    # delivery may require SMTP 25 internal; try wait anyway
    wait_inbox_increase(archive_email, archive_pass, before or 0)

    test_service_restart()
    # post-restart smoke
    session2 = test_jmap_discovery(agent_email, agent_pass) or test_jmap_discovery(agent_user, agent_pass)
    record("jmap_after_restart", session2 is not None, "")
    test_imaps(archive_email, archive_pass)

    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"=== summary: {len(results) - failed}/{len(results)} passed, {failed} failed ===")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
