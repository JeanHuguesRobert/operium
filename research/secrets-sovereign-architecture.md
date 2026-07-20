---
document_role: "source"
document_kind: "research"
visibility: "private"
created: "2026-07-19"
status: "draft"
related:
  - "../docs/secrets-management.md"
  - "secrets-architecture-2026-07.md"
---

# Secrets Architecture - Sovereign Approach

## Principle: Open Source is Strength, Not Dependency

**Core Philosophy:**
- Depending on Linux, Git, or other open-source software is **not a dependency** — it's a **strength**
- These are foundations: auditable, controllable, community-supported
- The goal is to minimize **proprietary lock-in**, not open-source foundations

**Current Reality:**
- ✅ **Strengths:** Linux, Git, open-source tools
- ⚠️ **Dependencies to reduce:** GitHub (proprietary platform)

**Goal:** Autonomous secret management that:
- Builds on open-source foundations
- Works with ANY Git remote (GitHub, GitLab, self-hosted, local)
- Avoids proprietary platform lock-in

## Sovereign Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   AGE ENCRYPTION (local)                    │
│              Private key: ~/.age-key.txt                      │
│              Never committed to any Git remote              │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ encrypt-secrets.js
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              .env.age (ENCRYPTED in Git)                    │
│           GitHub │ GitLab │ Self-hosted │ Local              │
│           All platforms see only encrypted blobs             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ decrypt-secrets.js
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    .env (local, per machine)                │
│              Never committed to Git (.gitignore)             │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Foundations vs Lock-ins

**✅ Strengths (Open Source — Build on these):**
- **Git** — GPLv2, auditable, universal
- **Linux** — Foundation of everything
- **age** — Modern encryption, open source
- **Tailscale** — Open-source WireGuard implementation
- File-based tools (rsync, etc.)

**⚠️ Weaknesses (Proprietary — Minimize dependence):**
- GitHub Secrets (platform-specific)
- GitLab Secrets (platform-specific)
- GitHub Actions for secrets (platform-specific)
- Any proprietary API that creates lock-in

### 2. Age Encryption (Recommended)

**Why age?**
- ✅ Pure Go, small binary, auditable
- ✅ No external dependencies
- ✅ Works offline
- ✅ Platform-agnostic
- ✅ Human-readable public keys
- ✅ Modern crypto (ChaCha20-Poly1305, X25519)

**Alternative:** GPG (but too complex)

### 3. Key Distribution (Sovereign Options)

| Method | Pros | Cons | Sovereignty |
|--------|-------|-------|-------------|
| **Tailscale file sync** | Auto, encrypted | Requires Tailscale | ✅ High |
| **USB/physical copy** | Air-gap secure | Manual | ✅✅ Max |
| **Password manager** | Audited | Vendor dependency | ⚠️ Medium |
| **Print + safe** | Ultimate air-gap | Manual | ✅✅ Max |
| **QR code + paper backup** | Accessible | Manual | ✅✅ Max |

### 4. Key Rotation Strategy

**Procedure:**
1. Generate new age key pair
2. Re-encrypt all `.env.age` files with new key
3. Distribute new key via sovereign method
4. Destroy old key securely
5. Update machines with new key

## Implementation

### Setup (One-Time)

```bash
# 1. Generate age key
node inseme/apps/platform/scripts/encrypt-secrets.js keygen

# 2. Backup private key securely
# Options:
#   - Copy to USB drive
#   - Print and store physically
#   - Add to password manager
#   - Sync via Tailscale (encrypted)

# 3. Add public key to README (for reference)
echo "# Age public key" >> README.md
echo "age1..." >> README.md

# 4. Encrypt secrets
node inseme/apps/platform/scripts/encrypt-secrets.js encrypt

# 5. Commit encrypted file
git add inseme/.env.age
git commit -m "Add encrypted secrets"

# 6. Remove plaintext from Git history if accidentally committed
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch inseme/.env" \
  --prune-empty --tag-name-filter cat -- --all
```

