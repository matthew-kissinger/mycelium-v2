# Cursor CLI (Agent) - Agent Decomposition

**CLI:** `agent` (alias `cursor` at `~/.local/bin/cursor`)
**Version:** 2026.01.28-fd13201
**Vendor:** Anysphere (`@anysphere/agent-cli-runtime`)
**Install:** Native (auto-updates via `agent update`)
**Binary:** `~/.local/bin/agent` -> `~/.local/share/cursor-agent/versions/2026.01.28-fd13201/cursor-agent`
**Runtime:** Bundled Node.js + webpack-bundled JS (`index.js` ~6MB + chunks)
**Config dir:** `~/.cursor/` (chats, projects, MCP, skills) + `~/.config/cursor/` (auth)
**Package:** `@anysphere/agent-cli-runtime` (private, no source published)

---

## Authentication Modes

Cursor CLI authenticates via Cursor's OAuth system. API key mode is also available for programmatic access.

| Mode | Detection | Billing | Rate Limits |
|------|-----------|---------|-------------|
| **Cursor OAuth (Login)** | `agent login` via browser | Cursor subscription (Pro/Business/Enterprise) | Tiered by plan |
| **API Key** | `--api-key <key>` flag or `CURSOR_API_KEY` env var | Cursor API billing | Unknown |

### Priority

1. `--api-key` CLI flag (highest)
2. `CURSOR_API_KEY` env var
3. OAuth login token (stored at `~/.config/cursor/auth.json`)

If `--api-key` or `CURSOR_API_KEY` is set with an invalid key, the CLI warns:
```
Warning: The provided API key is invalid.
Please check you have the right key, create a new one, or authenticate without it.
```

### Current Auth

```
User: redacted@example.com
Auth: OAuth (via Google)
Token: ~/.config/cursor/auth.json (JWT with accessToken + refreshToken)
Plan: Cursor subscription
```

### Auth Config Locations

| Path | Purpose |
|------|---------|
| `~/.config/cursor/auth.json` | OAuth access/refresh tokens (JWT) |
| `~/.cursor/cli-config.json` | CLI configuration (large, ~200KB) |
| `~/.cursor/argv.json` | VS Code-style argv config |

### Env Var Poisoning Analysis

**NO POISONING ISSUE.** The Cursor CLI uses its own `CURSOR_API_KEY` env var (not currently set in our environment). Unlike Claude Code (where `ANTHROPIC_API_KEY` silently overrides subscription auth), Cursor ignores all other provider API keys:

- `ANTHROPIC_API_KEY` in env: **IGNORED** by cursor CLI (no effect)
- `OPENAI_API_KEY` in env: **IGNORED** by cursor CLI (no effect)
- `GOOGLE_API_KEY` in env: **IGNORED** by cursor CLI (no effect)
- `CURSOR_API_KEY` in env: **NOT SET** in `~/.config/mk-agent/env` - no risk

The `CURSOR_API_KEY` is the only env var that affects auth. Since it is not in our env file, the CLI always uses the OAuth login token. The adapter's `buildEnv()` returns `{}` which is correct - no defensive stripping needed.

**Env vars found in source (CURSOR_\* prefix):**

| Variable | Purpose |
|----------|---------|
| `CURSOR_API_KEY` | API key for authentication (alternative to `--api-key`) |
| `CURSOR_INVOKED_AS` | Set by launcher script to track invocation method |
| `CURSOR_RULES` | Related to cursor rules loading |
| `CURSOR_WORKER_LABELS_FILE` | Cloud worker labels configuration |
| `CURSOR_PERSONAL` | Unclear (internal flag) |
| `CURSOR_*_SSH` | SSH-related flags (FORCE_SSH, ASSUME_SSH, CLI variants) |
| `NO_OPEN_BROWSER` | Disable browser opening during `agent login` |

---

## Models

### Available Models (from `agent models`, February 2026)

