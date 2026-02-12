# OpenCode CLI - Agent Decomposition

**CLI:** `opencode`
**Version:** 1.1.59
**Vendor:** OpenCode AI (open source, MIT license)
**Install:** npm global (`npm i -g opencode-ai`) or curl/bun/brew
**Binary:** Native platform binary (Node.js wrapper at `~/.npm-global/bin/opencode` delegates to compiled native binary in `opencode-linux-x64/bin/opencode`)
**Config dir:** `~/.config/opencode/` (config), `~/.local/share/opencode/` (data), `~/.cache/opencode/` (cache)

---

## Authentication Modes

OpenCode supports multiple providers with independent auth. **All providers are detected simultaneously and can be used by switching `--model provider/model`.**

| Provider | Auth Method | Env Var / Config | Billing |
|----------|-------------|------------------|---------|
| **OpenCode Zen** | None (built-in) | No key needed | Free (rate-limited) |
| **Anthropic** | API key | `ANTHROPIC_API_KEY` | Pay-per-token |
| **OpenAI** | API key | `OPENAI_API_KEY` | Pay-per-token |
| **OpenRouter** | API key | `OPENROUTER_API_KEY` | Pay-per-token |
| **Groq** | API key / `opencode auth login` | `GROQ_API_KEY` or `~/.local/share/opencode/auth.json` | Free tier (rate-limited) |
| **Cerebras** | API key | `CEREBRAS_API_KEY` | Free tier (rate-limited) |
| **Mistral** | API key | `MISTRAL_API_KEY` | Pay-per-token |
| **Google** | API key | `GOOGLE_API_KEY` | Free tier / pay-per-token |
| **Hugging Face** | Token | `HF_TOKEN` | Varies |
| **GitHub Copilot** | Token / OAuth | `GITHUB_TOKEN` or `opencode auth login` | Subscription |
| **GitHub Models** | Token | `GITHUB_TOKEN` | Free tier / pay-per-token |

### Auth File

Credentials stored via `opencode auth login` go to `~/.local/share/opencode/auth.json`:

```json
{
  "groq": { "apiKey": "gsk_..." }
}
```

### Auth CLI

```bash
opencode auth list       # Show all configured credentials + env vars
opencode auth login      # Interactive login to a provider
opencode auth logout     # Remove stored credentials
```

### Provider Detection

On startup, OpenCode probes all known providers using both env vars and `auth.json`. The debug log shows:

```
service=provider providerID=groq found
service=provider providerID=anthropic found
service=provider providerID=openrouter found
...
```

A provider is "found" if its env var is set OR an `auth.json` entry exists.

---

## Env Var Poisoning Risk

**CRITICAL: OpenCode inherits ALL API keys from the parent process environment.**

Our `~/.config/mk-agent/env` file (sourced via `~/.zshenv`) exports:
- `ANTHROPIC_API_KEY` - OpenCode will use this for Anthropic models, burning API credits
- `OPENAI_API_KEY` - Same risk for OpenAI models
- `OPENROUTER_API_KEY` - Same risk for OpenRouter models
- `GROQ_API_KEY` - Same risk for Groq
- `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`, `HF_TOKEN`, `GOOGLE_API_KEY`
- `GITHUB_TOKEN` - Used for GitHub Copilot and GitHub Models

**Current adapter does NOT strip any env vars.** The `buildEnv()` method returns `{}`, which means all env vars flow through via `dispatch.ts` line 143:

```typescript
env: { ...process.env, ...env, ...extraEnv },
```

**Impact:** When dispatching with `--model opencode/kimi-k2.5-free` (the default), OpenCode uses the free Zen provider. No credit burn. But if a model from a paid provider is selected (e.g. via fallback chain, or explicit model override), credits from the corresponding API key will be consumed.

**Recommendation:** The adapter should strip all paid-provider API keys unless the task explicitly targets that provider. This matches the fix applied to the Claude adapter. Alternatively, since OpenCode's default and fallback chain all use free Zen models, the risk is minimal in practice.

---

## Models

### Free OpenCode Zen Models (Default)

