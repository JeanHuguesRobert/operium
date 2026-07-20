---
document_role: "source"
document_kind: "research"
visibility: "private"
created: "2026-07-19"
status: "draft"
related:
  - "../docs/secrets-management.md"
---

# Secrets Architecture - Future Directions

## Current State (2026-07)

**Problems:**
- Secrets scattered across `.env` files on multiple machines
- No central source of truth
- Manual sync via Tailscale (error-prone)
- No rotation strategy
- Not integrated with GitHub workflow

**Current Architecture:**
```
inseme/.env → Tailscale rsync → other machines
```

## Desired State

**Requirements:**
1. Single source of truth (GitHub-associated)
2. Encryptable storage in Git (no separate sync mechanism)
3. Accessible via automation (no 2FA dependency)
4. Revocable per-machine
5. Audit trail

## Options Analysis

### Option 1: GitHub Actions Secrets (via API)

**Pros:**
- Native GitHub integration
- Already encrypted at rest
- Fine-grained permissions (repo/org level)
- Can be accessed via GitHub Actions API

**Cons:**
- Requires personal access token (PAT) for automation
- PAT itself needs secure storage
- No "user-level secrets" (only repo/org level)
- API rate limits

**Implementation:**
```javascript
// Could use GitHub Actions API to fetch secrets
async function getGitHubSecrets(repo, pat) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/secrets`,
    { headers: { Authorization: `Bearer ${pat}` } }
  );
  return response.json();
}
```

**Verdict:** ❌ Not ideal - requires PAT management

---

### Option 2: SOPS (Mozilla) + Git

**Pros:**
- Encrypts secrets in YAML/JSON/.env files
- Stores in Git (encrypted)
- Supports multiple encryption keys (GPG, KMS, age)
- Key rotation built-in
- No external dependency

**Cons:**
- Requires GPG or age key management
- Key distribution problem remains
- No 2FA integration

**Implementation:**
```bash
# Encrypt secrets file
sops --encrypt --kms "arn:..." --encrypted-regex '^(.*_API_KEY.*)$' .env

# Decrypt (requires access to KMS or GPG key)
sops --decrypt .env > .env.decrypted
```

**Verdict:** ✅ Strong candidate - age plugin for simple key management

---

### Option 3: age (modern alternative to GPG)

**Pros:**
- Simpler than GPG
- Small codebase (auditable)
- SSH key integration possible
- Native file encryption

**Cons:**
- Still requires key distribution
- No 2FA integration

**Implementation:**
```bash
# Generate key pair
age-keygen -o key.txt

# Encrypt file for recipient
age -r age1... -o .env.age .env

# Decrypt (requires private key)
age -d -o .env .env.age
```

**Verdict:** ✅ Excellent for simple use case

---

### Option 4: Master Key from Email Password

**Proposed Flow:**
1. User enters email password (once per session)
2. Derive encryption key using PBKDF2/Argon2
3. Encrypt/decrypt secrets using derived key
4. Store encrypted secrets in Git

**2FA Problem:**
- Email password alone insufficient with 2FA
- Cannot automate email access
- Would need app-specific password

**Hybrid Approach:**
- Use "App Password" from email provider (if available)
- Or use a dedicated passphrase (not the email password itself)

**Verdict:** ✅ Feasible with dedicated passphrase

---

### Option 5: GitHub Secret Scanning + Custom Encryption

**Pros:**
- Can store encrypted blobs in Git
- GitHub Secret Scanning detects leaked keys (safety net)
- Custom key management

**Cons:**
- Custom implementation needed
- Key distribution remains

**Verdict:** ⚠️ Possible but requires work

---

## Recommended Architecture (Future)

### Phase 1: age-based encryption

1. **Generate age key pair:**
   ```bash
   age-keygen -o ~/.age-key.txt
   ```

2. **Encrypt secrets:**
   ```bash
   age -r ~/.age-key.txt -o inseme/.env.age inseme/.env
   ```

3. **Store in Git:**
   - `.env.age` committed to Git
   - `.env` in .gitignore
   - Key stored separately (Tailscale, USB, password manager)

4. **Decrypt on machine setup:**
   ```bash
   age -d -o inseme/.env inseme/.env.age
   ```

### Phase 2: GitHub User Secrets (hypothetical)

If GitHub adds "user-level secrets":
- Migrate from age to GitHub user secrets
- Keep age as backup

### Phase 3: Email Password Derivation (if needed)

1. User runs setup script:
   ```bash
   node scripts/setup-master-key.js
   # Prompts for email password
   # Derives key using Argon2id
   # Stores salt in Git (public)
   # Stores encrypted secrets in Git
   ```

2. Daily use:
   ```bash
   node scripts/decrypt-secrets.js
   # Prompts for email password
   # Derives same key
   # Decrypts secrets
   ```

## Comparison Matrix

| Option | Git-compatible | No 2FA | Automation | Maturity | Recommendation |
|--------|----------------|--------|-------------|----------|----------------|
| GitHub Actions API | ❌ | ✅ | ✅ | High | ❌ PAT mgmt |
| SOPS | ✅ | ✅ | ✅ | High | ✅ Phase 1 |
| age | ✅ | ✅ | ✅ | High | ✅ Phase 1 |
| Email password | ✅ | ❌ | ❌ | Medium | ⚠️ Phase 3 |
| Custom encryption | ✅ | ✅ | ✅ | Low | ❌ Reinvent |

## Proposed Implementation Plan

### 1. Short-term (Current)
- Continue with Tailscale sync
- Add age encryption for backup
- Document in Operium

### 2. Medium-term (Next Quarter)
- Implement age-based encryption
- Migrate existing secrets
- Update sync-secrets.js to handle encrypted files
- Add `decrypt-secrets.js` script

### 3. Long-term (Future)
- Evaluate GitHub user secrets availability
- Consider email password derivation
- Audit and rotate keys

## Open Questions

1. **Age key storage:** Where to store private age key?
   - Tailscale file sync?
   - Password manager?
   - USB backup?
   - Print and keep physically?

2. **Machine revocation:** How to revoke access if machine compromised?
   - Re-encrypt all secrets with new key?
   - Multiple recipient keys (SOPS-style)?

3. **Email 2FA workaround:**
   - Use app-specific password?
   - Or use separate passphrase (safer)?

## Next Steps

1. Choose age encryption for Phase 1
2. Design key distribution strategy
3. Update `sync-secrets.js` to support encryption
4. Create setup/decrypt scripts
5. Document procedures

## Related

- [Current Secrets Management](../docs/secrets-management.md)
- [age documentation](https://age-encryption.org)
- [SOPS documentation](https://github.com/getsops/sops)