| Model ID | Display Name | Notes |
|----------|-------------|-------|
| `auto` | Auto | Automatic model routing (current default) |
| `composer-1.5` | Composer 1.5 | Cursor's custom model |
| `composer-1` | Composer 1 | Cursor's custom model (older) |
| `gpt-5.3-codex` | GPT-5.3 Codex | Latest OpenAI |
| `gpt-5.3-codex-low` | GPT-5.3 Codex Low | Lower compute |
| `gpt-5.3-codex-high` | GPT-5.3 Codex High | Higher compute |
| `gpt-5.3-codex-xhigh` | GPT-5.3 Codex Extra High | Highest compute |
| `gpt-5.3-codex-fast` | GPT-5.3 Codex Fast | Speed-optimized |
| `gpt-5.3-codex-low-fast` | GPT-5.3 Codex Low Fast | |
| `gpt-5.3-codex-high-fast` | GPT-5.3 Codex High Fast | |
| `gpt-5.3-codex-xhigh-fast` | GPT-5.3 Codex Extra High Fast | |
| `gpt-5.2` | GPT-5.2 | |
| `gpt-5.2-codex` | GPT-5.2 Codex | |
| `gpt-5.2-codex-high` | GPT-5.2 Codex High | |
| `gpt-5.2-codex-low` | GPT-5.2 Codex Low | |
| `gpt-5.2-codex-xhigh` | GPT-5.2 Codex Extra High | |
| `gpt-5.2-codex-fast` | GPT-5.2 Codex Fast | |
| `gpt-5.2-codex-high-fast` | GPT-5.2 Codex High Fast | |
| `gpt-5.2-codex-low-fast` | GPT-5.2 Codex Low Fast | |
| `gpt-5.2-codex-xhigh-fast` | GPT-5.2 Codex Extra High Fast | |
| `gpt-5.1-codex-max` | GPT-5.1 Codex Max | |
| `gpt-5.1-codex-max-high` | GPT-5.1 Codex Max High | |
| `opus-4.6-thinking` | Claude 4.6 Opus (Thinking) | **Default model** |
| `gpt-5.2-high` | GPT-5.2 High | |
| `opus-4.6` | Claude 4.6 Opus | |
| `opus-4.5` | Claude 4.5 Opus | |
| `opus-4.5-thinking` | Claude 4.5 Opus (Thinking) | |
| `sonnet-4.5` | Claude 4.5 Sonnet | |
| `sonnet-4.5-thinking` | Claude 4.5 Sonnet (Thinking) | |
| `gpt-5.1-high` | GPT-5.1 High | |
| `gemini-3-pro` | Gemini 3 Pro | |
| `gemini-3-flash` | Gemini 3 Flash | Fastest, cheapest |
| `grok` | Grok | xAI |

### Model Families

| Family | Models | Provider |
|--------|--------|----------|
| Composer | `composer-1`, `composer-1.5` | Cursor (proprietary) |
| GPT-5.x | 20 variants (codex/high/low/fast combos) | OpenAI (via Cursor) |
| Claude | `opus-4.6`, `opus-4.6-thinking`, `opus-4.5`, `opus-4.5-thinking`, `sonnet-4.5`, `sonnet-4.5-thinking` | Anthropic (via Cursor) |
| Gemini | `gemini-3-pro`, `gemini-3-flash` | Google (via Cursor) |
| Grok | `grok` | xAI (via Cursor) |

### Invalid Model Error

```
Cannot use this model: nonexistent-model. Available models: auto, composer-1.5, ...
```

Exit code: 1. This error goes to stdout (not stderr).

---

## Output Format

### `--print` Mode (Non-Interactive)

The `--print` / `-p` flag enables headless mode with full tool access (read, write, bash). Required for mycelium dispatch.

### `--output-format text` (Default)

Plain text response to stdout. Clean, no metadata, no framing.

```
$ agent --print --output-format text --model gemini-3-flash "Reply with only: hello world"
hello world
```

- **stdout:** Assistant's final text response only
- **stderr:** Nothing in text mode
- **Exit code:** 0 = success, 1 = error

### `--output-format json`

Single JSON object after completion. **No token counts or cost information** (unlike Claude Code).

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 4876,
  "duration_api_ms": 4876,
  "result": "hello",
  "session_id": "f7781a85-6e96-4ac7-9614-57e99b215b9d",
  "request_id": "1692f789-3c4a-42c8-86ef-c9d8c6193fb4"
}
```

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"result"` | Always "result" for final output |
| `subtype` | `"success"` or `"error"` | Outcome |
| `is_error` | boolean | Whether an error occurred |
| `duration_ms` | number | Wall-clock time |
| `duration_api_ms` | number | API call time |
| `result` | string | The assistant's response text |
| `session_id` | string (UUID) | Session identifier (for `--resume`) |
| `request_id` | string (UUID) | Unique request ID |

**Missing vs Claude Code:** No `usage` field, no `cost_usd`, no `num_turns`, no `total_cost_usd`. Token tracking is not available via JSON output.

### `--output-format stream-json`

NDJSON streaming format. One JSON object per line, per event.

