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
