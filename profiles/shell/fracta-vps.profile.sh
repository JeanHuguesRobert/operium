# shellcheck shell=bash
# Operium-managed interactive bash profile for the Fracta public VPS.
#
# profile_id: shell.fracta-vps.v1
# Owner: Operium — see docs/workstation-shell-profile.md (multi-node shell entry)
#
# Interactive only. systemd units (magistral, cogentia, mcp-cogentia) must NOT
# source this file; they use EnvironmentFile= under /etc/cogentia/.
#
# Install: profiles/shell/install-fracta-vps-shell-profile.sh
#   or:    source this file from ~/.bashrc (guarded block)

# Idempotent
if [ "${FRACTA_WORKSPACE_PROFILE_LOADED:-}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi
export FRACTA_WORKSPACE_PROFILE_LOADED=1

# --- Roots observed on fracta (2026-07) ---
export CORPUS_REPOS="${CORPUS_REPOS:-/srv/cogentia/repos}"
export COGENTIA_ROOT="${COGENTIA_ROOT:-$CORPUS_REPOS/cogentia}"
export OPERIUM_ROOT="${OPERIUM_ROOT:-$CORPUS_REPOS/operium}"
export INSEME_ROOT="${INSEME_ROOT:-$CORPUS_REPOS/inseme}"
export FRACTA_SECRETS="${FRACTA_SECRETS:-/etc/cogentia}"
export FRACTA_WORK="${FRACTA_WORK:-/srv/cogentia/work}"

# --- Corpus registry (same authority as workstation, different path) ---
# Full registry lives in the JeanHuguesRobert checkout on the VPS.
_jhr="$CORPUS_REPOS/JeanHuguesRobert"
if [ -f "$_jhr/.cogentia.json" ]; then
  export COGENTIA_REGISTRY="${COGENTIA_REGISTRY:-$_jhr}"
fi
unset _jhr

# User-local node bins (codex, claude, etc. when installed under ~/.local)
if [ -d "$HOME/.local/bin" ]; then
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) export PATH="$HOME/.local/bin:$PATH" ;;
  esac
fi

# --- Helpers ---
tweesic() {
  # On fracta the monorepo root is CORPUS_REPOS (not C:\tweesic)
  local sub="${1:-}"
  if [ -n "$sub" ]; then
    cd "$CORPUS_REPOS/$sub" || return 1
  else
    cd "$CORPUS_REPOS" || return 1
  fi
}

operium() {
  local bin="$OPERIUM_ROOT/bin/operium.js"
  if [ ! -f "$bin" ]; then
    echo "operium not found at $bin" >&2
    return 1
  fi
  node "$bin" "$@"
}

cogentia() {
  local bin="$COGENTIA_ROOT/scripts/cogentia.js"
  if [ ! -f "$bin" ]; then
    echo "cogentia.js not found at $bin" >&2
    return 1
  fi
  node "$bin" "$@"
}

# Claude Code mode shortcuts. They update the per-user Claude settings; start
# a new `claude` process afterwards so it reads the selected backend.
_operium_claude_mode() {
  local bin="$OPERIUM_ROOT/scripts/ops/claude-mode.js"
  if [ ! -f "$bin" ]; then
    echo "claude-mode not found at $bin" >&2
    return 1
  fi
  node "$bin" "$@"
}

claude-pro() {
  _operium_claude_mode pro "$@"
}

claude-zai() {
  _operium_claude_mode zai "$@"
}

# Optional: land in corpus repos on interactive login (not for scp/sftp non-interactive)
if [ -n "${PS1:-}" ] && [ -d "$CORPUS_REPOS" ]; then
  case "${PWD:-}" in
    /home/*|/root) cd "$CORPUS_REPOS" 2>/dev/null || true ;;
  esac
fi

# Lightweight prompt mark
if [ -n "${PS1:-}" ] && [ "${FRACTA_PROMPT_HOOKED:-}" != "1" ]; then
  export FRACTA_PROMPT_HOOKED=1
  _fracta_old_ps1="${PS1:-}"
  # shellcheck disable=SC2016
  PS1='\[\e[0;36m\][fracta|reg]\[\e[0m\] '"${PS1:-\\u@\\h:\\w\\$ }"
fi

if [ -n "${PS1:-}" ]; then
  echo "Operium fracta profile loaded (COGENTIA_REGISTRY=${COGENTIA_REGISTRY:-unset})" >&2
fi