```jsonl
{"type":"system","subtype":"init","apiKeySource":"login","cwd":"/home/dev/mycelium-v2","session_id":"...","model":"Gemini 3 Flash","permissionMode":"default"}
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]},"session_id":"..."}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}]},"session_id":"..."}
{"type":"result","subtype":"success","duration_ms":1271,"duration_api_ms":1271,"is_error":false,"result":"...","session_id":"...","request_id":"..."}
```

**Stream event types:**

| Event Type | Subtype | Description |
|------------|---------|-------------|
| `system` | `init` | Session initialization (model, cwd, apiKeySource, permissionMode) |
| `user` | - | User message |
| `assistant` | - | Assistant response |
| `result` | `success` / `error` | Final result |

The `apiKeySource` in the init event indicates the auth method used:
- `"login"` = OAuth token
- `"api_key"` = `--api-key` flag or `CURSOR_API_KEY` env var (unconfirmed, inferred from source)

### `--stream-partial-output`

Only works with `--print` and `stream-json`. Streams individual text deltas as they arrive.

---

## Error Patterns

### Error Pattern Summary

| Error Type | Output | health.ts Match | Status |
|-----------|--------|-----------------|--------|
| Invalid model | `Cannot use this model: <model>. Available models: ...` | No specific match | **UNMATCHED** - falls to generic error extraction |
| Invalid API key | `Warning: The provided API key is invalid.` | Would match `API key` pattern (line 288) | Partial |
| Resource exhausted | `w: [resource_exhausted] Error` | No match | **UNMATCHED** |
| Rate limit (HTTP 429) | `resource_exhausted` (from source: HTTP 429 maps to this) | Would match generic `429` pattern (line 261) | Partial |
| Auth required | Interactive login prompt (blocks in --print mode) | No match | **UNMATCHED** |
| Raw mode error | `Raw mode is not supported on the current process.stdin` | No match | **UNMATCHED** (only in interactive commands like `ls`) |
| Timeout | `[TIMEOUT]` (synthetic from dispatch.ts) | Line 156 | Working |

### Observed Error: Resource Exhausted

When a model's resources are exhausted (seen with Gemini 3 Flash via Cursor), the output is:

```
w: [resource_exhausted] Error
```

This is NOT caught by health.ts. It would fall to the generic error line extractor.

### Recommended health.ts Additions

```typescript
// Cursor resource exhausted
if (output.includes('resource_exhausted') && agent === 'cursor') {
  return {
    error: 'Cursor resource exhausted',
    errorType: 'quota',
    quotaResetMs: 60000, // 1 min default backoff
  }
}

// Cursor invalid model
if (output.includes('Cannot use this model:') && agent === 'cursor') {
  return {
    error: output.match(/Cannot use this model: \S+/)?.[0] || 'Cursor invalid model',
    errorType: 'api_error',
  }
}

// Cursor API key invalid
if (output.includes('The provided API key is invalid') && agent === 'cursor') {
  return {
    error: 'Cursor API key invalid',
    errorType: 'api_error',
  }
}
```

---

## CLI Flags (Relevant to Mycelium Dispatch)

| Flag | Used By Mycelium | Purpose |
|------|-----------------|---------|
| `--print` / `-p` | **Yes** | Non-interactive mode with full tool access |
| `--output-format <format>` | **Yes** (`json`) | Output format: text, json, stream-json |
| `--model <model>` | **Yes** | Model selection |
| `--workspace <path>` | No | Set working directory (defaults to cwd) |
| `--force` / `-f` | No | Force allow commands unless explicitly denied |
| `--sandbox <mode>` | No | Enable/disable sandbox (enabled/disabled) |
| `--approve-mcps` | **Should use** | Auto-approve MCP servers in headless mode |
| `--api-key <key>` | No | API key auth (we use OAuth) |
| `-H, --header <header>` | No | Custom headers for requests |
| `--cloud` / `-c` | No | Cloud mode (composer picker) |
| `--mode <mode>` | No | Execution mode: plan (read-only), ask (Q&A) |
| `--plan` | No | Shorthand for `--mode=plan` |
| `--resume [chatId]` | No (but could) | Resume a specific chat session |
| `--continue` | No | Resume last chat session |
| `--stream-partial-output` | No | Stream text deltas (with stream-json) |

### Prompt Delivery

The prompt is passed as a **positional argument** (not stdin):

```bash
agent --print --output-format json --model <model> "the prompt text"
```

Multiple words are joined. Piped stdin also works but the positional arg is the standard method.

### Important: The `--force` Flag

