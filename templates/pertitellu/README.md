---
title: Pertitellu Corte / LePP Fracta Preview
author: Jean Hugues Noël Robert, baron Mariani
affiliation: Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica
date: '2026-09-15'
last_modified_at: '2026-09-15'
version: '0.1'
status: working-paper
license: CC BY-SA 4.0
language: fr
document_role: template
update_policy: UP-DEFAULT-REVIEWED
provenance:
  origin_type: repository
  origin_repository: unknown
  origin_ref: unknown
  origin_date: '2026-09-15'
  derived_from: []
review:
  status: unreviewed
  reviewed_by: []
---

# Pertitellu Corte / LePP Fracta Preview

Ce modèle expose une version de prévisualisation (preview) pour l'instance collective
civique **`pertitellu-corte` (LePP / Corte)** à l'adresse :
`https://fracta.fractavolta.com/pertitellu/`.

## Architecture d'exploitation

1. **Serveur API / Health** :
   - Service Deno léger `pertitellu-fracta-preview.service` (port `8893`).
   - Endpoint de santé : `/health` ou `/api/health`.

2. **Ingress Caddy** :
   - Fragment `Caddyfile.fracta-preview.fragment` à insérer dans le bloc de site `fracta.fractavolta.com`.
   - Les requêtes sous `/pertitellu/*` sont servies depuis `/srv/pertitellu/fracta-preview/current`.
   - Les appels API sous `/api/pertitellu/*` et `/api/health` sont relayés vers `127.0.0.1:8893`.

3. **Génération du bundle statique** :
   ```bash
   pnpm --filter platform run build:pertitellu:preview
   ```

4. **Secrets et Vault** :
   - Aucun secret applicatif n'est committé dans Git.
   - Les clés et paramètres d'instance sont résolus depuis `instance_config` (Vault Supabase).
