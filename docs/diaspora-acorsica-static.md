---
document_role: operational
document_kind: health-note
visibility: public
lifecycle_state: active
language: en
date: "2026-10-01"
---

# diaspora.acorsica.org static publication

## Observation — 2026-10-01

`diaspora.acorsica.org` is a DNS-only Cloudflare CNAME to `fracta.fractavolta.com` (TTL 300, not proxied). Fracta terminates TLS and reverse-proxies to `http://100.84.109.87:80`. Fracta2 serves the files over HTTP from `/srv/www/diaspora/current`.

At the check, `current` pointed at `releases/2026-10-01-6de2f16`. The previous release `releases/2026-10-01-82c261c` was left in place. Source commit: `6de2f1689db351321967fdabc2025adca62a426d` on `JeanHuguesRobert/barons-Mariani`. Receipt: `https://github.com/JeanHuguesRobert/barons-Mariani/issues/96#issuecomment-5921089658`.

External HTTPS returned 302 from `/` to `/web/index.html`, 200 for that page, and `diaspora.seed.v0` with 30 entities from `/data/seed.json`. The same check still saw 200 from `suicidecorse.baronsmariani.org` and `riseandfall.baronsmariani.org`.

This publication is the working static projection. It is not a frozen edition. Fracta2 has no new public ingress for it.
