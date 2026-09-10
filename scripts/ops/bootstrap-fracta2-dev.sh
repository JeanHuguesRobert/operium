#!/usr/bin/env bash
# Fracta2 development baseline. Run as ubuntu; sudo is used only for apt.
# Authority and observed results: docs/fracta2-development.md
set -euo pipefail
[[ $(hostname) == fracta2 ]] || { echo 'Expected host fracta2' >&2; exit 1; }
[[ $(id -u) != 0 ]] || { echo 'Run as the development user, not root' >&2; exit 1; }
[[ $(uname -m) == aarch64 ]] || { echo 'Expected the audited ARM64 host' >&2; exit 1; }
sudo -n true
export DEBIAN_FRONTEND=noninteractive
# Report restart needs without automatically restarting live services.
sudo -n env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get update
sudo -n env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get install -y --no-install-recommends --no-upgrade \
  build-essential cmake pkg-config python3-venv python3-pip ripgrep jq unzip rsync gh
mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
npm config set prefix "$HOME/.local" --location=user
# Official npm packages; user-owned installation, pinned for this baseline.
npm install --global --prefix "$HOME/.local" --no-audit --no-fund \
  @openai/codex@0.154.0 @anthropic-ai/claude-code@2.1.268 deno@2.9.6 pnpm@10.28.2
# Existing repositories, branches, credentials and services are not modified.
repos_root=/srv/cogentia/repos
mkdir -p "$repos_root" /srv/cogentia/work
for repo in cogentia inseme Inox; do
  if [[ -e "$repos_root/$repo" ]]; then
    echo "Preserving existing checkout: $repo"
  else
    GIT_TERMINAL_PROMPT=0 git clone "https://github.com/JeanHuguesRobert/$repo.git" "$repos_root/$repo"
  fi
done
for tool in gcc g++ make cmake python3 rg jq gh node npm deno pnpm codex claude; do
  command -v "$tool"
done
codex --version
claude --version
deno --version
pnpm --version
