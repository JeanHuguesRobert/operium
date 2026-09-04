#!/bin/bash
# Sync Cogentia corpus repositories from fracta (/srv/cogentia/repos)
# Designed for low-RAM devices (RPi, VPS) using sequential rsync and non-destructive flags.
set -euo pipefail

FRACTA_HOST="${FRACTA_HOST:-fracta}"
FRACTA_REPOS="${FRACTA_REPOS:-/srv/cogentia/repos}"
TARGET_REPOS="${TARGET_REPOS:-/srv/cogentia/repos}"

mkdir -p "${TARGET_REPOS}"

REPOS=(
  .github
  FractaVolta
  Inox
  JeanHuguesRobert
  Kudos
  SimpliWiki
  StructEnv
  acorsica.org
  barons-Mariani
  cogentia
  gouvernance
  inseme
  institut-mariani
  marenostrum
  marianivillage
  operium
  pertitellu
  privai
  registre-mariani
  serra
  simpli
  survey
  ubikia
)

echo "[sync] Beginning corpus synchronization from ${FRACTA_HOST}:${FRACTA_REPOS} -> ${TARGET_REPOS}"

# 1. Sync AGENTS.md root pointer
rsync -avq -e "ssh -o BatchMode=yes -o ConnectTimeout=30" \
  "ubuntu@${FRACTA_HOST}:${FRACTA_REPOS}/AGENTS.md" "${TARGET_REPOS}/AGENTS.md"

# 2. Sync each repo sequentially to respect RAM boundary
for repo in "${REPOS[@]}"; do
  if [ ! -d "${TARGET_REPOS}/${repo}" ]; then
    echo "[syncing] ${repo}..."
    rsync -avq --ignore-existing -e "ssh -o BatchMode=yes -o ConnectTimeout=30" \
      "ubuntu@${FRACTA_HOST}:${FRACTA_REPOS}/${repo}" "${TARGET_REPOS}/"
  else
    echo "[exists] ${repo}"
  fi
done

echo "[sync] Complete."
du -sh "${TARGET_REPOS}"
ls -1 "${TARGET_REPOS}"