| Model ID | Context | Notes |
|----------|---------|-------|
| `opencode/kimi-k2.5-free` | 262K | **Default** - best free coder |
| `opencode/glm-4.7-free` | 200K | Function calling |
| `opencode/gpt-5-nano` | 400K | Fast, small |
| `opencode/big-pickle` | 200K | Alternative |
| `opencode/trinity-large-preview-free` | 200K | Alternative |
| `opencode/minimax-m2.1-free` | 128K | Alternative |

### Full Provider Roster

OpenCode supports 392 models across 11 providers:

| Provider | Count | Examples |
|----------|-------|----------|
| `opencode` | 6 | Free Zen models above |
| `anthropic` | 23 | `anthropic/claude-opus-4-6`, `anthropic/claude-sonnet-4-5` |
| `openai` | ~50 | `openai/gpt-5`, `openai/o3-pro` |
| `openrouter` | ~180 | `openrouter/moonshotai/kimi-k2.5`, etc. |
| `groq` | ~20 | `groq/llama-4-scout-17b-16e-instruct` |
| `cerebras` | ~5 | `cerebras/qwen-3-235b-a22b-instruct-2507` |
| `mistral` | ~20 | `mistral/mistral-large-latest` |
| `github-copilot` | ~20 | `github-copilot/claude-opus-4.6` |
| `github-copilot-enterprise` | ~20 | `github-copilot-enterprise/gpt-5.2` |
| `github-models` | ~50 | `github-models/deepseek/deepseek-r1` |
| `huggingface` | ~10 | `huggingface/Qwen/Qwen3-235B-A22B` |

### Model Selection

```bash
opencode run -m opencode/big-pickle "prompt"         # Explicit model
opencode run -m anthropic/claude-sonnet-4-5 "prompt"  # Cross-provider
opencode models                                       # List all
opencode models anthropic                             # List by provider
opencode models --verbose                             # With cost/context metadata
opencode models --refresh                             # Refresh from models.dev
```

### Verbose Model Output

The `--verbose` flag on `models` returns full JSON per model including:
- `cost.input` / `cost.output` / `cost.cache` (per million tokens)
- `limit.context` / `limit.output`
- `capabilities.reasoning`, `capabilities.toolcall`, `capabilities.attachment`
- `capabilities.input.image`, `capabilities.input.pdf`
- `release_date`, `variants`

---

## Non-Interactive / Headless Mode

### `opencode run` (Primary for Dispatch)

```bash
opencode run [message..] [options]
```

**Key flags:**

| Flag | Description |
|------|-------------|
| `[message..]` | Prompt text (positional, supports multiple words) |
| `-m, --model` | Model in `provider/model` format |
| `--format default\|json` | Output format |
| `-c, --continue` | Continue last session |
| `-s, --session ID` | Resume specific session |
| `--fork` | Fork session on continue |
| `--share` | Share the session after completion |
| `-f, --file` | Attach file(s) to message |
| `--title` | Session title |
| `--agent` | Agent to use (custom agent name) |
| `--variant` | Model variant (reasoning effort: high, max, minimal) |
| `--thinking` | Show thinking blocks |
| `--attach URL` | Attach to running opencode server |
| `--port` | Port for local server |
| `--command` | Command to run, message becomes args |

### `opencode serve` (Headless Server)

Starts a headless HTTP server without TUI:

```bash
opencode serve --port 4096 --hostname 0.0.0.0
```

Exposes REST API for session management, messages, events (SSE).

### `opencode web` (Web UI)

Starts server and opens browser-based interface.

---

## Output Format

### Default Format (`--format default`)

- **stdout:** Clean text output - the assistant's final text response only
- **stderr:** Empty unless `--print-logs` is set
- **Exit code:** `0` = success

```
$ opencode run --model opencode/big-pickle "Reply with OK"
OK
```

### JSON Format (`--format json`)

Emits newline-delimited JSON events to stdout. Three event types:

**1. `step_start`** - Beginning of a processing step:
```json
{
  "type": "step_start",
  "timestamp": 1770859107430,
  "sessionID": "ses_...",
  "part": {
    "type": "step-start",
    "snapshot": "03a3225a..."
  }
}
```

