#!/usr/bin/env bash
# Probe each CLI for available models and save to JSON.
# Useful for validating agent-matrix.ts model IDs.
set -euo pipefail

OUTPUT="${HOME}/.config/mycelium-v2/model-registry.json"
mkdir -p "$(dirname "$OUTPUT")"

echo "=== Probing CLI Models ==="

# Cursor (agent) - has --list-models
echo "[cursor] Probing..."
CURSOR_MODELS=$(agent --list-models 2>&1 | grep -v '^Available' | grep -v '^Tip' | grep -v '^$' | awk '{print $1}' || echo "")

# Copilot - extract models from --help
echo "[copilot] Probing..."
COPILOT_MODELS=$(copilot --help 2>&1 | sed -n '/--model/,/--/p' | grep -oP '"[^"]+?"' | tr -d '"' | sort || echo "")

# OpenCode - models subcommand
echo "[opencode] Probing..."
OPENCODE_MODELS=$(opencode models 2>&1 || echo "")

# Pi - list models (needs env vars)
echo "[pi] Probing..."
source ~/.config/mk-agent/OPENROUTER_API_KEY 2>/dev/null || true
PI_MODELS=$(pi --list-models 2>&1 | head -50 || echo "")

# Gemini - test known model IDs
echo "[gemini] Probing known IDs..."
GEMINI_VALID=""
for m in flash gemini-3-pro-preview gemini-3-flash-preview gemini-2.5-flash gemini-2.5-pro; do
  if gemini "say ok" --model "$m" --yolo 2>&1 | grep -qi "ok"; then
    GEMINI_VALID="$GEMINI_VALID $m"
    echo "  $m: OK"
  else
    echo "  $m: FAILED"
  fi
done

# Codex - extract from --help
echo "[codex] Probing..."
CODEX_MODELS=$(codex --help 2>&1 | sed -n '/--model/,/--/p' | grep -oP '"[^"]+?"' | tr -d '"' | sort || echo "")

# Build JSON with bun
cat > /tmp/probe-models-format.ts << 'SCRIPT'
const data = {
  probed_at: new Date().toISOString(),
  cursor: process.env.CURSOR_MODELS?.split('\n').filter(Boolean) ?? [],
  copilot: process.env.COPILOT_MODELS?.split('\n').filter(Boolean) ?? [],
  opencode: process.env.OPENCODE_MODELS?.split('\n').filter(Boolean) ?? [],
  pi: process.env.PI_MODELS?.split('\n').filter(Boolean) ?? [],
  gemini: process.env.GEMINI_VALID?.trim().split(' ').filter(Boolean) ?? [],
  codex: process.env.CODEX_MODELS?.split('\n').filter(Boolean) ?? [],
}
console.log(JSON.stringify(data, null, 2))
SCRIPT

export CURSOR_MODELS COPILOT_MODELS OPENCODE_MODELS PI_MODELS GEMINI_VALID CODEX_MODELS
bun run /tmp/probe-models-format.ts > "$OUTPUT"
rm -f /tmp/probe-models-format.ts

echo ""
echo "=== Saved to $OUTPUT ==="
cat "$OUTPUT"
