#!/usr/bin/env bash
set -euo pipefail

# Runs outside ONA under systemd. A stopped or wedged ONA cannot repair itself.
if /usr/bin/curl --fail --silent --show-error --max-time 8 http://127.0.0.1:8794/health >/dev/null; then
  exit 0
fi

/usr/bin/systemctl restart operium-node-agent.service
