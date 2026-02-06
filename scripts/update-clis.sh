#!/usr/bin/env bash
# Update all agent CLIs to latest versions.
# Run periodically to keep model registries and features current.
set -euo pipefail

echo "=== Updating Agent CLIs ==="

# bun-managed (global installs)
echo "[bun] Updating codex, gemini..."
bun install -g @openai/codex@latest @google/gemini-cli@latest 2>&1 | tail -1

# npm-managed
echo "[npm] Updating copilot, pi, opencode, cline..."
npm install -g @anthropic-ai/claude-code@latest @github/copilot@latest @mariozechner/pi-coding-agent@latest opencode-ai@latest cline@latest 2>&1 | tail -1

# uv-managed (python)
echo "[uv] Updating vibe..."
uv tool install mistral-vibe --force 2>&1 | tail -1

# Self-updating CLIs
echo "[self] Checking self-updating CLIs..."
claude update 2>/dev/null || echo "  claude: manual update or already latest"
agent update 2>/dev/null || echo "  cursor/agent: manual update or already latest"
kiro-cli update 2>/dev/null || echo "  kiro-cli: manual update or already latest"

echo ""
echo "=== CLI Versions ==="
for cli in claude codex gemini cline agent kiro-cli vibe pi opencode copilot; do
  version=$($cli --version 2>&1 | head -1 || echo "NOT FOUND")
  printf "  %-12s %s\n" "$cli:" "$version"
done
