#!/usr/bin/env bash
set -euo pipefail

# User-space coding checkout for a Hosted Browser Unix account.
# Does not copy C:\tweesic, does not grant sudo, does not copy secrets.

usage() {
  cat <<'EOF'
Usage:
  bootstrap-hosted-dev-workspace.sh --unix hosted-NAME
    [--repo cogentia] [--with-install] [--dry-run]

Creates ~/src/<repo> as that user (git clone, no Windows tree), a loopback
dev env (CDP_ENDPOINT=http://127.0.0.1:9223), and a user npm prefix.
--with-install runs a lightweight npm install sufficient for
`pnpm navigation-assistant` / `node scripts/ops/navigation-assistant-tui.js`.
EOF
}

unix_user=''
repo='cogentia'
with_install=false
dry_run=false

while (($#)); do
  case "$1" in
    --unix) unix_user="${2:-}"; shift 2 ;;
    --repo) repo="${2:-}"; shift 2 ;;
    --with-install) with_install=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [[ -z "$unix_user" || ! "$unix_user" =~ ^hosted-[a-z0-9]+$ ]]; then
  echo "--unix must look like hosted-<key>" >&2
  exit 64
fi

case "$repo" in
  cogentia) remote='https://github.com/JeanHuguesRobert/cogentia.git' ;;
  operium) remote='https://github.com/JeanHuguesRobert/operium.git' ;;
  *) echo "--repo must be cogentia or operium" >&2; exit 64 ;;
esac

home_dir="/home/${unix_user}"
src_dir="${home_dir}/src"
repo_dir="${src_dir}/${repo}"
env_file="${home_dir}/.config/hosted-dev/env"
profile_snip="${home_dir}/.config/hosted-dev/profile.sh"

plan() { printf '[plan] %s\n' "$*"; }

if "$dry_run"; then
  plan "mkdir ${src_dir} owned by ${unix_user}"
  plan "git clone --filter=blob:none ${remote} ${repo_dir} (skip if exists)"
  plan "write ${env_file} CDP_ENDPOINT=http://127.0.0.1:9223 NAV_ASSIST_PORT=8765"
  plan "user npm prefix ${home_dir}/.npm-global"
  plan "source ${profile_snip} from ${home_dir}/.profile"
  "$with_install" && plan "npm install --omit=dev --ignore-scripts in ${repo_dir}"
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root (for example: sudo $0 ...)" >&2
  exit 77
fi
if ! id -u "$unix_user" >/dev/null 2>&1; then
  echo "no such user: ${unix_user}" >&2
  exit 78
fi

as_user() {
  runuser -u "$unix_user" -- env HOME="$home_dir" "$@"
}

install -d -o "$unix_user" -g "$unix_user" -m 0755 "$src_dir" \
  "${home_dir}/.config/hosted-dev" \
  "${home_dir}/.npm-global"
if [[ ! -d "${repo_dir}/.git" ]]; then
  as_user git clone --filter=blob:none "$remote" "$repo_dir"
else
  printf 'already cloned: %s\n' "$repo_dir"
fi

if [[ -z "$(as_user git config --global --get user.email || true)" ]]; then
  as_user git config --global user.name "Jean Hugues Noël Robert"
  as_user git config --global user.email "jeanhuguesrobert@gmail.com"
fi

cat > "$env_file" <<'EOF'
# Loopback only. Hosted Brave CDP is display :1 → 9223.
# The unpacked extension owns the current tab; skip Node CDP attach.
CDP_ENDPOINT=http://127.0.0.1:9223
NAV_ASSIST_PORT=8765
NAV_ASSIST_SKIP_CDP=1
EOF
cat > "$profile_snip" <<EOF
export NPM_CONFIG_PREFIX="\${HOME}/.npm-global"
export PATH="\${HOME}/.npm-global/bin:\${PATH}"
if [ -f "\${HOME}/.config/hosted-dev/env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "\${HOME}/.config/hosted-dev/env"
  set +a
fi
EOF
chown "$unix_user:$unix_user" "$env_file" "$profile_snip"
chmod 0644 "$env_file" "$profile_snip"

hook_profile() {
  local file="$1"
  touch "$file"
  chown "$unix_user:$unix_user" "$file"
  if ! grep -q 'hosted-dev/profile.sh' "$file" 2>/dev/null; then
    printf '\n# hosted-dev workspace\n[ -f "$HOME/.config/hosted-dev/profile.sh" ] && . "$HOME/.config/hosted-dev/profile.sh"\n' >> "$file"
  fi
}
hook_profile "${home_dir}/.profile"
hook_profile "${home_dir}/.bashrc"

as_user npm config set prefix "${home_dir}/.npm-global"

if "$with_install" && [[ "$repo" == cogentia ]]; then
  as_user bash -lc "cd '${repo_dir}' && npm install --omit=dev --ignore-scripts"
fi

printf 'Hosted dev workspace: %s user=%s CDP_ENDPOINT=http://127.0.0.1:9223\n' \
  "$repo_dir" "$unix_user"
