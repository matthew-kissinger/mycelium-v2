#!/usr/bin/env bash
# Setup the official GitHub MCP server (github/github-mcp-server).
# Builds from source via Go, configures Claude Code and Cline MCP settings.
set -euo pipefail

BINARY_PATH="$HOME/go/bin/github-mcp-server"
TOKEN_FILE="$HOME/.config/mk-agent/GITHUB_TOKEN"
CLAUDE_MCP_CONFIG="$HOME/.claude.json"
CLINE_MCP_CONFIG="$HOME/.cline/data/settings/cline_mcp_settings.json"

# ── Step 1: Check Go is installed ────────────────────────────────────────────

if ! command -v go &>/dev/null; then
  echo "ERROR: Go is not installed. Install it first:"
  echo "  NixOS:  nix-env -iA nixpkgs.go"
  echo "  Ubuntu: sudo apt install golang-go"
  echo "  macOS:  brew install go"
  exit 1
fi
echo "[1/6] Go found: $(go version)"

# ── Step 2: Install github-mcp-server from source ───────────────────────────

echo "[2/6] Installing github-mcp-server via go install..."
go install github.com/github/github-mcp-server/cmd/github-mcp-server@latest
echo "      Installed successfully."

# ── Step 3: Verify the binary exists ─────────────────────────────────────────

if [[ ! -x "$BINARY_PATH" ]]; then
  echo "ERROR: Binary not found at $BINARY_PATH"
  echo "Check your GOBIN/GOPATH. Expected: ~/go/bin/github-mcp-server"
  exit 1
fi
echo "[3/6] Binary verified: $BINARY_PATH"
echo "      Version: $($BINARY_PATH --help 2>&1 | head -1 || echo 'unknown')"

# ── Step 4: Resolve GitHub token ─────────────────────────────────────────────

GITHUB_TOKEN=""

# Try mk-agent config file first
if [[ -f "$TOKEN_FILE" ]]; then
  GITHUB_TOKEN="$(cat "$TOKEN_FILE")"
  echo "[4/6] Token loaded from $TOKEN_FILE"
fi

# Fallback: gh auth token
if [[ -z "$GITHUB_TOKEN" ]] && command -v gh &>/dev/null; then
  GITHUB_TOKEN="$(gh auth token 2>/dev/null || true)"
  if [[ -n "$GITHUB_TOKEN" ]]; then
    echo "[4/6] Token loaded from gh auth token"
  fi
fi

# If still empty, prompt or exit
if [[ -z "$GITHUB_TOKEN" ]]; then
  if [[ -t 0 ]]; then
    echo "No GitHub token found. Enter your personal access token:"
    read -rsp "Token: " GITHUB_TOKEN
    echo
    if [[ -z "$GITHUB_TOKEN" ]]; then
      echo "ERROR: No token provided."
      exit 1
    fi
    echo "[4/6] Token provided interactively."
  else
    echo "ERROR: No GitHub token found."
    echo "  Option 1: echo 'ghp_...' > $TOKEN_FILE"
    echo "  Option 2: gh auth login"
    exit 1
  fi
fi

# ── Step 5: Add to Claude Code MCP config (~/.claude.json) ──────────────────
# Claude stores global MCP servers under .mcpServers in ~/.claude.json.
# We merge our server entry into the existing config without clobbering
# other keys.

echo "[5/6] Configuring Claude Code MCP ($CLAUDE_MCP_CONFIG)..."

if [[ ! -f "$CLAUDE_MCP_CONFIG" ]]; then
  echo "      WARNING: $CLAUDE_MCP_CONFIG not found. Creating minimal config."
  echo '{}' > "$CLAUDE_MCP_CONFIG"
fi

# Build the new MCP server entry
NEW_SERVER=$(jq -n \
  --arg cmd "$BINARY_PATH" \
  --arg token "$GITHUB_TOKEN" \
  '{
    type: "stdio",
    command: $cmd,
    args: ["stdio"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: $token
    }
  }')

# Merge into .mcpServers.github (creates mcpServers if missing)
TMP_FILE=$(mktemp)
jq --argjson server "$NEW_SERVER" '
  .mcpServers = (.mcpServers // {}) |
  .mcpServers.github = $server
' "$CLAUDE_MCP_CONFIG" > "$TMP_FILE"
mv "$TMP_FILE" "$CLAUDE_MCP_CONFIG"

echo "      Added github MCP server to Claude Code global config."

# ── Step 6: Add to Cline MCP config (if Cline is installed) ─────────────────
# Cline stores MCP servers under .mcpServers in its settings JSON.
# The format wraps each server with additional Cline-specific fields.

echo "[6/6] Configuring Cline MCP ($CLINE_MCP_CONFIG)..."

if [[ ! -f "$CLINE_MCP_CONFIG" ]]; then
  echo "      Cline MCP config not found - skipping."
  echo "      (Install Cline and re-run, or configure manually.)"
else
  # Build Cline-format MCP server entry
  CLINE_SERVER=$(jq -n \
    --arg cmd "$BINARY_PATH" \
    --arg token "$GITHUB_TOKEN" \
    '{
      command: "stdio",
      args: [],
      transportType: "stdio",
      autoApprove: [],
      disabled: false,
      timeout: 60,
      commandArgs: {
        command: $cmd,
        args: ["stdio"],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: $token
        }
      }
    }')

  # Merge into .mcpServers.github
  TMP_FILE=$(mktemp)
  jq --argjson server "$CLINE_SERVER" '
    .mcpServers = (.mcpServers // {}) |
    .mcpServers.github = $server
  ' "$CLINE_MCP_CONFIG" > "$TMP_FILE"
  mv "$TMP_FILE" "$CLINE_MCP_CONFIG"

  echo "      Added github MCP server to Cline config."
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "Setup complete. GitHub MCP server is configured for:"
echo "  Binary:  $BINARY_PATH"
echo "  Claude:  $CLAUDE_MCP_CONFIG (mcpServers.github)"
if [[ -f "$CLINE_MCP_CONFIG" ]]; then
  echo "  Cline:   $CLINE_MCP_CONFIG (mcpServers.github)"
fi
echo ""
echo "Restart Claude Code / Cline to pick up the new MCP server."
