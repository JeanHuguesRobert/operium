---
title: "Operium Environment Configuration via Views Store"
document_role: source
document_kind: decision
visibility: public
lifecycle_state: active
update_policy: UP-DEFAULT-REVIEWED
provenance:
  origin_type: repository
  created_at: 2026-07-23
  created_by: claude
---

# Operium Environment Configuration via Views Store

## Status

**Accepted** — 2026-07-23

## Context

Operium needs to access environment configuration from various repositories for deployment purposes. Historically, this required:

1. SSH access to individual repositories
2. Manual file extraction
3. Keeping local copies of .env files

This creates maintenance overhead and synchronization issues.

## Decision

Operium will consume `.env` files (with secrets redacted) from the Views Store at `https://cogentia.fractavolta.com`.

### Access Pattern

```bash
# Get redacted env file for a repo
curl https://cogentia.fractavolta.com/views/{repo}-env.txt

# Example: inseme environment
curl https://cogentia.fractavolta.com/views/inseme-env.txt
```

### Redaction Rules

All `.env` files published to the Views Store are automatically redacted:

- Empty values preserved: `KEY=`
- Boolean flags preserved: `KEY=true`, `KEY=false`
- Numeric flags preserved: `KEY=0`, `KEY=1`
- Secret values redacted: `SECRET_KEY=[REDACTED]`

This allows Operium to:

1. Discover required environment variables by key name
2. Understand configuration structure
3. Reference variable names in deployment scripts
4. Maintain security by never exposing actual secret values

### Deployment Workflow

```bash
# 1. Fetch configuration structure
ENV_CONFIG=$(curl -s https://cogentia.fractavolta.com/views/inseme-env.txt)

# 2. Extract required keys (example)
REQUIRED_KEYS=$(echo "$ENV_CONFIG" | grep -E '^[A-Z_][A-Z0-9_]*=' | cut -d= -f1)

# 3. Deploy with reference to required configuration
# Operium scripts can now reference variable names without knowing values
```

## Consequences

### Positive

- ✅ Centralized configuration access via HTTPS
- ✅ No need for direct git access to deployment targets
- ✅ Security maintained through redaction
- ✅ Configuration structure visible for planning
- ✅ Single source of truth for environment variable names

### Negative

- ⚠️ Actual secret values must be sourced separately (secure vault, manual input)
- ⚠️ Dependent on Views Store availability

### Alternatives Considered

1. **Direct Git Access** — Requires authentication and repo cloning for each deployment
2. **Manual Configuration Files** — Higher synchronization overhead
3. **Secret Management Service** — Would require additional infrastructure

## Related

- [Views Store Caddy Service](./views-store-caddy-service.md) — Infrastructure backing this decision
- [Inox Environment Configuration](https://cogentia.fractavolta.com/views/inox-env.txt) — Example consumption
