# Claude Code CLI - Agent Decomposition

**CLI:** `claude`
**Version:** 2.1.39
**Vendor:** Anthropic
**Install:** Native (auto-updates via `claude update`)
**Binary:** `~/.npm-global/bin/claude` (npm-global) / `~/.local/bin/claude` (native)
**Config dir:** `~/.claude/`

---

## Authentication Modes

Claude Code supports multiple auth modes. **The CLI auto-detects which to use based on environment.**

| Mode | Detection | Billing | Rate Limits |
|------|-----------|---------|-------------|
| **Subscription (Pro/Max)** | OAuth login via `claude` interactive | Flat monthly ($20 Pro / $200 Max) | Tiered by plan |
| **API Key** | `ANTHROPIC_API_KEY` in env | Pay-per-token (credit balance) | None (quota-based) |
| **AWS Bedrock** | `CLAUDE_CODE_USE_BEDROCK=1` | Pay-per-token via AWS | Region/model limits |
| **Google Vertex AI** | `CLAUDE_CODE_USE_VERTEX=1` | Pay-per-token via GCP | Quota-based |
| **Microsoft Foundry** | `CLAUDE_CODE_USE_FOUNDRY=1` | Pay-per-token via Azure | Quota-based |

### Priority

If `ANTHROPIC_API_KEY` is set in the environment, the CLI uses API key auth **even if you have a subscription**. This overrides subscription auth silently.

### Env Var Poisoning (FIXED 2026-02-10)

Our `~/.config/mk-agent/env` file sets `ANTHROPIC_API_KEY` which is sourced via `~/.zshenv`. This key is used by other tools (model fetching, provider health checks) but Claude Code inherits it via `process.env` in dispatch.ts. Result: Claude Code burned API credits instead of using subscription.

**Fix applied:** The Claude adapter strips `ANTHROPIC_API_KEY` from the spawned process environment so the CLI falls back to subscription auth. The key stays in `process.env` for `fetch-models.ts` and other non-CLI uses. If `provider` is explicitly set (e.g. `provider: "anthropic"`), the key is kept for intentional API key usage.

---

## Models

### Aliases (Recommended)

| Alias | Resolves To | Notes |
|-------|-------------|-------|
| `sonnet` | `claude-sonnet-4-5-20250929` | Default workhorse |
| `opus` | `claude-opus-4-6` | Best reasoning, expensive |
| `haiku` | `claude-haiku-4-5-20251001` | Fast/cheap |
| `default` | Varies by plan tier | |
| `sonnet[1m]` | Sonnet with 1M context | API key users only (not subscription) |
| `opusplan` | Opus (planning) + Sonnet (execution) | Hybrid mode |

### Full Model IDs

| Model | Full ID | Context | Strength |
|-------|---------|---------|----------|
| Opus 4.6 | `claude-opus-4-6` | 200K | Architecture, complex debugging |
| Sonnet 4.5 | `claude-sonnet-4-5-20250929` | 200K | Most tasks, balanced |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | 200K | Simple fixes, docs, fast |

### Cloud Provider Model IDs

| Provider | Sonnet | Haiku | Opus |
|----------|--------|-------|------|
| Anthropic Direct | `claude-sonnet-4-5-20250929` | `claude-haiku-4-5-20251001` | `claude-opus-4-6` |
| AWS Bedrock | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | N/A |
| Google Vertex | `claude-sonnet-4-5@20250929` | `claude-haiku-4-5@20251001` | `claude-opus-4-6` |
| Microsoft Foundry | Deployment name | Deployment name | Deployment name |

### Non-Anthropic Models

**Not supported.** Claude Code CLI only works with Claude models. You cannot use GPT, Gemini, Mistral, etc. through this CLI.

---

## Output Format

### `-p` Mode (Default Text)

In `-p` (print) mode, Claude Code outputs the **assistant's final text response** to stdout and progress/status messages to stderr:

- **stdout:** Clean text output - the assistant's response only. No framing, no metadata, no token counts.
- **stderr:** Progress indicators (spinner, tool use notifications). Minimal in `-p` mode.
- **Exit codes:** `0` = success, `1` = error. Exit code `124` is synthetic (added by dispatch.ts on timeout).

No token counts in default text mode. The `estimateTokens()` regex in dispatch.ts will never match Claude output.

### `--output-format json`

Returns a single JSON object after completion with exact token counts:

```json
{
  "type": "result",
  "subtype": "success",
  "cost_usd": 0.003,
  "duration_ms": 4521,
  "duration_api_ms": 3200,
  "is_error": false,
  "num_turns": 3,
  "result": "The assistant's text response",
  "session_id": "uuid-of-the-session",
  "total_cost_usd": 0.003,
  "usage": {
    "input_tokens": 1523,
    "output_tokens": 267,
    "cache_creation_input_tokens": 18850,
    "cache_read_input_tokens": 15548,
    "service_tier": "standard"
  }
}
```

### `--output-format stream-json`

NDJSON streaming format with per-event output including partial messages.

---

## Error Patterns

