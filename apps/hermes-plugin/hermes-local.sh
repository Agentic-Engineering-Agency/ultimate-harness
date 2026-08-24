#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"
HERMES_BIN="${HERMES_BIN:-hermes}"
PLUGIN_LINK="${HERMES_HOME}/plugins/uh"
THEME_SOURCE="${PLUGIN_ROOT}/theme/ultimate-harness.yaml"
THEME_LINK="${HERMES_HOME}/dashboard-themes/ultimate-harness.yaml"

export PATH="${HOME}/.local/bin:${PATH}"
export UH_CLI_BIN="${UH_CLI_BIN:-uh}"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

link_matches() {
  local link_path="$1"
  local target_path="$2"
  [[ -L "${link_path}" && "$(readlink "${link_path}")" == "${target_path}" ]]
}

install_link() {
  local target_path="$1"
  local link_path="$2"

  mkdir -p "$(dirname "${link_path}")"
  if link_matches "${link_path}" "${target_path}"; then
    return
  fi
  if [[ -e "${link_path}" || -L "${link_path}" ]]; then
    die "refusing to replace existing path: ${link_path}"
  fi
  ln -s "${target_path}" "${link_path}"
}

install_plugin() {
  install_link "${PLUGIN_ROOT}" "${PLUGIN_LINK}"
  install_link "${THEME_SOURCE}" "${THEME_LINK}"
  printf 'linked plugin: %s -> %s\n' "${PLUGIN_LINK}" "${PLUGIN_ROOT}"
  printf 'linked theme: %s -> %s\n' "${THEME_LINK}" "${THEME_SOURCE}"
}

assert_owned_or_absent() {
  local link_path="$1"
  local target_path="$2"
  if [[ -e "${link_path}" || -L "${link_path}" ]]; then
    link_matches "${link_path}" "${target_path}" || \
      die "refusing to remove path not owned by this package: ${link_path}"
  fi
}

rollback_plugin() {
  assert_owned_or_absent "${PLUGIN_LINK}" "${PLUGIN_ROOT}"
  assert_owned_or_absent "${THEME_LINK}" "${THEME_SOURCE}"
  "${HERMES_BIN}" plugins disable uh
  [[ ! -L "${PLUGIN_LINK}" ]] || unlink "${PLUGIN_LINK}"
  [[ ! -L "${THEME_LINK}" ]] || unlink "${THEME_LINK}"
  printf 'disabled uh and removed package-owned links\n'
}

start_dashboard() {
  [[ -n "${UH_PROJECT_ROOT:-}" ]] || \
    die 'UH_PROJECT_ROOT must be set to an existing Ultimate Harness project'
  [[ -d "${UH_PROJECT_ROOT}/.harness" ]] || \
    die "UH_PROJECT_ROOT has no .harness directory: ${UH_PROJECT_ROOT}"
  UH_PROJECT_ROOT="$(cd -- "${UH_PROJECT_ROOT}" && pwd -P)"
  export UH_PROJECT_ROOT
  exec "${HERMES_BIN}" dashboard \
    --host "${HERMES_DASHBOARD_HOST:-127.0.0.1}" \
    --port "${HERMES_DASHBOARD_PORT:-9119}" \
    --no-open
}

usage() {
  cat <<'EOF'
Usage: apps/hermes-plugin/hermes-local.sh ACTION

Actions:
  install   Link the complete plugin package and matching theme.
  enable    Install, then enable uh without tool-override authority.
  disable   Disable uh while keeping the local links installed.
  start     Start Hermes Dashboard in the foreground; requires UH_PROJECT_ROOT.
  status    Show Hermes Dashboard process status and local link state.
  rollback  Disable uh and remove only links owned by this package.
EOF
}

case "${1:-}" in
  install)
    install_plugin
    ;;
  enable)
    install_plugin
    "${HERMES_BIN}" plugins enable uh --no-allow-tool-override
    ;;
  disable)
    "${HERMES_BIN}" plugins disable uh
    ;;
  start)
    start_dashboard
    ;;
  status)
    "${HERMES_BIN}" dashboard --status
    if link_matches "${PLUGIN_LINK}" "${PLUGIN_ROOT}"; then
      printf 'uh package link: installed (%s)\n' "${PLUGIN_ROOT}"
    else
      printf 'uh package link: absent or unmanaged\n'
    fi
    printf 'UH_PROJECT_ROOT: %s\n' "${UH_PROJECT_ROOT:-not set in this shell}"
    ;;
  rollback)
    rollback_plugin
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
