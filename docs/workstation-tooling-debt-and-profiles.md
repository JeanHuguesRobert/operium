---
title: "Workstation tooling debt and Operium tool profiles"
subtitle: "Admin installs, user-space policy, and multi-node reproducibility (PC + fracta + fleet)"
author: "Jean Hugues Noël Robert"
date: "2026-07-19"
last_modified_at: "2026-07-19"
license: "Apache-2.0"
language: "fr"
status: "working-method"
document_role: "operational"
document_kind: "method"
visibility: "public"
repository: "JeanHuguesRobert/operium"
canonical_path: "docs/workstation-tooling-debt-and-profiles.md"
related_documents:
  - "doctrine.md"
  - "docs/fracta-trust-perimeter.md"
  - "docs/fractanet-mesh.md"
  - "docs/operium-node-agent-install.md"
  - "docs/public-private-split.md"
  - "decisions/ADR-0001-operium-scope.md"
---

# Workstation tooling debt and Operium tool profiles

## Contexte

Sur le poste Windows de travail, une partie des outils a été installée **en session administrateur** (npm global sous `C:\Program Files\nodejs`, etc.). Cela a produit une **dette technique d’installation** :

- désinstallations / mises à jour en **EPERM** (droits Program Files) ;
- packages globaux **cassés ou incomplets** (ex. `supabase@` sans version) ;
- commande absente du PATH alors que `npx` fonctionne encore ;
- divergence entre machines (PC, `fracta`, laptop, Termux) non versionnée.

La bonne nouvelle : l’automatisation d’install sur d’autres nœuds (dont `ssh fracta`) existe déjà en germe dans Operium (scripts `scripts/ops/*`, mesh, ONA). C’est l’occasion de **centraliser la politique d’outils** dans Operium, plutôt que de « réparer à la main une fois de plus ».

## Diagnostic (faits 2026-07-19)

### PC Windows (`admin`)

| Observation | Détail |
|-------------|--------|
| `npm root -g` / prefix | `C:\Program Files\nodejs` → **zone admin** |
| `npm uninstall -g supabase` | **EPERM** mkdir sous Program Files |
| Résidu | `Program Files\nodejs\node_modules\supabase` listé `supabase@` (version vide) |
| `supabase` dans PATH | absent |
| `npx supabase` | fonctionne (ex. 2.109.1) ; auth API OK ; `projects list` voit **JHN** |
| Docker | absent (pas de `supabase start` local) |
| Scoop | présent (user-space) ; bucket `supabase` ajoutable |

### fracta (`ssh fracta`)

| Observation | Détail |
|-------------|--------|
| `supabase` PATH | absent |
| `npx supabase` | OK 2.109.1 |
| Auth | **pas de token** (`Access token not provided`) |
| Docker | absent |
| RAM | ~1 Go → **ne pas** viser stack Docker Supabase locale |

### Leçon

```text
Même symptôme superficiel (« le CLI ne marche pas »)
  ≠ même cause
  ≠ même correctif

PC  = dette droits + install admin cassée (+ Docker absent)
fracta = pas d’install binaire + pas de login (+ VPS trop petit pour Docker CLI stack)
```

## Règle de politique (à adopter)

> **Installer les outils de développement en user-space, jamais en admin, sauf exception documentée (service Windows, pilote, etc.).**

| Classe | Windows | Linux (fracta / laptop) |
|--------|---------|-------------------------|
| CLI dev | **Scoop** (ou winget *user*) ; npm global seulement si `prefix` user | `~/.local`, mise, apt user-scripts ; éviter `sudo npm -g` |
| Runtime Node | Install user ou portable ; **pas** d’outils globaux dans Program Files | nvm / fnm / node system documenté |
| Services OS | Admin **uniquement** pour service/NSSM (ONA) — install *une fois*, run non-admin | systemd unit (déjà le pattern ONA) |
| Secrets | password manager / fichiers hors git | `/srv/.../secrets` (fracta) — jamais GitHub |

### Anti-patterns

```text
✗  npm install -g sous "Program Files\nodejs" (session admin)
✗  mélange Scoop + npm global admin pour le même outil
✗  sudo npm install -g sur fracta
✗  documenter l’outil seulement dans un README d’app (inseme, cogentia…)
   sans entrée Operium « état désiré par nœud »
```

## Rôle d’Operium

Operium documente déjà *what exists / what is intended / health* (doctrine).  
Étendre ce modèle aux **tool profiles** :

```text
profiles/
  tools.workstation-windows.v1.yaml   # PC de dev
  tools.fracta-vps.v1.yaml            # petit VPS public
  tools.laptop-capable.v1.yaml        # thinkpad capable host
  tools.termux.v1.yaml                # optionnel

scripts/ops/
  ensure-tool.ps1 / ensure-tool.sh    # un outil, idempotent
  audit-tools.ps1 / audit-tools.sh    # observe vs désiré → drift

docs/
  workstation-tooling-debt-and-profiles.md  # ce document
```

Chaque entrée d’outil (exemple) :

```yaml
id: supabase-cli
purpose: "Cloud migrations / link / projects (not local Docker stack on low-RAM nodes)"
desired:
  provider: scoop        # windows
  package: supabase
  # linux: "npx supabase" or official binary under ~/.local/bin
  min_version: "2.100.0"
  path_command: supabase
forbidden:
  - "npm -g under Program Files"
  - "sudo npm -g"
requires_docker: false   # for remote db push / link
requires_auth: true      # SUPABASE_ACCESS_TOKEN or supabase login
nodes:
  - workstation-windows: required
  - fracta: optional     # only if migrations run from VPS (usually not)
  - laptop-capable: optional
```

