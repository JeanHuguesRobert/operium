---
title: "ADR — Serve the FractaVolta simulator under fracta.fractavolta.com/simulateur"
date: "2026-09-26"
document_role: source
document_kind: adr
visibility: public
lifecycle_state: proposed
status: proposed
---

# ADR — FractaVolta simulator routing

## Context

FractaVolta has a Streamlit prototype for mobile energy-buffer logistics.
`fracta.fractavolta.com` already exists as the public application surface, while
`fracta` is a constrained edge host and `fracta2` carries the heavier application runtime.

Creating another DNS name is unnecessary.

## Proposed decision

- Public URL: `https://fracta.fractavolta.com/simulateur/`
- TLS / public edge: existing Caddy on `fracta`
- Application runtime: `fracta2`
- Runtime: Streamlit, systemd-supervised
- Application port: `8502`
- Streamlit base URL path: `/simulateur`
- Caddy on `fracta` reverse-proxies only `/simulateur` and `/simulateur/*`
  to the simulator service on the fracta2 Tailscale address.
- Canonical editorial page remains `https://fractavolta.com/fr/simulateur`.

## Rationale

This avoids a DNS change, keeps the weak edge host small, reuses the existing
fracta → fracta2 application topology, and preserves a clean split between the
static corpus site and live applications.

## Non-claims

This decision does not claim that the service is currently deployed or healthy.
It records desired state until an apply and public smoke test are completed.
