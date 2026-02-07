#!/usr/bin/env bash
# Setup a self-hosted GitHub Actions runner for mycelium-v2.
# Downloads the latest runner, configures it for the user account,
# and installs a systemd user service.
set -euo pipefail

RUNNER_DIR="$HOME/.local/share/github-runner"
SERVICE_DIR="$HOME/.config/systemd/user"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/github-runner.service"
RUNNER_URL="https://github.com/matthew-kissinger"
RUNNER_NAME="mycelium-hub"
RUNNER_LABELS="mycelium-hub,nixos"
ARCH="x64"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Prerequisites ────────────────────────────────────────────────────────────

echo -e "${BLUE}[1/6] Checking prerequisites...${NC}"

if ! command -v gh &>/dev/null; then
  echo -e "${RED}ERROR: gh CLI is not installed.${NC}"
  echo "  NixOS:  nix-env -iA nixpkgs.gh"
  echo "  Ubuntu: sudo apt install gh"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo -e "${RED}ERROR: gh is not authenticated. Run: gh auth login${NC}"
  exit 1
fi
echo -e "${GREEN}  gh CLI authenticated.${NC}"

if ! command -v curl &>/dev/null; then
  echo -e "${RED}ERROR: curl is not installed.${NC}"
  exit 1
fi

if ! command -v tar &>/dev/null; then
  echo -e "${RED}ERROR: tar is not installed.${NC}"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo -e "${RED}ERROR: jq is not installed.${NC}"
  exit 1
fi

echo -e "${GREEN}  All prerequisites satisfied.${NC}"

# ── Download latest runner ───────────────────────────────────────────────────

echo -e "${BLUE}[2/6] Fetching latest runner release...${NC}"

LATEST_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/^v//')

if [[ -z "$LATEST_VERSION" || "$LATEST_VERSION" == "null" ]]; then
  echo -e "${RED}ERROR: Could not determine latest runner version.${NC}"
  exit 1
fi

TARBALL="actions-runner-linux-${ARCH}-${LATEST_VERSION}.tar.gz"
DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${LATEST_VERSION}/${TARBALL}"

echo -e "  Latest version: ${GREEN}${LATEST_VERSION}${NC}"
echo -e "  Download URL:   ${DOWNLOAD_URL}"

# ── Create install directory ─────────────────────────────────────────────────

echo -e "${BLUE}[3/6] Setting up install directory...${NC}"

if [[ -d "$RUNNER_DIR" ]]; then
  # Check if already configured
  if [[ -f "$RUNNER_DIR/.runner" ]]; then
    echo -e "${YELLOW}  WARNING: Runner already configured at $RUNNER_DIR${NC}"
    echo -e "${YELLOW}  To reconfigure, first run: $RUNNER_DIR/config.sh remove${NC}"
    read -rp "  Continue anyway? (y/N) " confirm
    if [[ "${confirm,,}" != "y" ]]; then
      echo "Aborted."
      exit 0
    fi
  fi
else
  mkdir -p "$RUNNER_DIR"
  echo -e "${GREEN}  Created $RUNNER_DIR${NC}"
fi

# ── Download and extract ─────────────────────────────────────────────────────

echo -e "${BLUE}[4/6] Downloading and extracting runner...${NC}"

TMPFILE=$(mktemp /tmp/actions-runner-XXXXXX.tar.gz)
trap 'rm -f "$TMPFILE"' EXIT

curl -sL "$DOWNLOAD_URL" -o "$TMPFILE"

if [[ ! -s "$TMPFILE" ]]; then
  echo -e "${RED}ERROR: Download failed or file is empty.${NC}"
  exit 1
fi

tar xzf "$TMPFILE" -C "$RUNNER_DIR"
echo -e "${GREEN}  Extracted to $RUNNER_DIR${NC}"

# ── Get registration token and configure ─────────────────────────────────────

echo -e "${BLUE}[5/6] Configuring runner...${NC}"

# Try to get a registration token via the GitHub API (user-level runner).
# This requires the 'admin:org' scope or user runner management permissions.
TOKEN=""
if gh api -X POST /user/actions/runners/registration-token --jq '.token' &>/dev/null; then
  TOKEN=$(gh api -X POST /user/actions/runners/registration-token --jq '.token')
  echo -e "${GREEN}  Registration token obtained via API.${NC}"
else
  echo -e "${YELLOW}  Could not obtain token via API (may need admin scope).${NC}"
  echo -e "  Get a token from: ${RUNNER_URL}/settings/actions/runners/new"
  read -rsp "  Enter registration token: " TOKEN
  echo
  if [[ -z "$TOKEN" ]]; then
    echo -e "${RED}ERROR: No registration token provided.${NC}"
    exit 1
  fi
fi

cd "$RUNNER_DIR"
./config.sh \
  --url "$RUNNER_URL" \
  --token "$TOKEN" \
  --labels "$RUNNER_LABELS" \
  --name "$RUNNER_NAME" \
  --work _work \
  --unattended \
  --replace

echo -e "${GREEN}  Runner configured successfully.${NC}"

# ── Install systemd user service ─────────────────────────────────────────────

echo -e "${BLUE}[6/6] Installing systemd user service...${NC}"

if [[ ! -f "$SERVICE_FILE" ]]; then
  echo -e "${RED}ERROR: Service file not found at $SERVICE_FILE${NC}"
  echo "  Expected: scripts/github-runner.service in the repo."
  exit 1
fi

mkdir -p "$SERVICE_DIR"
cp "$SERVICE_FILE" "$SERVICE_DIR/github-runner.service"
systemctl --user daemon-reload

echo -e "${GREEN}  Service installed to $SERVICE_DIR/github-runner.service${NC}"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}Setup complete.${NC}"
echo ""
echo "Runner details:"
echo "  Name:       $RUNNER_NAME"
echo "  Labels:     $RUNNER_LABELS"
echo "  Directory:  $RUNNER_DIR"
echo "  Service:    github-runner.service"
echo ""
echo "To start the runner:"
echo "  systemctl --user start github-runner"
echo "  systemctl --user enable github-runner   # start on login"
echo ""
echo "To check status:"
echo "  systemctl --user status github-runner"
echo ""
echo "To view logs:"
echo "  journalctl --user -u github-runner -f"
echo ""
echo "To remove the runner:"
echo "  systemctl --user stop github-runner"
echo "  systemctl --user disable github-runner"
echo "  cd $RUNNER_DIR && ./config.sh remove"
