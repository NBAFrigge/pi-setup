#!/usr/bin/env bash
#
# pi-setup installer
# ------------------
# Deploys this repo's pi configuration into ~/.pi/agent, installs the pi CLI
# if missing, and installs every pi package declared in settings.json.
#
# Usage:
#   ./install.sh                 # deploy into ~/.pi/agent
#   PI_AGENT_DIR=/path ./install.sh
#   ./install.sh --dry-run       # show what would happen, change nothing
#   ./install.sh --no-packages   # skip pi package installation
#
# It is safe to re-run: existing config is backed up before being overwritten,
# and secrets / sessions / caches (auth.json, models-store.json, sessions/,
# missions/, npm/node_modules, ...) are never touched.

set -euo pipefail

# --- resolve paths --------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_DIR="$SCRIPT_DIR"
PI_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"

# --- flags ----------------------------------------------------------------
DRY_RUN=0
INSTALL_PACKAGES=1
for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=1 ;;
    --no-packages) INSTALL_PACKAGES=0 ;;
    -h|--help)     sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# --- pretty output --------------------------------------------------------
if [ -t 1 ]; then
  C_BLUE=$'\033[1;34m'; C_YELLOW=$'\033[1;33m'; C_RED=$'\033[1;31m'
  C_GREEN=$'\033[1;32m'; C_RESET=$'\033[0m'
else
  C_BLUE=""; C_YELLOW=""; C_RED=""; C_GREEN=""; C_RESET=""
fi
log()  { printf '%s==>%s %s\n'  "$C_BLUE"   "$C_RESET" "$*"; }
ok()   { printf '%s ok %s %s\n' "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf '%sWARN%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()  { printf '%sERR %s %s\n' "$C_RED"    "$C_RESET" "$*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then printf '  [dry-run] %s\n' "$*"; else eval "$@"; fi; }

# --- config file set (tracked config that gets deployed) ------------------
# Everything else in ~/.pi/agent (auth.json, sessions/, models-store.json,
# npm/node_modules, ...) is intentionally left untouched.
ITEMS=(
  config.yml
  settings.json
  mcp.json
  web-search.json
  AGENTS.md
  agents
  prompts
  extensions
)

# --- 1. prerequisites -----------------------------------------------------
log "Checking prerequisites"
command -v git  >/dev/null 2>&1 || die "git not found — install git first."
command -v node >/dev/null 2>&1 || die "node not found — install Node.js (>=20) first."
command -v npm  >/dev/null 2>&1 || die "npm not found — install npm first."
ok "git $(git --version | awk '{print $3}'), node $(node --version), npm $(npm --version)"

# --- 2. pi CLI ------------------------------------------------------------
if command -v pi >/dev/null 2>&1; then
  ok "pi already installed ($(pi --version 2>/dev/null || echo '?'))"
else
  log "Installing pi CLI (npm -g @earendil-works/pi-coding-agent)"
  run "npm install -g --ignore-scripts @earendil-works/pi-coding-agent"
  if [ "$DRY_RUN" = 0 ]; then
    command -v pi >/dev/null 2>&1 || die "pi still not on PATH after install — check your npm global bin dir."
    ok "pi installed ($(pi --version 2>/dev/null || echo '?'))"
  fi
fi

# --- 3. back up any existing config we are about to overwrite -------------
log "Preparing target: $PI_DIR"
run "mkdir -p '$PI_DIR'"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$PI_DIR/.setup-backup-$STAMP"
need_backup=0
for it in "${ITEMS[@]}"; do [ -e "$PI_DIR/$it" ] && need_backup=1; done
if [ "$need_backup" = 1 ]; then
  log "Backing up existing config -> $BACKUP"
  run "mkdir -p '$BACKUP'"
  for it in "${ITEMS[@]}"; do
    [ -e "$PI_DIR/$it" ] && run "cp -a '$PI_DIR/$it' '$BACKUP/'"
  done
  ok "backup created (restore by copying it back if needed)"
else
  ok "no existing config to back up (fresh install)"
fi

# --- 4. deploy tracked config --------------------------------------------
log "Deploying config files"
for it in "${ITEMS[@]}"; do
  src="$REPO_DIR/$it"
  dst="$PI_DIR/$it"
  [ -e "$src" ] || { warn "missing in repo, skipping: $it"; continue; }
  if [ -d "$src" ]; then
    run "mkdir -p '$dst'"
    run "cp -a '$src/.' '$dst/'"
  else
    run "cp -a '$src' '$dst'"
  fi
  printf '  + %s\n' "$it"
done
# managed dirs pi expects to exist
run "mkdir -p '$PI_DIR/npm' '$PI_DIR/git'"
[ -f "$REPO_DIR/npm/.gitignore" ] && run "cp -a '$REPO_DIR/npm/.gitignore' '$PI_DIR/npm/.gitignore'"
[ -f "$REPO_DIR/git/.gitignore" ] && run "cp -a '$REPO_DIR/git/.gitignore' '$PI_DIR/git/.gitignore'"
ok "config deployed"

# --- 5. install pi packages from settings.json ----------------------------
if [ "$INSTALL_PACKAGES" = 1 ]; then
  log "Installing pi packages declared in settings.json"
  # Parse the npm: package specs straight out of the deployed settings.json.
  PKGS=()
  if [ "$DRY_RUN" = 1 ]; then
    settings_src="$REPO_DIR/settings.json"
  else
    settings_src="$PI_DIR/settings.json"
  fi
  while IFS= read -r line; do
    [ -n "$line" ] && PKGS+=("$line")
  done < <(node -e '
    const fs = require("fs");
    const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    for (const p of (s.packages || [])) if (String(p).startsWith("npm:")) console.log(p);
  ' "$settings_src")

  if [ "${#PKGS[@]}" -eq 0 ]; then
    warn "no npm: packages found in settings.json"
  else
    for p in "${PKGS[@]}"; do
      log "  pi install $p"
      run "pi install '$p'" || warn "failed to install $p (continuing)"
    done
    ok "packages installed (${#PKGS[@]} declared)"
  fi
else
  warn "skipping package installation (--no-packages)"
fi

# --- 6. done --------------------------------------------------------------
echo
ok "pi-setup complete."
cat <<EOF

Next steps:
  1. Run 'pi' in a project directory.
  2. Sign in when prompted — this regenerates auth.json and the model catalog
     (models-store.json), which are intentionally NOT stored in this repo.

Config lives at: $PI_DIR
$( [ "$need_backup" = 1 ] && echo "Previous config backed up at: $BACKUP" )
EOF
