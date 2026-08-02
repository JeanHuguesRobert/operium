# shellcheck shell=bash
# Operium-managed interactive bash profile for Termux / phone nodes.
#
# profile_id: shell.termux-android.v1
# Owner: Operium — see docs/workstation-shell-profile.md
#
# First production target: poco-jhr (POCO X6 5G). Same node class is the
# expected host for early Cogentia Digital Twin instances (Agent JHN / John).
#
# Interactive only. ONA, agent-gateway, Termux:Boot jobs must NOT source this
# file; they use env files under ~/srv/cogentia/secrets/ or ~/.cogentia/.
#
# Install: profiles/shell/install-termux-shell-profile.sh
#   or:    source this file from ~/.bashrc (guarded block)

# Idempotent
if [ "${TERMUX_WORKSPACE_PROFILE_LOADED:-}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi
export TERMUX_WORKSPACE_PROFILE_LOADED=1

# --- Roots (observed poco-jhr 2026-07; override via env before source) ---
# Layout matches tools.termux-android.v1.yaml / fracta-coding-workspace.md
export CORPUS_REPOS="${CORPUS_REPOS:-$HOME/srv/cogentia/repos}"
export COGENTIA_ROOT="${COGENTIA_ROOT:-$CORPUS_REPOS/cogentia}"
export OPERIUM_ROOT="${OPERIUM_ROOT:-$CORPUS_REPOS/operium}"
export INSEME_ROOT="${INSEME_ROOT:-$CORPUS_REPOS/inseme}"
export TERMUX_SECRETS="${TERMUX_SECRETS:-$HOME/srv/cogentia/secrets}"
export TERMUX_WORK="${TERMUX_WORK:-$HOME/srv/cogentia/work}"
# Alias used by some docs / twin scaffolds
export FRACTANET_HOME="${FRACTANET_HOME:-$HOME/srv/cogentia}"

# --- Corpus registry (same authority as workstation/fracta, phone path) ---
# Prefer full JeanHuguesRobert checkout; never invent a partial registry at $HOME.
_jhr="$CORPUS_REPOS/JeanHuguesRobert"
if [ -z "${COGENTIA_REGISTRY:-}" ] && [ -f "$_jhr/.cogentia.json" ]; then
  export COGENTIA_REGISTRY="$_jhr"
fi
unset _jhr

# Optional instance override file (paths only — never put secret values here)
# e.g. export COGENTIA_REGISTRY=... / CORPUS_REPOS=... for a twin under another root
if [ -f "${TERMUX_SECRETS}/shell-profile.env" ]; then
  # shellcheck source=/dev/null
  . "${TERMUX_SECRETS}/shell-profile.env"
fi

# User-local bins (wrappers, grok, npm-global often already in host .bashrc PATH)
if [ -d "$HOME/.local/bin" ]; then
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) export PATH="$HOME/.local/bin:$PATH" ;;
  esac
fi
if [ -d "$HOME/.grok/bin" ]; then
  case ":$PATH:" in
    *":$HOME/.grok/bin:"*) ;;
    *) export PATH="$HOME/.grok/bin:$PATH" ;;
  esac
fi
if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ]; then
  case ":$PATH:" in
    *":$PREFIX/bin:"*) ;;
    *) export PATH="$PREFIX/bin:$PATH" ;;
  esac
fi

# --- Helpers (same names as fracta / workstation) ---
tweesic() {
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

# Land in corpus repos on interactive login when still in $HOME
if [ -n "${PS1:-}" ] && [ -d "$CORPUS_REPOS" ]; then
  case "${PWD:-}" in
    "$HOME"|"$HOME/") cd "$CORPUS_REPOS" 2>/dev/null || true ;;
  esac
fi

# Lightweight prompt mark
if [ -n "${PS1:-}" ] && [ "${TERMUX_PROMPT_HOOKED:-}" != "1" ]; then
  export TERMUX_PROMPT_HOOKED=1
  # shellcheck disable=SC2016
  PS1='\[\e[0;35m\][termux|reg]\[\e[0m\] '"${PS1:-\\u@\\h:\\w\\$ }"
fi

if [ -n "${PS1:-}" ]; then
  echo "Operium termux profile loaded (COGENTIA_REGISTRY=${COGENTIA_REGISTRY:-unset})" >&2
fi