**2. `text`** - Text content from the model:
```json
{
  "type": "text",
  "timestamp": 1770859107702,
  "sessionID": "ses_...",
  "part": {
    "type": "text",
    "text": "\nOK",
    "time": { "start": 1770859107696, "end": 1770859107696 }
  }
}
```

**3. `step_finish`** - Completion with cost/token metadata:
```json
{
  "type": "step_finish",
  "timestamp": 1770859107718,
  "sessionID": "ses_...",
  "part": {
    "type": "step-finish",
    "reason": "stop",
    "cost": 0.12365925,
    "tokens": {
      "total": 32964,
      "input": 1,
      "output": 4,
      "reasoning": 0,
      "cache": { "read": 0, "write": 32959 }
    }
  }
}
```

Tool calls appear as additional event types (e.g., `tool_call`, `tool_result`) between `step_start` and `step_finish`.

### Stderr (with `--print-logs`)

Structured log lines with timestamps and service tags:

```
INFO  2026-02-12T01:17:22 +483ms service=default version=1.1.59 args=[...] opencode
INFO  2026-02-12T01:17:22 +2ms service=default directory=/home/dev/mycelium-v2 creating instance
```

### Cost Data in Output

The JSON format includes cost in `step_finish.part.cost` (USD). Free models report `0`. Token counts include `input`, `output`, `reasoning`, and `cache.read`/`cache.write`.

---

## Session Management

### Storage

Sessions stored as JSON in `~/.local/share/opencode/storage/`:

```
storage/
  session/          # Session metadata (per project hash)
    <project-hash>/
      ses_<id>.json
    global/
  message/          # Message history
  part/             # Message parts (large, 356+ entries)
  session_diff/     # Diff tracking
  todo/             # Todo items
  project/          # Project metadata
  migration         # Migration version
```

### CLI

```bash
opencode session list     # List all sessions with IDs, titles, dates
opencode -c               # Continue last session
opencode -s <sessionID>   # Resume specific session
opencode --fork -c        # Fork the last session
opencode export [ID]      # Export session as JSON
opencode import <file>    # Import session from JSON or URL
```

### Session IDs

Format: `ses_<26-char-alphanumeric>` (e.g., `ses_3d41af6f3ffeoN5tXtgSP3nb49`)

### Session Resume for Retry

The adapter currently does NOT pass `--session` or `--continue` flags on retry. The `sessionId` field in `AdapterOptions` is available but unused in `buildArgs()`.

---

## MCP Server Support

OpenCode supports MCP (Model Context Protocol) servers natively:

```bash
opencode mcp add            # Add an MCP server
opencode mcp list           # List configured servers
opencode mcp auth [name]    # OAuth auth for MCP server
opencode mcp logout [name]  # Remove OAuth for MCP server
opencode mcp debug <name>   # Debug OAuth connection
```

Config stored in `opencode.json` or `~/.config/opencode/opencode.json` under `"mcp"` key. Currently no MCP servers are configured on this system.

---

## Agent System

OpenCode has a built-in agent concept (separate from mycelium agents):

```bash
opencode agent list     # List agents with permissions
opencode agent create   # Create custom agent
```

Default agent is `build` (primary), which has:
- Full tool permissions: bash, read, edit, write, glob, grep, task, webfetch, todowrite, skill
- External directory permissions for `~/.claude/skills/` (picks up Claude Code skills)
- Permission deny for `question` and `plan_enter` in non-interactive mode
- Doom loop detection (`permission: "doom_loop"` with `action: "ask"`)

### Skills

OpenCode reads Claude Code skills from `~/.claude/skills/*/SKILL.md`. It has duplicate detection and warns about skills found in multiple locations.

---

## ACP (Agent Client Protocol)

OpenCode supports ACP for agent-to-agent communication:

```bash
opencode acp --port 4096 --hostname 127.0.0.1 --cwd /path
```

This starts an ACP server that other agents can connect to.

---

## GitHub Integration

