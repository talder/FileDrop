#!/usr/bin/env bash
# ==============================================================
#  FileDrop — macOS installer  (Apple Silicon & Intel)
#  Repo: https://github.com/talder/FileDrop
#
#  Usage: bash install-mac.sh [OPTIONS]
#
#  Options:
#    --upgrade        Pull latest from GitHub & reinstall deps
#    --force          Override Node.js version conflict
#    --no-ssl         Disable SSL verification (corporate proxy)
#    --service        Install as launchd service (auto-start at boot)
#    --check          Preflight checks only — do not install
#    --dir <path>     Override install directory (default: /opt/filedrop)
#    --help           Show this help
# ==============================================================
set -euo pipefail

# ── Constants ──────────────────────────────────────────────────
REPO="https://github.com/talder/FileDrop.git"
REQUIRED_NODE=24
DEFAULT_DIR="/opt/filedrop"
SERVICE_LABEL="com.talder.filedrop"
SERVICE_PLIST="/Library/LaunchDaemons/${SERVICE_LABEL}.plist"
LOG_DIR="/var/log/filedrop"

# ── Colours ────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' BOLD='\033[1m' NC='\033[0m'

# ── Flags ──────────────────────────────────────────────────────
UPGRADE=false; FORCE=false; NO_SSL=false; SERVICE=false; CHECK_ONLY=false
INSTALL_DIR="$DEFAULT_DIR"

# ── Arg parsing ────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --upgrade)  UPGRADE=true ;;
    --force)    FORCE=true ;;
    --no-ssl)   NO_SSL=true ;;
    --service)  SERVICE=true ;;
    --check)    CHECK_ONLY=true ;;
    --dir)      shift; INSTALL_DIR="${1:?--dir requires a path}" ;;
    --help|-h)  grep '^#' "$0" | grep -v '!/usr/bin' | sed 's/^# \{0,1\}//' | head -20; exit 0 ;;
    *)          echo -e "${R}Unknown option: $1  (use --help)${NC}" >&2; exit 1 ;;
  esac; shift
done

# ── Helpers ────────────────────────────────────────────────────
info() { echo -e "${G}[filedrop]${NC} $*"; }
warn() { echo -e "${Y}[filedrop] ⚠${NC}  $*"; }
die()  { echo -e "${R}[filedrop] ✗${NC}  $*" >&2; exit 1; }
ok()   { echo -e "  ${G}✓${NC}  $*"; }
fail() { echo -e "  ${R}✗${NC}  $*"; CHECKS_OK=false; }
note() { echo -e "  ${Y}!${NC}  $*"; }

curl_opts() { $NO_SSL && echo "-k" || echo ""; }
curl_reachable() {
  local code
  code=$(curl -s --max-time 10 --head $(curl_opts) -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || echo "000")
  [[ "$code" =~ ^[23] ]]
}

node_major() { command -v node &>/dev/null && node -v | sed 's/v//' | cut -d. -f1 || echo 0; }

# ── Banner ─────────────────────────────────────────────────────
echo ""
echo -e "${B}  ███████╗██╗██╗     ███████╗██████╗ ██████╗  ██████╗ ██████╗ ${NC}"
echo -e "${B}  ██╔════╝██║██║     ██╔════╝██╔══██╗██╔══██╗██╔═══██╗██╔══██╗${NC}"
echo -e "${B}  █████╗  ██║██║     █████╗  ██║  ██║██████╔╝██║   ██║██████╔╝${NC}"
echo -e "${B}  ██╔══╝  ██║██║     ██╔══╝  ██║  ██║██╔══██╗██║   ██║██╔═══╝ ${NC}"
echo -e "${B}  ██║     ██║███████╗███████╗██████╔╝██║  ██║╚██████╔╝██║     ${NC}"
echo -e "${B}  ╚═╝     ╚═╝╚══════╝╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ${NC}"
echo ""
echo -e "${BOLD}  macOS Installer${NC}  ·  Node.js ${REQUIRED_NODE}+  ·  https://github.com/talder/FileDrop"
$NO_SSL  && warn "SSL verification DISABLED (--no-ssl)"
$FORCE   && warn "Node.js conflict override ENABLED (--force)"
$UPGRADE && info "Mode: UPGRADE existing installation"
echo ""

# ── Preflight checks ───────────────────────────────────────────
CHECKS_OK=true
echo -e "${BOLD}  Preflight Checks${NC}"
echo "  ──────────────────────────────────────────────────────"

ok "macOS $(sw_vers -productVersion)  [$(uname -m)]"

if sudo -n true 2>/dev/null || sudo -v 2>/dev/null; then
  ok "sudo available"
else
  fail "sudo required (needed to write to /opt and /Library)"
fi

if command -v git &>/dev/null; then
  ok "git $(git --version | awk '{print $3}')"
else
  note "git not found — will install via Homebrew"
fi