### Error Pattern Summary

| Error Type | stdout Text | health.ts Match | Status |
|-----------|-------------|-----------------|--------|
| API credit exhaustion | `Credit balance is too low` | **FIXED** - `quota` type | Was missing, now matched |
| Subscription rate limit | `You've hit your limit . resets Xpm (TZ)` | **FIXED** - `quota` type | Was missing, now matched |
| API error (400/500) | `API Error: NNN {json}` | Line 164 `claudeApiMatch` | Working |
| Overloaded (529) | `API Error: 529 {...}` | Line 164 `claudeApiMatch` | Working |
| Timeout | `[TIMEOUT]` (synthetic from dispatch.ts) | Line 156 | Working |

### Error Field Values (from session JSONL)

| Error | `error` field | `isApiErrorMessage` | Exit Code |
|-------|--------------|---------------------|-----------|
| Credit exhaustion | `billing_error` | true | 1 |
| Rate limit | `rate_limit` | true | 1 |
| API error | `unknown` | true | 1 |

---

## Session Management

### Session Storage

```
~/.claude/projects/{project-path-with-dashes}/
  {session-uuid}.jsonl           # Session transcript
  {session-uuid}/
    subagents/                    # Subagent sessions
      agent-a{hash}.jsonl
    tool-results/                 # Large tool outputs
      toolu_{id}.txt
```

Project path: `/home/dev/mycelium-v2` -> `-home-mkagent-mycelium-v2`

### Resume Mechanisms

| Flag | Purpose |
|------|---------|
| `--resume <sessionId>` | Resume specific session by UUID |
| `--continue` / `-c` | Continue most recent session |
| `--fork-session` | Resume into a new session ID |
| `--from-pr [value]` | Resume session linked to a PR |
| `--session-id <uuid>` | Use specific session ID |
| `--no-session-persistence` | Don't save session files (recommended for dispatch) |

### Session Data in JSON Output

With `--output-format json`, the `session_id` is returned in the result, making regex parsing unnecessary.

---

## Tool Inventory

### Built-in Tools

| Category | Tools |
|----------|-------|
| **File** | Read, Write, Edit, NotebookEdit, Glob, Grep |
| **Execution** | Bash, Task (subagents), Skill |
| **Web** | WebSearch, WebFetch |
| **Agent Teams** | SendMessage, TaskOutput (with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) |

### MCP-Provided Tools (varies by configuration)

- `mcp__playwright__*` - Browser automation (28 tools)
- `mcp__filesystem__*` - File system operations (13 tools)
- `mcp__plugin_context7__*` - Documentation lookup (2 tools)

### Tool Control Flags

```
--tools <tools...>           Specify available tools
--allowedTools <tools...>    Allow specific tools (e.g. "Bash(git:*) Edit")
--disallowedTools <tools...> Deny specific tools
--disable-slash-commands     Disable all skills
```

---

## Subagent Model

Claude Code can spawn subagents for parallel work using the **Task** tool.

### `CLAUDE_CODE_SUBAGENT_MODEL`

Controls which model spawned subagents use:
```bash
CLAUDE_CODE_SUBAGENT_MODEL=haiku claude -p "complex task" --model opus
```
Parent runs on Opus, subtasks on Haiku.

### Agent Teams (Experimental)

Enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (set in global settings).

```
--agent <agent>              Agent for the current session
--agents <json>              JSON defining custom agents
```

---

## Providers

Claude Code can route through different providers for the same Claude models:

| Provider | Env Var | Auth | Use Case |
|----------|---------|------|----------|
| **Anthropic Direct** | (default) | Subscription or `ANTHROPIC_API_KEY` | Individual devs |
| **AWS Bedrock** | `CLAUDE_CODE_USE_BEDROCK=1` | AWS IAM / SSO / API key | AWS-native teams |
| **Google Vertex AI** | `CLAUDE_CODE_USE_VERTEX=1` | GCP IAM / ADC | GCP-native teams |
| **Microsoft Foundry** | `CLAUDE_CODE_USE_FOUNDRY=1` | Azure RBAC / Entra ID / API key | Azure teams |
| **LLM Gateway** | `ANTHROPIC_BASE_URL=<url>` | Custom | Rate limiting, audit |

---

## Configuration

### Settings Files (Priority Order, Highest First)

1. CLI flags (`--model`, `--system-prompt`, etc.)
2. `.claude/.local.json` / `.claude/settings.local.json` (per-project, not committed)
3. `.claude/settings.json` (per-project, committed to git)
4. `~/.claude/settings.json` (user global)
5. `~/.claude/settings.local.json` (user global local)
6. System-managed (`/etc/claude-code/` on Linux)