The `--force` flag (`-f`) allows commands unless explicitly denied. This is different from Claude Code's `--dangerously-skip-permissions`. The cursor adapter does NOT currently use `--force`, which means tool approvals may block headless execution depending on the task.

---

## Session Management

### Session Storage

Sessions are stored in `~/.cursor/chats/<hash>/` directories:

```
~/.cursor/chats/
  3ebd734c725635ea9e7480f8f887746f/
  67aac31a69459e3808a70d67c1ee4c55/
  ...
```

Subdirectories correspond to chat sessions. The hash appears to be a project-specific identifier.

### Project-Specific Config

```
~/.cursor/projects/
  home-mkagent-mycelium-v2/           # Per-project settings
  home-mkagent-repos-<private-repo>/
  ...
```

Project directories use a path-to-slug convention (same as Claude Code but with dashes instead of dashes).

### Resume Mechanisms

| Command | Purpose |
|---------|---------|
| `agent --resume <chatId>` | Resume a specific session by chat ID |
| `agent --continue` | Resume the most recent session |
| `agent resume` | Resume latest session (subcommand form) |
| `agent ls` | List sessions (requires interactive terminal - fails in headless) |
| `agent create-chat` | Create a new empty chat and return its ID |

**Note:** `agent ls` requires a raw-mode terminal (uses Ink TUI framework) and crashes in non-interactive environments:
```
ERROR Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.
```

### Session ID in JSON Output

With `--output-format json`, the `session_id` is returned in the result object, enabling session resume without parsing.

---

## MCP Server Support

Cursor CLI has full MCP server support via the `agent mcp` subcommand.

### Configuration