CURRENT_NODE=$(node_major)
if [[ "$CURRENT_NODE" -ge "$REQUIRED_NODE" ]]; then
  ok "Node.js $(node -v)  (>= v${REQUIRED_NODE} required)"
elif [[ "$CURRENT_NODE" -gt 0 ]]; then
  if $FORCE; then
    note "Node.js v${CURRENT_NODE}.x installed — will upgrade to v${REQUIRED_NODE} (--force active)"
  else
    fail "Node.js v${CURRENT_NODE}.x installed but v${REQUIRED_NODE}+ required"
    echo ""
    echo -e "  ${Y}  Another Node.js version is already installed.${NC}"
    echo -e "  ${Y}  To replace it, re-run with ${BOLD}--force${NC}${Y}:${NC}"
    echo -e "  ${BOLD}    bash install-mac.sh --force${NC}"
    echo ""
  fi
else
  note "Node.js not installed — will install v${REQUIRED_NODE}"
fi

if curl_reachable "https://github.com"; then
  ok "Network: github.com reachable"
else
  fail "Cannot reach github.com — check internet connection"
fi

GIT_SSL=$( $NO_SSL && echo "-c http.sslVerify=false" || echo "" )
if git $GIT_SSL ls-remote --exit-code "$REPO" HEAD &>/dev/null 2>&1; then
  ok "GitHub repo reachable: github.com/talder/FileDrop"
else
  fail "GitHub repo unreachable: $REPO"
fi

if curl_reachable "https://registry.npmjs.org"; then
  ok "npm registry reachable"
else
  fail "npm registry unreachable — check connection or use --no-ssl"
fi

PARENT="$(dirname "$INSTALL_DIR")"; [[ -d "$PARENT" ]] || PARENT="/"
FREE_MB=$(( $(df -k "$PARENT" | awk 'NR==2{print $4}') / 1024 ))
if [[ "$FREE_MB" -ge 500 ]]; then
  ok "Disk space: ${FREE_MB} MB free"
else
  fail "Disk space: only ${FREE_MB} MB free in $PARENT (500 MB needed)"
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  note "Install dir $INSTALL_DIR already exists (git repo)"
elif [[ -d "$INSTALL_DIR" ]]; then
  note "Install dir $INSTALL_DIR exists but is NOT a git repo"
else
  ok "Install dir $INSTALL_DIR will be created"
fi

echo "  ──────────────────────────────────────────────────────"
if $CHECKS_OK; then
  echo -e "  ${G}${BOLD}All checks passed.${NC}"
else
  echo -e "  ${R}${BOLD}Some checks failed — see above.${NC}"
fi
echo ""
$CHECK_ONLY && exit $( $CHECKS_OK && echo 0 || echo 1 )
$CHECKS_OK  || die "Fix the issues above then re-run."

# ── 1. Homebrew ────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  info "Installing Homebrew..."
  HFLAG=$( $NO_SSL && echo "-fsSLk" || echo "-fsSL" )
  /bin/bash -c "$(curl $HFLAG https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  [[ "$(uname -m)" == "arm64" ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
  BREW_INIT='eval "$(/opt/homebrew/bin/brew shellenv)"'
  for rc in ~/.zprofile ~/.bash_profile; do
    grep -qxF "$BREW_INIT" "$rc" 2>/dev/null || echo "$BREW_INIT" >> "$rc"
  done
else
  info "Homebrew $(brew --version | head -1) — OK"
fi

# ── 2. git ─────────────────────────────────────────────────────
command -v git &>/dev/null || { info "Installing git..."; brew install git; }

# ── 3. Node.js ─────────────────────────────────────────────────
CURRENT_NODE=$(node_major)
if [[ "$CURRENT_NODE" -lt "$REQUIRED_NODE" ]]; then
  info "Installing Node.js ${REQUIRED_NODE} via Homebrew..."
  brew install "node@${REQUIRED_NODE}" 2>/dev/null || brew upgrade "node@${REQUIRED_NODE}" 2>/dev/null || true
  brew link --overwrite --force "node@${REQUIRED_NODE}" 2>/dev/null || true
  NODE_BIN="$(brew --prefix)/opt/node@${REQUIRED_NODE}/bin"
  export PATH="$NODE_BIN:$PATH"
  for rc in ~/.zshrc ~/.zprofile ~/.bashrc; do
    [[ -f "$rc" ]] && grep -qF "node@${REQUIRED_NODE}" "$rc" 2>/dev/null || echo "export PATH=\"$NODE_BIN:\$PATH\"" >> "$rc"
  done
fi
info "Node.js $(node -v) · npm $(npm -v)"

