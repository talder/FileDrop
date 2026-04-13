#!/usr/bin/env bash
# ==============================================================
#  FileDrop — Ubuntu / Debian Linux installer
#  Repo: https://github.com/talder/FileDrop
#
#  Usage: bash install-linux.sh [OPTIONS]
#
#  Options:
#    --upgrade        Pull latest from GitHub & reinstall deps
#    --force          Override Node.js version conflict
#    --no-ssl         Disable SSL verification (corporate proxy)
#    --service        Install as systemd service (auto-start at boot)
#    --check          Preflight checks only — do not install
#    --dir <path>     Override install directory (default: /opt/filedrop)
#    --help           Show this help
# ==============================================================

REQUIRED_NODE=24
DEFAULT_DIR="/opt/filedrop"
REPO="https://github.com/talder/FileDrop.git"
SERVICE_NAME="filedrop"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SERVICE_USER="filedrop"
LOG_DIR="/var/log/filedrop"

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' BOLD='\033[1m' NC='\033[0m'

UPGRADE=false; FORCE=false; NO_SSL=false; SERVICE=false; CHECK_ONLY=false
INSTALL_DIR="$DEFAULT_DIR"

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

info() { echo -e "${G}[filedrop]${NC} $*"; }
warn() { echo -e "${Y}[filedrop] ⚠${NC}  $*"; }
die()  { echo -e "${R}[filedrop] ✗${NC}  $*" >&2; exit 1; }
ok()   { echo -e "  ${G}✓${NC}  $*"; }
fail() { echo -e "  ${R}✗${NC}  $*"; CHECKS_OK=false; }
note() { echo -e "  ${Y}!${NC}  $*"; }

curl_reachable() {
  local flag; flag=$( $NO_SSL && echo "-k" || echo "" )
  local code; code=$(curl -s --max-time 10 --head $flag -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || echo "000")
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
echo -e "${BOLD}  Linux Installer${NC}  ·  Node.js ${REQUIRED_NODE}+  ·  https://github.com/talder/FileDrop"
$NO_SSL  && warn "SSL verification DISABLED (--no-ssl)"
$FORCE   && warn "Node.js conflict override ENABLED (--force)"
$UPGRADE && info "Mode: UPGRADE existing installation"
echo ""

# ── Preflight checks ───────────────────────────────────────────
CHECKS_OK=true
echo -e "${BOLD}  Preflight Checks${NC}"
echo "  ──────────────────────────────────────────────────────"

if command -v lsb_release &>/dev/null; then ok "$(lsb_release -ds 2>/dev/null)  [$(uname -m)]"
elif [[ -f /etc/os-release ]]; then ok "$(. /etc/os-release && echo "$PRETTY_NAME")  [$(uname -m)]"
else ok "Linux [$(uname -m)]"; fi

if command -v apt-get &>/dev/null; then ok "apt-get available"
else fail "apt-get not found — this script supports Ubuntu/Debian only"; fi

if [[ "$EUID" -eq 0 ]]; then ok "Running as root"
elif sudo -n true 2>/dev/null || sudo -v 2>/dev/null; then ok "sudo available"
else fail "sudo required — run as root or grant sudo access"; fi

if command -v git &>/dev/null; then ok "git $(git --version | awk '{print $3}')"
else note "git not installed — will install via apt"; fi

CURRENT_NODE=$(node_major)
if [[ "$CURRENT_NODE" -ge "$REQUIRED_NODE" ]]; then ok "Node.js $(node -v)  (>= v${REQUIRED_NODE} required)"
elif [[ "$CURRENT_NODE" -gt 0 ]]; then
  if $FORCE; then note "Node.js v${CURRENT_NODE}.x — will upgrade (--force)"
  else fail "Node.js v${CURRENT_NODE}.x installed but v${REQUIRED_NODE}+ required"; fi
else note "Node.js not installed — will install v${REQUIRED_NODE} via NodeSource"; fi

if curl_reachable "https://github.com"; then ok "Network: github.com reachable"
else fail "Cannot reach github.com"; fi

GIT_SSL=$( $NO_SSL && echo "-c http.sslVerify=false" || echo "" )
if git $GIT_SSL ls-remote --exit-code "$REPO" HEAD &>/dev/null 2>&1; then ok "GitHub repo reachable"
else fail "GitHub repo unreachable: $REPO"; fi

if curl_reachable "https://registry.npmjs.org"; then ok "npm registry reachable"
else fail "npm registry unreachable"; fi

PARENT="$(dirname "$INSTALL_DIR")"; [[ -d "$PARENT" ]] || PARENT="/"
FREE_MB=$(( $(df -k "$PARENT" | awk 'NR==2{print $4}') / 1024 ))
if [[ "$FREE_MB" -ge 500 ]]; then ok "Disk space: ${FREE_MB} MB free"
else fail "Disk space: only ${FREE_MB} MB free (500 MB needed)"; fi

echo "  ──────────────────────────────────────────────────────"
if $CHECKS_OK; then echo -e "  ${G}${BOLD}All checks passed.${NC}"
else echo -e "  ${R}${BOLD}Some checks failed — see above.${NC}"; fi
echo ""
$CHECK_ONLY && exit $( $CHECKS_OK && echo 0 || echo 1 )
$CHECKS_OK  || die "Fix the issues above then re-run."

SUDO="sudo"; [[ "$EUID" -eq 0 ]] && SUDO=""

# ── 1. Base packages ───────────────────────────────────────────
info "Updating package lists..."
$SUDO apt-get update -q
for pkg in curl ca-certificates gnupg git; do
  dpkg -s "$pkg" &>/dev/null || { info "Installing $pkg..."; $SUDO apt-get install -y "$pkg"; }
done

# ── 2. Node.js via NodeSource ──────────────────────────────────
CURRENT_NODE=$(node_major)
if [[ "$CURRENT_NODE" -lt "$REQUIRED_NODE" ]]; then
  info "Setting up NodeSource for Node.js ${REQUIRED_NODE}..."
  CURL_FLAG=$( $NO_SSL && echo "-fsSLk" || echo "-fsSL" )
  curl $CURL_FLAG "https://deb.nodesource.com/setup_${REQUIRED_NODE}.x" | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi
info "Node.js $(node -v) · npm $(npm -v)"

# ── 3. Clone or upgrade ────────────────────────────────────────
if $UPGRADE; then
  [[ -d "$INSTALL_DIR/.git" ]] || die "--upgrade: $INSTALL_DIR is not a git repo."
  info "Stopping service before upgrade..."
  $SUDO systemctl stop "$SERVICE_NAME" 2>/dev/null || true

  info "Creating pre-upgrade snapshot..."
  SNAP_TS=$(date -u +"%Y-%m-%dT%H-%M-%S")
  SNAP_DIR="$INSTALL_DIR/snapshots/${SNAP_TS}_pre-upgrade"
  $SUDO mkdir -p "$SNAP_DIR"
  for _src in config logs; do
    [[ -d "$INSTALL_DIR/$_src" ]] || continue
    $SUDO cp -al "$INSTALL_DIR/$_src" "$SNAP_DIR/$_src" 2>/dev/null \
      || $SUDO cp -R "$INSTALL_DIR/$_src" "$SNAP_DIR/$_src"
  done
  ok "Snapshot saved"

  info "Pulling latest from GitHub..."
  $SUDO git $GIT_SSL -c safe.directory="$INSTALL_DIR" -C "$INSTALL_DIR" fetch origin main
  $SUDO git $GIT_SSL -c safe.directory="$INSTALL_DIR" -C "$INSTALL_DIR" reset --hard origin/main
else
  if [[ -d "$INSTALL_DIR" && -f "$INSTALL_DIR/package.json" ]]; then
    die "$INSTALL_DIR already exists. Use --upgrade or --dir."
  fi
  info "Cloning https://github.com/talder/FileDrop → $INSTALL_DIR ..."
  $SUDO mkdir -p "$INSTALL_DIR"
  $SUDO git $GIT_SSL clone "$REPO" "$INSTALL_DIR"
fi

# ── 4. Service user & permissions ──────────────────────────────
SVC_USER_EXISTS=false; id "$SERVICE_USER" &>/dev/null && SVC_USER_EXISTS=true

if $SERVICE && ! $SVC_USER_EXISTS; then
  info "Creating service user: $SERVICE_USER ..."
  $SUDO useradd -r -s /bin/false -d "$INSTALL_DIR" "$SERVICE_USER"
  SVC_USER_EXISTS=true
fi

if $SERVICE || $SVC_USER_EXISTS; then
  for dir in config logs; do $SUDO mkdir -p "$INSTALL_DIR/$dir"; done
  $SUDO chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
else
  $SUDO chown -R "$(whoami)" "$INSTALL_DIR"
fi

# ── 5. Dependencies & build ────────────────────────────────────
cd "$INSTALL_DIR"
NPM_SSL=$( $NO_SSL && echo "--strict-ssl=false" || echo "" )
if $SERVICE || $SVC_USER_EXISTS; then
  info "Installing npm dependencies..."
  sudo -u "$SERVICE_USER" npm install $NPM_SSL || die "npm install failed"
  info "Building production bundle..."
  sudo -u "$SERVICE_USER" npm run build || die "Build failed"
  $SUDO chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
else
  info "Installing npm dependencies..."
  npm install $NPM_SSL || die "npm install failed"
  info "Building production bundle..."
  npm run build || die "Build failed"
fi

# ── 6. Service (systemd) ───────────────────────────────────────
if $SERVICE; then
  info "Configuring systemd service: $SERVICE_NAME ..."
  $SUDO mkdir -p "$LOG_DIR"
  $SUDO chown "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"
  NODE_BIN="$(command -v node || which node 2>/dev/null || echo /usr/bin/node)"
  NPM_BIN="$(command -v npm || which npm 2>/dev/null || echo /usr/bin/npm)"
  $SUDO tee "$SERVICE_FILE" > /dev/null <<UNIT
[Unit]
Description=FileDrop Secure File Drop Service
Documentation=https://github.com/talder/FileDrop
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NPM_BIN} start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=filedrop
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=PATH=$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
UNIT
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable "$SERVICE_NAME"
  $SUDO systemctl restart "$SERVICE_NAME"
  info "Service enabled and started."
fi

if $UPGRADE && $SVC_USER_EXISTS; then
  info "Restarting service..."
  $SUDO systemctl restart "$SERVICE_NAME" 2>/dev/null || true
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
  echo "  Service     : $SERVICE_NAME (auto-start at boot)"
  echo "  Start       : sudo systemctl start  $SERVICE_NAME"
  echo "  Stop        : sudo systemctl stop   $SERVICE_NAME"
  echo "  Restart     : sudo systemctl restart $SERVICE_NAME"
  echo "  Status      : sudo systemctl status $SERVICE_NAME"
  echo "  Logs        : sudo journalctl -u $SERVICE_NAME -f"
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