```bash
opencode github install    # Install GitHub agent
opencode github run        # Run GitHub agent
opencode pr <number>       # Checkout PR branch and start opencode
```

---

## Configuration

### Config File Locations

Searched in order:
1. `~/.config/opencode/config.json`
2. `~/.config/opencode/opencode.json`
3. `~/.config/opencode/opencode.jsonc`
4. `./opencode.json` (project-level)

Currently none exist on this system.

### Debug Config

```bash
opencode debug config     # Show resolved configuration (JSON)
opencode debug paths      # Show all paths (data, config, cache, state, bin, log)
opencode debug agent <n>  # Show agent details with permissions
opencode debug skill      # List all available skills
opencode debug lsp        # LSP debugging
opencode debug rg         # ripgrep debugging
opencode debug file       # File system debugging
opencode debug snapshot   # Snapshot debugging
opencode debug scrap      # List all known projects
```

### Paths

| Path | Location |
|------|----------|
| Data | `~/.local/share/opencode/` |
| Config | `~/.config/opencode/` |
| Cache | `~/.cache/opencode/` |
| State | `~/.local/state/opencode/` |
| Bin | `~/.local/share/opencode/bin/` |
| Log | `~/.local/share/opencode/log/` |

### Stats

```bash
opencode stats    # Token usage, cost, tool usage breakdown
```

---

## Error Patterns

### Provider Auth Failures

When a provider has no key configured and you try to use it, OpenCode emits a `session.error` bus event and the process exits with empty stdout. No error message to stdout - the failure is silent unless `--print-logs` is used.

Example: Using `groq/...` model when `GROQ_API_KEY` env var is missing and no `auth.json` entry. The debug log shows:
```
service=bus type=session.error publishing
```

### Known Error Patterns for Health Tracking

| Pattern | Error Type | Detection |
|---------|-----------|-----------|
| `model not found` | `api_error` | Model ID invalid or unavailable |
| Silent exit (no stdout) | Auth failure | Provider key missing |
| Process timeout | `timeout` | `[TIMEOUT]` appended by dispatch.ts |

### Startup Latency

OpenCode has significant startup overhead (~10-15 seconds):
1. Instance creation and bootstrapping
2. Config loading (3 config file paths probed)
3. Plugin loading (internal auth plugins + npm plugins)
4. LSP server enumeration (30+ language servers probed)
5. Skill scanning (`~/.claude/skills/` - 100+ skills parsed)
6. File watcher initialization
7. Snapshot cleanup (7-day prune)
8. VCS initialization (git branch detection)

For the free Zen models, total latency from spawn to first token is ~15-20 seconds. Anthropic models are slightly faster (~10-15s to first token) due to lower API latency.

---

## Current Adapter Analysis

### `packages/server/src/agents/adapters/opencode.ts`

```typescript
export const opencodeAdapter: AgentAdapter = {
  id: 'opencode',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    return [
      'run',
      ...(model ? ['-m', model] : ['-m', 'opencode/kimi-k2.5-free']),
      prompt,
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}
```

### Issues Found

1. **No env var stripping**: Unlike the Claude adapter, no API keys are stripped. All keys from `~/.config/mk-agent/env` flow through. Risk: if someone dispatches `opencode` with a non-free model (e.g. via cross-agent fallback from `pi`), paid provider credits burn silently.

2. **No JSON format flag**: The adapter uses default (text) format. Adding `--format json` would allow extracting structured cost/token data from `step_finish` events instead of regex-guessing in `parseCostFromOutput()`.

3. **No session resume on retry**: `options.sessionId` is available but not passed as `--session`. OpenCode supports session resume (`-s <id>`) which could save context on retry.

4. **No `--title` flag**: Adding `--title "task-{id}"` would make session identification easier in `opencode session list` and `opencode stats`.

5. **No `postProcessOutput`**: Output is used raw. May contain leading newlines in text format (observed `\nOK` in JSON output).

6. **Missing error patterns in `health.ts`**: Only one opencode-specific pattern (`model not found`). Silent auth failures are not detected - the output is just empty.

### Recommended Adapter Improvements