# ── 4. Clone or upgrade ────────────────────────────────────────
if $UPGRADE; then
  [[ -d "$INSTALL_DIR/.git" ]] || die "--upgrade: $INSTALL_DIR is not a git repo. Run without --upgrade to install first."
  info "Stopping service before upgrade (if running)..."
  sudo launchctl unload "$SERVICE_PLIST" 2>/dev/null || true

  info "Creating pre-upgrade data snapshot..."
  SNAP_TS=$(date -u +"%Y-%m-%dT%H-%M-%S")
  SNAP_DIR="$INSTALL_DIR/snapshots/${SNAP_TS}_pre-upgrade"
  mkdir -p "$SNAP_DIR"
  for _src in config logs; do
    [[ -d "$INSTALL_DIR/$_src" ]] || continue
    cp -R "$INSTALL_DIR/$_src" "$SNAP_DIR/$_src"
  done
  ok "Snapshot saved to snapshots/${SNAP_TS}_pre-upgrade"
  SNAP_COUNT=$(ls -1d "$INSTALL_DIR/snapshots/"*/ 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$SNAP_COUNT" -gt 5 ]]; then
    ls -1d "$INSTALL_DIR/snapshots/"*/ | head -n $(( SNAP_COUNT - 5 )) | while read -r old; do
      rm -rf "$old"
    done
  fi

  info "Pulling latest from GitHub..."
  git $GIT_SSL -C "$INSTALL_DIR" pull --rebase origin main
else
  if [[ -d "$INSTALL_DIR" && -f "$INSTALL_DIR/package.json" ]]; then
    die "$INSTALL_DIR already contains an installation. Use --upgrade to update it, or --dir to pick another path."
  fi
  info "Cloning https://github.com/talder/FileDrop → $INSTALL_DIR ..."
  sudo mkdir -p "$INSTALL_DIR"
  sudo chown "$(whoami)" "$INSTALL_DIR"
  git $GIT_SSL clone "$REPO" "$INSTALL_DIR"
fi

# ── 5. Dependencies & build ────────────────────────────────────
cd "$INSTALL_DIR"
info "Installing npm dependencies..."
npm install $( $NO_SSL && echo "--strict-ssl=false" || echo "" )
info "Building production bundle..."
npm run build

# ── 6. Service (launchd) ───────────────────────────────────
if $SERVICE; then
  info "Configuring launchd service: $SERVICE_LABEL ..."
  NPM_PATH="$(command -v npm || which npm 2>/dev/null || echo /usr/local/bin/npm)"
  NODE_PATH="$(command -v node || which node 2>/dev/null || echo /usr/local/bin/node)"
  SERVICE_RUN_USER="$(whoami)"
  SERVICE_RUN_GROUP="$(id -gn)"

  for dir in config logs; do
    mkdir -p "$INSTALL_DIR/$dir"
  done

  sudo mkdir -p "$LOG_DIR"
  sudo chown "$SERVICE_RUN_USER" "$LOG_DIR"
  sudo tee "$SERVICE_PLIST" > /dev/null <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key>             <string>${SERVICE_LABEL}</string>
  <key>UserName</key>          <string>${SERVICE_RUN_USER}</string>
  <key>GroupName</key>         <string>${SERVICE_RUN_GROUP}</string>
  <key>ProgramArguments</key>  <array>
    <string>${NPM_PATH}</string><string>start</string>
  </array>
  <key>WorkingDirectory</key>  <string>${INSTALL_DIR}</string>
  <key>EnvironmentVariables</key><dict>
    <key>NODE_ENV</key>        <string>production</string>
    <key>PORT</key>            <string>3000</string>
    <key>PATH</key>            <string>$(dirname "$NODE_PATH"):/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>${LOG_DIR}/stdout.log</string>
  <key>StandardErrorPath</key> <string>${LOG_DIR}/stderr.log</string>
</dict></plist>
PLIST
  sudo launchctl unload "$SERVICE_PLIST" 2>/dev/null || true
  sudo launchctl load -w "$SERVICE_PLIST"
  info "Service started (running as $SERVICE_RUN_USER). Logs: $LOG_DIR"
fi

# ── Done ───────────────────────────────────────────────────────
echo ""
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${G}  $( $UPGRADE && echo "Upgrade" || echo "Installation" ) complete!${NC}"
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Directory   : $INSTALL_DIR"
echo "  Node.js     : $(node -v)"
echo "  npm         : $(npm -v)"
echo ""
if $SERVICE; then
  echo "  Service     : $SERVICE_LABEL (auto-start at boot)"
  echo "  Logs        : $LOG_DIR"
  echo "  Start       : sudo launchctl start $SERVICE_LABEL"
  echo "  Stop        : sudo launchctl stop  $SERVICE_LABEL"
  echo "  Status      : sudo launchctl list | grep filedrop"
else
  echo "  Start dev   : cd $INSTALL_DIR && npm run dev"
  echo "  Start prod  : cd $INSTALL_DIR && npm start"
fi
echo ""
echo "  Open        : http://localhost:3000"
echo "  First run   : /setup  (create admin account)"
echo ""
echo "  Upgrade     : bash $0 --upgrade"
echo ""
