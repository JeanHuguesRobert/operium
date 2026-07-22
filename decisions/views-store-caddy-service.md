---
title: "Views Store — Cogentia published views served via Caddy"
author: jhrobert
date: '2026-07-21'
document_role: source
document_kind: decision
visibility: public
lifecycle_state: active
update_policy: UP-DEFAULT-REVIEWED
provenance:
  origin_type: repository
  origin_repository: JeanHuguesRobert/operium
  origin_ref: views-store-caddy-service
  origin_date: '2026-07-21'
  derived_from: []
review:
  status: pending
  reviewed_by: []
decision_type: operational
status: accepted
---

# Views Store — Cogentia Published Views

## Context

Cogentia generates various markdown views (e.g., `current-issues.md`, `documents.md`) that need to be accessible externally without tracking them in Git. These views are reproductible artifacts that should be served via HTTP with rendering, raw, and download options.

## Decision

Deploy a **Views Store** on `fracta` VPS served via Caddy at `https://cogentia.fractavolta.com`.

### Architecture

```
cogentia.js (local) → rsync → fracta:/srv/views/ → Caddy → views-server.mjs (HTTP)
```

### Components

1. **Publisher** (`cogentia.js publish push`)
   - Runs locally on workstation
   - Uses rsync to push generated views to fracta

2. **Views Store** (`views-server.mjs`)
   - Runs on fracta as systemd service
   - Serves views with markdown rendering, raw, and download options
   - Checks frontmatter for `visibility: private/confidential/secret`

3. **Caddy** reverse proxy
   - Route `cogentia.fractavolta.com` → `localhost:3423`
   - SSL/TLS termination

## Installation

### ✅ Deployment Status: COMPLETE (2026-07-22)

All components deployed and operational on fracta VPS.

#### 1. Directories created
```bash
/srv/views          # View storage
/srv/views-server   # Server code
```

#### 2. views-server.mjs deployed
- Location: `/srv/views-server/views-server.mjs`
- Port: 3423
- systemd service: `views-store.service`

#### 3. Caddy configured
- Domain: `cogentia.fractavolta.com`
- SSL: Auto-HTTPS (Let's Encrypt)
- Proxy: `localhost:3423`

#### 4. DNS
- Record: `cogentia.fractavolta.com` → `fracta.fractavolta.com` (CNAME)
- Status: Active (pre-existing)

### Verification Commands

```bash
# Check service status
ssh fracta "systemctl status views-store"

# Check API locally
ssh fracta "curl http://localhost:3423/api/views"

# Check external HTTPS
curl -sk https://cogentia.fractavolta.com/api/views
```

## Usage

### Generate and publish from local workstation

```bash
# Export issues
COGENTIA_REGISTRY=/c/tweesic/JeanHuguesRobert node cogentia/scripts/cogentia.js issues export

# Publish to fracta
COGENTIA_REGISTRY=/c/tweesic/JeanHuguesRobert node cogentia/scripts/cogentia.js publish push current-issues
```

### Access URLs

- **Index**: https://cogentia.fractavolta.com/
- **Current Issues (rendered)**: https://cogentia.fractavolta.com/views/current-issues.md
- **Raw**: https://cogentia.fractavolta.com/views/current-issues.md?raw
- **Download**: https://cogentia.fractavolta.com/views/current-issues.md?download
- **API**: https://cogentia.fractavolta.com/api/views

## Frontmatter Visibility Guard

Views are **public by default** ("design in the open" philosophy). They are blocked if frontmatter contains:

- `visibility: private|confidential|secret`
- `public: false`
- `published: false`

Example:

```yaml
---
title: "Internal Notes"
visibility: confidential
---
```

## Consequences

- ✅ Cogentia generated views accessible without Git tracking
- ✅ Single rsync deployment, no manual file management
- ✅ Frontmatter-based privacy guard ("design in the open")
- ✅ HTTPS with automatic certificate management
- ✅ Wildcard DNS `*.fractavolta.com` enables future subdomains

## Current State (2026-07-22)

| Component | Status | Details |
|-----------|--------|---------|
| views-server.mjs | ✅ Running | Port 3423, systemd active |
| Caddy proxy | ✅ Active | HTTPS, Let's Encrypt cert |
| DNS | ✅ Configured | cogentia.fractavolta.com CNAME |
| current-issues.md | ✅ Published | 115 issues, 25KB |

### Published Views

- `current-issues.md` — 115 open issues across 12 repos (FractaVolta, cogentia, inseme, barons-Mariani, etc.)

## Alternatives Considered

- **Git tracking**: Rejected — history bloat, ephemeral artifacts
- **Separate branch**: Rejected — workflow complexity
- **GitHub Releases**: Rejected — manual process, not integrated

## References

- Cogentia: https://github.com/JeanHuguesRobert/cogentia
- Operium profile: `tools.fracta-vps.v1.yaml`
