# shellcheck shell=bash
# Operium-managed interactive bash profile for Termux / phone nodes (draft).
#
# profile_id: shell.termux-android.v1
# Status: scaffold for Cogentia Digital Twin / Agent JHN deployments — install
# path will be wired when the first phone instance is provisioned.
#
# Expected layout (to be confirmed per device):
#   $HOME/fractanet/ or $HOME/cogentia-repos/
#   ONA + agent-gateway heartbeat under ~/.cogentia/
#
# Do not treat this as production until install-termux-shell-profile.sh exists
# and tools.termux-android.v1.yaml references it.

if [ "${TERMUX_WORKSPACE_PROFILE_LOADED:-}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi
export TERMUX_WORKSPACE_PROFILE_LOADED=1

export FRACTANET_HOME="${FRACTANET_HOME:-$HOME/fractanet}"
export COGENTIA_ROOT="${COGENTIA_ROOT:-$FRACTANET_HOME/repos/cogentia}"
export OPERIUM_ROOT="${OPERIUM_ROOT:-$FRACTANET_HOME/repos/operium}"

# Registry: on phone instances prefer a slim twin-local registry or a pull of
# JeanHuguesRobert; override with COGENTIA_REGISTRY in instance secrets.
if [ -z "${COGENTIA_REGISTRY:-}" ] && [ -f "$FRACTANET_HOME/repos/JeanHuguesRobert/.cogentia.json" ]; then
  export COGENTIA_REGISTRY="$FRACTANET_HOME/repos/JeanHuguesRobert"
fi

if [ -d "$HOME/.local/bin" ]; then
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) export PATH="$HOME/.local/bin:$PATH" ;;
  esac
fi
# Termux prefix bin
if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ]; then
  case ":$PATH:" in
    *":$PREFIX/bin:"*) ;;
    *) export PATH="$PREFIX/bin:$PATH" ;;
  esac
fi

if [ -n "${PS1:-}" ]; then
  echo "Operium termux profile loaded (draft; Agent JHN path) REG=${COGENTIA_REGISTRY:-unset}" >&2
fi