### Current Global Settings (`~/.claude/settings.json`)

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "enabledPlugins": {
    "context7@claude-plugins-official": true
  }
}
```

### Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key auth (overrides subscription!) |
| `ANTHROPIC_MODEL` | Override default model |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | What "opus" alias resolves to |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | What "sonnet" alias resolves to |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | What "haiku" alias resolves to |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Model for spawned subagents |
| `CLAUDE_CODE_EFFORT_LEVEL` | Opus reasoning effort (low/medium/high) |
| `DISABLE_PROMPT_CACHING` | Disable prompt caching |
| `ANTHROPIC_BASE_URL` | Custom API endpoint / LLM gateway |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | Enable agent teams feature |

### Permission Modes

```
--permission-mode <mode>    acceptEdits | bypassPermissions | default | delegate | dontAsk | plan
```

---

## CLI Flags (Relevant to Mycelium Dispatch)

| Flag | Used By Mycelium | Purpose |
|------|-----------------|---------|
| `-p` | Yes | Print mode, non-interactive |
| `--model <alias\|id>` | Yes | Set model for session |
| `--dangerously-skip-permissions` | Yes | Skip all permission prompts |
| `--resume <sessionId>` | Yes (retry) | Resume previous session |
| `--output-format json` | **Should use** | Structured output with token counts |
| `--fallback-model <model>` | **Should use** | Auto-fallback on overload |
| `--max-budget-usd <amount>` | **Should use** | Spending cap per task |
| `--no-session-persistence` | **Should use** | Don't save session files |
| `--max-turns <n>` | No | Limit agentic turns |
| `--system-prompt <text>` | No | Override system prompt |
| `--append-system-prompt <text>` | No | Append to system prompt |
| `--effort <level>` | No | Opus reasoning effort |
| `-d, --debug [filter]` | No | Enable debug mode |

---

## Mycelium Integration

### Current Adapter (UPDATED 2026-02-11)

`packages/server/src/agents/adapters/claude.ts`:

```typescript
export const claudeAdapter: AgentAdapter = {
  id: 'claude',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, sessionId } = options
    return [
      ...(sessionId ? ['--resume', sessionId] : ['-p', prompt]),
      ...(model ? ['--model', model] : []),
      '--dangerously-skip-permissions',
    ]
  },

  buildEnv(options: AdapterOptions): Record<string, string> {
    // If provider is explicitly set (e.g. task created with provider: "anthropic"),
    // keep ANTHROPIC_API_KEY so the CLI uses API key auth (pay-per-token).
    // Otherwise strip it so the CLI falls back to subscription auth (Max plan).
    if (options.provider) {
      return {}
    }
    return { ANTHROPIC_API_KEY: '' }
  },
}
```

### Issues Status

| Issue | Status | Notes |
|-------|--------|-------|
| ANTHROPIC_API_KEY leak | **FIXED** | Stripped in buildEnv unless provider explicit |
| No --output-format json | Open | Would give exact token counts + cost_usd |
| No --fallback-model | Open | Auto-fallback on model overload |
| No --max-budget-usd | Open | Spending cap for API key mode |
| No --no-session-persistence | Open | Session files accumulate |
| Credit balance error not detected | **FIXED** | Added to health.ts extractError() |
| Rate limit error not detected | **FIXED** | Added to health.ts extractError() |

### Fallback Chain (in fallback.ts)

```
haiku -> sonnet -> opus -> null
```

Cross-agent fallback: `claude -> codex (gpt-5.2-codex)`

### Model ID Mapping (Mycelium -> Claude CLI)

| Mycelium model | Claude CLI --model |
|----------------|-------------------|
| `sonnet` | `sonnet` |
| `opus` | `opus` |
| `haiku` | `haiku` |

No translation needed - aliases work directly.

---

## Billing Classification

| Auth Mode | Mycelium Billing Type | Cost Tracking |
|-----------|----------------------|---------------|
| Subscription (Pro/Max) | `subscription` | `cost_usd = 0` |
| API Key | `per_use` | Available via `--output-format json` `cost_usd` field |
| Bedrock | `per_use` | Via AWS billing |
| Vertex | `per_use` | Via GCP billing |

### API Key Pricing (If Used)

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Opus 4.6 | $15.00 | $75.00 |
| Sonnet 4.5 | $3.00 | $15.00 |
| Haiku 4.5 | $0.80 | $4.00 |

### Prompt Cache Behavior

Claude Code aggressively caches system prompts, CLAUDE.md contents, and file contents:
- Two tiers: `ephemeral_5m_input_tokens` (5-min) and `ephemeral_1h_input_tokens` (1-hour)
- Cache reads vastly outnumber actual input tokens

---

## Validation Checklist

- [x] `claude --version` returns 2.1.39
- [x] `ANTHROPIC_API_KEY="" claude -p "hello" --model haiku --dangerously-skip-permissions` completes (subscription auth)
- [x] Without `ANTHROPIC_API_KEY` in env, CLI uses subscription
- [x] With `ANTHROPIC_API_KEY` in env, CLI uses API key ("Credit balance is too low")
- [x] Adapter strips ANTHROPIC_API_KEY by default
- [x] Adapter keeps ANTHROPIC_API_KEY when provider explicitly set
- [ ] `--output-format json` returns token counts in `-p` mode
- [ ] `--fallback-model` works in print mode
- [ ] `--max-budget-usd` stops execution at limit