```typescript
export const opencodeAdapter: AgentAdapter = {
  id: 'opencode',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, sessionId } = options
    return [
      'run',
      '--format', 'json',
      ...(model ? ['-m', model] : ['-m', 'opencode/kimi-k2.5-free']),
      ...(sessionId ? ['-s', sessionId] : []),
      prompt,
    ]
  },

  buildEnv(): Record<string, string> {
    // Strip paid-provider keys to prevent accidental credit burn
    // Only free Zen models should be used by default
    return {
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      OPENROUTER_API_KEY: '',
      // Keep GROQ_API_KEY - free tier, no credit burn
      // Keep CEREBRAS_API_KEY - free tier
      // Keep GOOGLE_API_KEY - free tier
      // Keep GITHUB_TOKEN - subscription (Copilot)
    }
  },

  postProcessOutput(output: string): string {
    // If JSON format, extract text from events
    if (output.trim().startsWith('{')) {
      const lines = output.trim().split('\n')
      const texts: string[] = []
      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          if (event.type === 'text' && event.part?.text) {
            texts.push(event.part.text)
          }
        } catch {}
      }
      return texts.join('').trim()
    }
    return output.trim()
  },
}
```

---

## Fallback Chain

In mycelium's fallback system:

| Role | Value |
|------|-------|
| Default model | `opencode/kimi-k2.5-free` |
| In-agent fallback | None configured (no `FALLBACK_MODEL_MAP` entry for opencode) |
| Cross-agent fallback FROM | `opencode` -> `gemini/flash` |
| Cross-agent fallback TO | `pi` -> `opencode/kimi-k2.5-free` |

**Issue:** No in-agent model escalation chain. Could add: `opencode/kimi-k2.5-free` -> `opencode/big-pickle` -> `opencode/gpt-5-nano`.

---

## Billing

| Provider | Type | Notes |
|----------|------|-------|
| OpenCode Zen | Free | Rate-limited, no tracking needed |
| Anthropic | Pay-per-token | Tracked via `cost` in JSON output |
| OpenRouter | Pay-per-token | Tracked via OpenRouter credits API |
| Groq | Free tier | Rate-limited (429 errors) |
| Cerebras | Free tier | Rate-limited (429 errors) |

The `billing_type` in `DEFAULT_AGENT_CONFIGS` is `free` (matching the default free Zen models).

---

## Binary Architecture

OpenCode is distributed as a native compiled binary (likely Bun-compiled or Zig-based):

1. npm package `opencode-ai` contains a Node.js wrapper script (`bin/opencode`)
2. Wrapper resolves to platform-specific package: `opencode-linux-x64/bin/opencode`
3. Native binary executes directly - no Node.js runtime overhead for the main process
4. `OPENCODE_BIN_PATH` env var can override binary location

Platform packages: darwin-arm64, darwin-x64, linux-arm64, linux-x64, windows-x64 (with -baseline and -musl variants for Linux).

The binary is self-upgrading via `opencode upgrade` which supports curl, npm, pnpm, bun, brew, choco, and scoop install methods.

---

## Validation Checklist

| Check | Status | Notes |
|-------|--------|-------|
| Binary exists | OK | `~/.npm-global/bin/opencode` -> native binary |
| Version detection | OK | `opencode --version` -> `1.1.59` |
| `opencode run` works | OK | Text and JSON output confirmed |
| Default model works | OK | `opencode/kimi-k2.5-free` via Zen provider |
| Anthropic model works | OK | `anthropic/claude-sonnet-4-5` (env var) |
| JSON format works | OK | Structured events with cost/token data |
| Session management | OK | Sessions stored, list/export/import available |
| MCP support | OK | `opencode mcp add/list` available |
| Skills loaded | OK | Picks up `~/.claude/skills/` |
| Env var poisoning | RISK | All API keys inherited, adapter doesn't strip |
| Error detection | WEAK | Silent auth failures, limited patterns |
| Session resume | MISSING | `sessionId` not used in adapter |
| In-agent fallback | MISSING | No model escalation chain configured |
| Cost extraction | AVAILABLE | JSON format provides `step_finish.part.cost` |