**Drift** (futur) : comparer `command -v` / version observée vs profil → entrée Operium health / ONA probe.

## Plan de remise au carré (outil par outil)

Ne pas tout corriger d’un coup. Une **file ordonnée** :

### Priorité 1 — outils bloquants JHN / Inseme

| Outil | Dette observée | Action désirée |
|-------|----------------|----------------|
| **supabase CLI** | npm global cassé + PATH | Scoop install ; `supabase` dans PATH user ; **ne plus** utiliser npm -g admin |
| **Node / npm prefix** | prefix = Program Files | Documenter ; migrer `npm config set prefix` vers répertoire user **ou** n’utiliser que Scoop + pnpm project-local |
| **pnpm** | global sous Program Files | OK si stable ; sinon Scoop/corepack user |

### Priorité 2 — CLIs de déploiement

| Outil | Note |
|-------|------|
| netlify-cli | Aujourd’hui global Program Files ; migrer Scoop ou `pnpm dlx` / project |
| gh | Vérifier Scoop vs MSI admin |
| git | Déjà Scoop possible |

### Priorité 3 — agents / AI CLIs

| Outil | Note |
|-------|------|
| @openai/codex, claude-code, gemini-cli, copilot | Souvent installés admin global ; préférer mises à jour via leurs installers user ou Scoop quand dispo |

### Priorité 4 — services Windows (légitime admin)

| Outil | Note |
|-------|------|
| ONA Windows service / NSSM | Admin **justifié** (voir `operium-node-agent-install.md`) ; séparer *install service* et *outils dev* |

## Procédure type « un outil »

Pour chaque dette :

```text
1. Observer
   - where / Get-Command
   - version
   - emplacement (Program Files vs user Scoop vs npx cache)

2. Décider le provider canonique (Scoop / apt / binary user)
   - écrire dans le profil Operium

3. Installer en user-space (idempotent)
   - ensure-tool script

4. Vérifier
   - commande PATH, version min
   - smoke (ex. supabase projects list)

5. Retirer l’ancien seulement si sûr
   - admin elevé UNE FOIS pour rm Program Files\...\supabase
   - ou laisser mourir l’ombre si Scoop est en tête du PATH

6. Enregistrer
   - fait / date / nœuds concernés dans ce doc ou ADR court
```

## Supabase CLI — correctif concret (premier ticket)

### Objectif

```text
supabase --version     # binaire PATH user, pas npx obligatoire
supabase projects list # auth existante OK sur PC
supabase link --project-ref ndiysuhzmztatpxbkezn
# plus tard: db push (mot de passe DB, pas Docker)
```

### Étapes PC

1. **Ne pas** insister sur `npm uninstall -g` sans élévation (EPERM attendu).
2. Install Scoop (déjà présent) :
   ```powershell
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   # ou: scoop update supabase
   ```
3. Vérifier que `C:\Users\admin\scoop\shims` est **avant** d’éventuels shims cassés dans le PATH.
4. `supabase projects list` → doit lister **JHN**.
5. Depuis `inseme/apps/platform` :
   ```powershell
   supabase link --project-ref ndiysuhzmztatpxbkezn
   ```
6. Migrations cloud : `supabase db push` (ou workflow documenté) **sans** Docker.
7. Optionnel (admin une fois) : supprimer le dossier résiduel  
   `C:\Program Files\nodejs\node_modules\supabase`.

### fracta

- **Par défaut : ne pas installer** la stack migrations sur fracta (RAM, rôle Guide public).
- Si un jour migration depuis fracta : binaire user `~/.local/bin/supabase` + token dans secrets **hors git** ; jamais Docker stack.

### Lien Inseme

Tant que le CLI n’est pas stable : continuer le runbook SQL manuel  
`inseme/apps/platform/instances/sql/jhn-bootstrap-minimal.sql`.  
Dès que Scoop + link OK : basculer le runbook JHN sur **migrations standard**.

## Ce qu’il ne faut pas confondre

| Besoin | Outil |
|--------|--------|
| Migrations cloud JHN | CLI + link + db push / SQL Editor |
| Stack locale complète (Auth/API locales) | Docker + `supabase start` — **hors scope** PC sans Docker et **hors** fracta |
| Inventaire multi-machines | **Operium** profiles + drift |
| Secrets | Operium secrets docs / fichiers nœud — pas le registry public |

## Prochaines livraisons Operium (proposées)

1. **Ce document** (fait).  
2. `profiles/tools.workstation-windows.v1.yaml` — liste prioritaire (supabase, gh, netlify, rsync…).  
3. `profiles/tools.fracta-vps.v1.yaml` — minimal (node, caddy-related, **pas** Docker Supabase).  
4. `scripts/ops/audit-tools.ps1` — observation JSON (commande, version, path).  
5. `scripts/ops/ensure-supabase-cli.ps1` — install Scoop idempotente + smoke.  
6. Entrée drift ONA / `operium up` (plus tard) : *tooling_profile_mismatch*.

## Formule

> **Operium porte l’état désiré des outils par classe de nœud.**  
> **Les installs admin sont l’exception documentée, pas le défaut.**  
> **Réparer outil par outil, avec smoke, puis retirer la dette.**

_Challenge via issues. Ne pas coller de tokens dans ce dépôt._
