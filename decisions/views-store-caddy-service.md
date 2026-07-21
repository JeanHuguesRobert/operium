---
title: "Views Store — Cogentia published views served via Caddy"
author: jhrobert
date: '2026-07-21'
document_role: source
document_kind: decision
visibility: public
lifecycle_state: working
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

### 1. Create directories on fracta

```bash
ssh fracta "mkdir -p /srv/views /srv/views-server"
```

### 2. Deploy views-server.mjs

```bash
scp cogentia/scripts/views-server.mjs fracta:/srv/views-server/
```

### 3. Create systemd service

On fracta:

```bash
cat > /etc/systemd/system/views-store.service << 'EOF'
[Unit]
Description=Views Store API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/srv/views-server
ExecStart=/usr/bin/node /srv/views-server/views-server.mjs
Restart=always
RestartSec=10
Environment=PORT=3423
Environment=VIEWS_DIR=/srv/views

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now views-store
```

### 4. Configure Caddy

Add to Caddy config on fracta:

```caddyfile
cogentia.fractavolta {
    # API server reverse proxy
    handle_path /api/* {
        reverse_proxy localhost:3423
    }

    # Default index
    handle / {
        reverse_proxy localhost:3423
    }

    # Individual views with rendering
    handle /views/* {
        reverse_proxy localhost:3423
    }

    encode gzip
    log {
        output file /var/log/caddy/cogentia-access.log
    }
}
```

Then reload Caddy:

```bash
caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

### 5. DNS (Gandi)

One-time setup in Gandi DNS:

| Type | Name | Value |
|------|-----|-------|
| A | `*.fractavolta.com` | fracta VPS IP |
| A | `fractavolta.com` | fracta VPS IP |

## Usage

### Generate and publish from local workstation

```bash
# Export issues
COGENTIA_REGISTRY=/c/tweesic/JeanHuguesReference node cogentia/scripts/cogentia.js issues export

# Publish to fracta
COGENTIA_REGISTRY=/c/tweesic/JeanHuguesReference node cogentia/scripts/cogentia.js publish push current-issues
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

- Cogentia generated views accessible without Git tracking
- Single rsync deployment, no manual file management
- Frontmatter-based privacy guard
- Wildcard DNS `*.fractavolta.com` enables future subdomains

## Alternatives Considered

- **Git tracking**: Rejected — history bloat, ephemeral artifacts
- **Separate branch**: Rejected — workflow complexity
- **GitHub Releases**: Rejected — manual process, not integrated

## References

- Cogentia: https://github.com/JeanHuguesRobert/cogentia
- Operium profile: `tools.fracta-vps.v1.yaml`