### Daily Workflow

```bash
# After cloning repo on new machine:
# 1. Copy private age key to ~/.age-key.txt (via sovereign method)
# 2. Decrypt secrets
node inseme/apps/platform/scripts/encrypt-secrets.js decrypt

# When updating secrets:
# 1. Edit inseme/.env
# 2. Encrypt
node inseme/apps/platform/scripts/encrypt-secrets.js encrypt
# 3. Commit encrypted file
git add inseme/.env.age
git commit -m "Update secrets"

# Never commit plaintext .env
echo "inseme/.env" >> .gitignore
```

## Philosophy: Dependency vs Strength

**What makes a "dependency" a weakness:**
- Proprietary, single vendor
- Cannot audit or modify
- Vendor can change terms/pricing
- Creates lock-in
- Not locally controllable

**What makes "dependence" a strength:**
- Open source, auditable
- Community-maintained
- Can fork if needed
- Universal standards
- Locally controllable

| Tool | Type | Classification |
|------|------|---------------|
| Linux | Open source (GPLv2) | ✅ Strength |
| Git | Open source (GPLv2) | ✅ Strength |
| age | Open source (BSD) | ✅ Strength |
| Tailscale | Open source core | ✅ Strength |
| GitHub | Proprietary platform | ⚠️ Dependency |
| GitHub Actions | Proprietary service | ⚠️ Dependency |

**Principle:** Build on strengths, minimize dependencies.

## Comparison: Platform Lock-in

| Solution | GitHub Lock-in | GitLab Lock-in | Self-hosted Works | Offline Works |
|----------|----------------|----------------|-------------------|---------------|
| GitHub Secrets | ✅ High | ❌ No | ❌ No | ❌ No |
| GitLab Secrets | ❌ No | ✅ High | ❌ No | ❌ No |
| age encryption | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Tailscale sync | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| 1Password | ❌ No | ❌ No | ✅ Yes | ⚠️ No* |

*Requires online for 1Password

## Sovereign Backup Strategy

### 3-2-1 Rule Adaptation

**3 copies:**
1. Git repo (encrypted `.env.age`)
2. Tailscale sync (encrypted)
3. Physical backup (USB/print)

**2 different media:**
1. Digital (Git + Tailscale)
2. Physical (USB/print)

**1 offsite:**
1. Git remote (any platform)
2. OR Physical backup in separate location

### Recovery Procedure

```bash
# If key lost:
# 1. Restore from USB backup
# 2. OR Restore from physical print
# 3. OR Generate new key and re-encrypt (if plaintext recoverable)

# If Git unavailable:
# 1. Use Tailscale sync
# 2. OR Use physical backup
```

## Avoided Anti-Patterns

### ❌ Platform Lock-in
- Don't use GitHub Secrets
- Don't use GitLab Secrets
- Don't use platform-specific CI/CD for secrets

### ❌ SaaS Dependencies
- Don't use 1Password/Bitwarden API
- Don't use cloud KMS (AWS/GCP/Azure)
- Don't use Vault (HashiCorp) unless self-hosted

### ❌ Complexity
- Don't implement custom crypto
- Don't use GPG (too complex for most)
- Don't use multiple encryption layers

## Recommended: Age + Sovereign Distribution

**Setup:**
```bash
# One-time per machine
node apps/platform/scripts/encrypt-secrets.js decrypt
```

**Update secrets:**
```bash
# Edit .env, then:
node apps/platform/scripts/encrypt-secrets.js encrypt
git add .env.age
git commit -m "Update secrets"
```

**Distribute key via:**
- Tailscale file sync (automatic)
- USB drive (manual, air-gap)
- Print + physical safe (maximum security)

## Related

- [Secrets Management](../docs/secrets-management.md)
- [age documentation](https://age-encryption.org)
- [Tailscale documentation](https://tailscale.com)
