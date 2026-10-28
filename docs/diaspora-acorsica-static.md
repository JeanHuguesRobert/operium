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

## Placement a cold handler needs

The pattern copied is Suicide Corse and Rise & Fall: DNS-only CNAME to `fracta.fractavolta.com`, TLS on Fracta, HTTP files on Fracta2. `oleole.acorsica.org` points at Netlify and is a different placement.

- Fracta site block: `diaspora.acorsica.org` in `/etc/caddy/Caddyfile`, reverse proxy to `http://100.84.109.87:80`. Backup: `/etc/caddy/Caddyfile.bak.diaspora-20261001`.
- Fracta2 site file: `/etc/caddy/Caddyfile.d/diaspora.caddy`, imported by `/etc/caddy/Caddyfile`. Root: `/srv/www/diaspora/current`. `/` redirects to `/web/index.html`.
- The release contains the `projects/diaspora/` tree, with `web/` and `data/` as siblings. Publishing `web/` alone breaks `../data/seed.json`.
- There is no `CNAME` file in that tree. Do not add one that would let GitHub Pages claim the hostname.
- File rollback is a symlink switch to `releases/2026-10-01-82c261c`. That older tree still says the host was not served. DNS and the Caddy site blocks are separate from the symlink.
- DNS edits for `acorsica.org` reuse the existing Cloudflare bearer credential. On the operator workstation the value is `CLOUDFLARE_API_KEY` in `C:\tweesic\inseme\.env`. Do not copy the value into git.
- A later check from that workstation resolved the name to `82.70.234.207` and `https://diaspora.acorsica.org/web/index.html` returned 200. The earlier NXDOMAIN from resolver `10.198.17.11` was a negative cache.
- On the same workstation, `127.0.0.1:8765` is held by a Node process supervised by nssm since 2026-09-28. The local diaspora server falls forward when `PORT` is unset. Do not stop that service.

Corpus resume stays on JeanHuguesRobert/barons-Mariani issue 96. The 2026-10-01 milestone in `projects/diaspora/journals/reality-test-2026-09-30.md` is the repository-side record. Do not treat the 23:22 reality-test block, which correctly says the name was not deployed yet, as the current frontier.