MCP servers are configured in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] },
    "context7": { "command": "npx", "args": ["-y", "@context7/mcp@latest"] },
    "exa": { "command": "npx", "args": ["-y", "exa-mcp-server"], "env": { "EXA_API_KEY": "..." } },
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "..." } }
  }
}
```

### MCP Subcommands

| Command | Purpose |
|---------|---------|
| `agent mcp list` | List configured servers and status |
| `agent mcp list-tools <id>` | List tools for a server |
| `agent mcp enable <id>` | Approve a server |
| `agent mcp disable <id>` | Disable a server |
| `agent mcp login <id>` | Authenticate with an MCP server |

### MCP in Headless Mode

By default, unapproved MCP servers are not loaded in `--print` mode:
```
playwright: not loaded (needs approval)
```

Use `--approve-mcps` to auto-approve all MCP servers in headless mode. The current adapter does NOT pass this flag, so MCP tools are unavailable during dispatch.

---

## Cursor Skills

Skills are stored in `~/.cursor/skills-cursor/`:

```
create-rule/
create-skill/
create-subagent/
migrate-to-skills/
update-cursor-settings/
```

Skills are similar to Claude Code's skills but use Cursor's rule system.

---

## Cursor Rules

Generated via `agent generate-rule` (interactive). Rules can be project-level (`.cursor/rules/`) or user-level. No rules currently configured for this installation.

Rule sources (from source code env vars): `CURSOR_RULE_SOURCE_TEAM`, `CURSOR_RULE_SOURCE_USER`, `CURSOR_RULE_SOURCE_UNSPECIFIED`.

---

## Sandbox Mode

Cursor includes a native sandbox binary (`cursorsandbox`, ~4.3MB ELF binary) for isolating tool execution. Controlled via `--sandbox enabled|disabled`.

The adapter does not currently use `--sandbox disabled`, which means tasks may be sandboxed by default depending on Cursor's configuration.

---

## Binary Architecture

| Component | Size | Purpose |
|-----------|------|---------|
| `cursor-agent` | 800B | Bash launcher script |
| `node` | 129MB | Bundled Node.js binary |
| `index.js` | 6.3MB | Main application (webpack bundle) |
| `*.index.js` | ~14MB total | Code-split chunks |
| `cursorsandbox` | 4.3MB | Sandbox ELF binary |
| `rg` | 5.4MB | Bundled ripgrep for search |
| `merkle-tree-napi.node` | 4.3MB | Native addon (file hashing) |
| `node_sqlite3.node` | 1.9MB | Native SQLite addon (session storage) |
| `pty.node` | 73KB | Pseudo-terminal addon |
| `cursor-askpass` | 175B | Git credential helper |

Total installed size: ~165MB.

The `cursor-agent` launcher enables `NODE_COMPILE_CACHE` for faster startup and runs `node --use-system-ca index.js`.

---

## Billing Classification

| Auth Mode | Mycelium Billing Type | Cost Tracking |
|-----------|----------------------|---------------|
| Cursor OAuth (subscription) | `subscription` | `cost_usd = 0` |
| Cursor API Key | `per_use` (assumed) | Not available via JSON output |

### Subscription Tiers (Cursor)

All models are served through Cursor's proxy. Model access depends on the subscription tier. The CLI does not expose pricing or token usage.

No token counts are returned in any output format. Cost tracking requires external monitoring (Cursor dashboard).

---

## Current Adapter Analysis

### `packages/server/src/agents/adapters/cursor.ts`

```typescript
export const cursorAdapter: AgentAdapter = {
  id: 'cursor',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    return [
      '--print',
      '--output-format', 'json',
      ...(model ? ['--model', model] : []),
      prompt,
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}
```

### Issues Found

| Issue | Severity | Description |
|-------|----------|-------------|
| No `--force` flag | Medium | Without `--force`, the agent may prompt for tool approval in some scenarios, potentially blocking headless execution |
| No `--approve-mcps` flag | Low | MCP servers are not auto-approved - tools from MCP servers (playwright, context7, etc.) are unavailable |
| No `--workspace` flag | Low | Uses cwd for workspace, but could explicitly set `--workspace` for clarity when running in worktrees |
| Missing error patterns in health.ts | Medium | `resource_exhausted`, invalid model, and API key errors are not specifically caught |
| No `postProcessOutput` | Low | JSON output includes ANSI escape codes if the process writes to stderr before the JSON line |
| No session resume support | Low | Adapter could support `--resume` for retry scenarios |
| `buildEnv` returns empty | Correct | No env vars need stripping (unlike Claude's ANTHROPIC_API_KEY) |
| Prompt as positional arg | Correct | Works for short prompts, but very long prompts may hit OS arg length limits |

### Recommended Adapter Fixes

```typescript
export const cursorAdapter: AgentAdapter = {
  id: 'cursor',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, cwd } = options
    return [
      '--print',
      '--output-format', 'json',
      '--force',           // Auto-approve tool use
      '--approve-mcps',    // Auto-approve MCP servers
      ...(model ? ['--model', model] : []),
      ...(cwd ? ['--workspace', cwd] : []),
      prompt,
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}
```

### Fallback Chain (in fallback.ts)

```
gemini-3-flash -> composer-1
gpt-5.2-codex -> composer-1
sonnet-4.5 -> composer-1
composer-1 -> opus-4.6-thinking
opus-4.6-thinking -> null (top of chain)
```

**Note:** `fallback.ts` has `composer-1 -> composer-1.5 -> opus-4.6-thinking` but `seed-registry.ts` has `composer-1 -> opus-4.6-thinking` (missing `composer-1.5` step). This is a **data inconsistency** between the two files.

Cross-agent fallback: `cursor -> claude (sonnet)`

### Default Model

Configured as `opus-4.6-thinking` in both `fallback.ts` (`AGENT_DEFAULT_MODELS`) and `seed-registry.ts`.

### Model ID Mapping (Mycelium -> Cursor CLI)

| Mycelium model | Cursor CLI --model |
|----------------|-------------------|
| `opus-4.6-thinking` | `opus-4.6-thinking` |
| `composer-1` | `composer-1` |
| `composer-1.5` | `composer-1.5` |
| `gemini-3-flash` | `gemini-3-flash` |
| `sonnet-4.5` | `sonnet-4.5` |

No translation needed - model IDs pass through directly.

---

## Validation Checklist

- [x] `agent --version` returns `2026.01.28-fd13201`
- [x] `agent status` shows logged in as `redacted@example.com`
- [x] `agent models` lists 33 models
- [x] `agent about` shows system info
- [x] `agent --print --output-format json` returns valid JSON with session_id
- [x] `agent --print --output-format text` returns clean text
- [x] `agent --print --output-format stream-json` returns NDJSON with init/user/assistant/result events
- [x] `agent --print --force` works (no permission prompts)
- [x] `agent --workspace /tmp` overrides working directory
- [x] Invalid model produces clear error message (not JSON)
- [x] Invalid API key produces warning message
- [x] `agent mcp list` shows 4 configured servers
- [x] No `CURSOR_API_KEY` in env (no poisoning risk)
- [x] `agent --approve-mcps` flag exists for headless MCP approval
- [ ] Rate limit / quota error format (not triggered during testing)
- [ ] `--resume <sessionId>` works in headless mode
- [ ] `agent create-chat` returns usable chat ID
