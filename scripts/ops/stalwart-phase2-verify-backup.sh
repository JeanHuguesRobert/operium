#!/usr/bin/env bash
set -euo pipefail
ENC="$(ls -1t /var/backups/stalwart/stalwart-*.tar.enc | head -1)"
echo "backup=${ENC}"
(cd "$(dirname "$ENC")" && sha256sum -c "$(basename "$ENC").sha256")
TMP="$(mktemp -d)"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$ENC" -out "${TMP}/bundle.tar" \
  -pass file:/srv/cogentia/secrets/stalwart-backup.key
tar -C "$TMP" -xf "${TMP}/bundle.tar"
echo "===MANIFEST==="
cat "${TMP}/MANIFEST.txt"
echo "===payload==="
ls -la "${TMP}/payload"
rm -rf "$TMP"
stat -c '%n %a %U:%G' /var/backups/stalwart /srv/cogentia/secrets/stalwart-backup.key "$ENC"
systemctl is-active stalwart
for p in 25 465 587 993 8080; do
  if timeout 2 bash -c "echo >/dev/tcp/82.70.234.207/${p}" 2>/dev/null; then
    echo "PUBLIC_${p}=OPEN"
  else
    echo "PUBLIC_${p}=closed"
  fi
done
