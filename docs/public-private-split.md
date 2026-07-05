# Public / private split

Operium must distinguish between generic method, public views and private operational registries.

## Three layers

```text
generic method
      ↓ instantiated by
private operational registry
      ↓ expurgated into
public operational view
```

## Generic method

The generic method can be public.

It contains:

- doctrine;
- schemas;
- templates;
- examples;
- security principles;
- documentation.

## Public view

A public view may contain:

- public repositories;
- public services and domains;
- non-sensitive architecture;
- high-level operational status;
- intended evolutions that do not expose weaknesses;
- links to the generic method.

A public view must not expose:

- secrets;
- tokens;
- private keys;
- precise vulnerable configurations;
- unnecessary IP addresses;
- exploitable service details;
- full backup topology;
- private operational incidents.

## Private registry

A private registry contains the real operational state.

**Canonical store (this operator):** private GitHub repo `JeanHuguesRobert/registre-mariani`, path `operium/registry/resources.yaml`. The corpus registry (`.cogentia.json`) marks this repo as `kind: private_registry`.

**Local runtime default:** `~/.cogentia/registry/resources.yaml` — used by `operium up` when `OPERIUM_REGISTRY` is unset. Keep it in sync with the private repo (`git pull` on each authorised machine), or set `OPERIUM_REGISTRY` to the checked-out file.

**Never in git (any repo):** `~/.cogentia/secrets/` — env files, SSH private keys, token values. The YAML catalogue holds `stored_in` paths only.

It may include:

- hosts;
- services;
- repositories;
- domains;
- providers;
- agents;
- costs;
- backups;
- incidents;
- risks;
- local paths;
- credential references.

Even in a private registry, secrets should be stored only by reference.

## Secret references

Example:

```yaml
secrets:
  - id: github-token-main
    stored_in: password-manager
    usage: GitHub automation
    rotation: manual
    last_verified: 2026-06-24
```

Never store the secret value itself in the registry.
