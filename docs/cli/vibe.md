# Vibe CLI (Mistral) - Agent Decomposition

**CLI:** `vibe`
**Version:** 2.1.0 (PyPI package `mistral-vibe` 2.0.2)
**Vendor:** Mistral AI
**Install:** `uv tool install mistral-vibe` (Python, auto-updates via built-in updater)
**Binary:** `~/.local/bin/vibe` -> `~/.local/share/uv/tools/mistral-vibe/bin/vibe`
**Runtime:** Python 3.13 (uv-managed virtualenv)
**Config dir:** `~/.vibe/`
**Source:** `~/.local/share/uv/tools/mistral-vibe/lib/python3.13/site-packages/vibe/`

---

## Authentication

### Auth Flow

Vibe uses `MISTRAL_API_KEY` env var for authentication against `https://api.mistral.ai/v1`.

**Key lookup order** (in `config.py` / `cli.py`):

1. `load_dotenv_values()` loads `~/.vibe/.env` into `os.environ` (dotenv format, `MISTRAL_API_KEY=...`)
2. `VibeConfig._check_api_key()` validates the active model's provider has its `api_key_env_var` in `os.environ`
3. If key missing: interactive mode triggers `run_onboarding()` TUI; programmatic mode (`-p`) raises `MissingAPIKeyError`

The onboarding TUI saves the key to `~/.vibe/.env` via `python-dotenv.set_key()`.

### Providers

Vibe supports multiple providers via TOML config:

| Provider | API Base | Backend | Key Env Var |
|----------|----------|---------|-------------|
| `mistral` (default) | `https://api.mistral.ai/v1` | `mistral` | `MISTRAL_API_KEY` |
| `llamacpp` | `http://127.0.0.1:8080/v1` | `generic` | (none) |
| Custom | Any OpenAI-compatible | `generic` | Configurable |

Backend types: `mistral` (uses `mistralai` SDK) and `generic` (uses `httpx` with OpenAI-compatible API).

### Env Var Poisoning Risk

**Current risk:** Low. The adapter sets `MISTRAL_API_KEY` explicitly from `~/.config/mk-agent/` sources. However, our `~/.config/mk-agent/env` has `MISTRAL_API_KEY` which gets inherited via `process.env` in dispatch.ts (line 143: `{ ...process.env, ...env, ...extraEnv }`). Since vibe is a subscription-free per-token service, there's no conflict -- the key IS meant for API access. But the adapter has a file path bug (see Adapter Issues below).

**`~/.vibe/.env` poisoning:** Vibe's `load_dotenv_values()` loads `~/.vibe/.env` which **overrides** existing env vars (as of v2.0.2 changelog: "Variables defined in the .env file in your global .vibe folder now override environment variables"). If a malicious `.env` file is placed in `~/.vibe/`, it could redirect API calls. This is local-machine only.

---

## Models

### Default Models (Built-in)

| Alias | Full Model ID | Provider | Input $/M | Output $/M |
|-------|---------------|----------|-----------|------------|
| `devstral-2` (default) | `mistral-vibe-cli-latest` | mistral | $0.40 | $2.00 |
| `devstral-small` | `devstral-small-latest` | mistral | $0.10 | $0.30 |
| `local` | `devstral` | llamacpp | Free | Free |

Default active model: `devstral-2` (alias for `mistral-vibe-cli-latest`).

### Model Selection

Models are selected via `active_model` in config.toml. There is **no `--model` CLI flag**. To change models:

```toml
# ~/.vibe/config.toml
active_model = "devstral-small"
```

Or add custom models:

```toml
[[models]]
name = "codestral-latest"
provider = "mistral"
alias = "codestral"
temperature = 0.2
input_price = 0.3
output_price = 0.9
```

### Mycelium Model Handling

Since vibe has no `--model` CLI flag, the adapter cannot pass model selection at dispatch time. The `model` field in task config is ignored for vibe. The default model is whatever `active_model` is set to in `~/.vibe/config.toml`.

---

## CLI Flags & Modes

### Full Flag Reference

```
vibe [PROMPT]                       # Interactive TUI with optional initial prompt
vibe -p "prompt"                    # Programmatic mode (headless, auto-approve)
vibe -p "prompt" --output text      # Output: final text response (default)
vibe -p "prompt" --output json      # Output: all messages as JSON array
vibe -p "prompt" --output streaming # Output: NDJSON (newline-delimited JSON per message)
vibe -p "prompt" --max-turns N      # Limit assistant turns (programmatic only)
vibe -p "prompt" --max-price 0.50   # Cost cap in dollars (programmatic only)
vibe --agent auto-approve           # Use specific agent profile
vibe --agent NAME                   # Custom agent from ~/.vibe/agents/NAME.toml
vibe --workdir /path/to/dir         # Set working directory
vibe --enabled-tools "bash*"        # Enable specific tools (glob/regex)
vibe -c / --continue                # Resume most recent session
vibe --resume SESSION_ID            # Resume specific session (partial match)
vibe --setup                        # Run API key setup wizard
vibe --version                      # Print version
```

### Key Behaviors

- **`-p` flag** = programmatic mode. Auto-approves all tools, outputs response, exits. Uses `auto-approve` agent profile by default.
- **Positional `PROMPT`** = interactive TUI mode with initial prompt. Does NOT auto-approve.
- **stdin pipe** = `echo "prompt" | vibe -p` reads from stdin when not a TTY.
- **`--enabled-tools`** in `-p` mode disables all other tools. In interactive mode, adds to enabled set.

### Agent Profiles (Built-in)

| Name | Safety | Description |
|------|--------|-------------|
| `default` | Neutral | Requires approval for tool executions |
| `plan` | Safe | Read-only, exploration and planning only |
| `accept-edits` | Destructive | Auto-approves file edits only |
| `auto-approve` | YOLO | Auto-approves all tool executions |
| `explore` | Safe | Read-only subagent (grep + read_file only) |

Custom agents: create `~/.vibe/agents/NAME.toml` files with overrides.

---

## Output Format

### Text Mode (`--output text`, default)

- **stdout:** Final assistant text response only. Clean, no framing.
- **stderr:** Empty in programmatic mode (no progress indicators).
- **Exit codes:** `0` = success, `1` = error.

Example:
```
$ vibe -p "What is 2+2?" --output text
4
```

### JSON Mode (`--output json`)

Writes to **stdout** a JSON array of all LLM messages (including tool calls) after completion:

```json
[
  {
    "role": "user",
    "content": "What is 2+2?",
    "message_id": "uuid"
  },
  {
    "role": "assistant",
    "content": "4",
    "message_id": "uuid"
  }
]
```

Each message has: `role`, `content`, `reasoning_content` (if present), `tool_calls` (if present), `name`, `tool_call_id`, `message_id`.

### Streaming Mode (`--output streaming`)

Writes to stdout NDJSON (one JSON object per line per message):

```
{"role":"user","content":"What is 2+2?","message_id":"uuid"}
{"role":"assistant","content":"4","message_id":"uuid"}
```

### Token Counting

Text mode does NOT output token counts. Token counts are tracked internally in `AgentStats`:
- `session_prompt_tokens`, `session_completion_tokens` (cumulative)
- `last_turn_prompt_tokens`, `last_turn_completion_tokens` (per-turn)

To get token counts: use `--output json` and parse the message array length + content sizes, or `--output streaming` and count messages.

Cost is estimated from token counts and model pricing in `AgentStats.session_cost`.

---

## Config Files

### `~/.vibe/` (Global Config Dir)

| File | Purpose |
|------|---------|
| `config.toml` | Main config (model, providers, tools, MCP servers) |
| `.env` | API keys (dotenv format, loaded into env) |
| `vibehistory` | Command history |
| `trusted_folders.toml` | Per-folder trust decisions |
| `update_cache.json` | Latest version check cache |
| `vibe.log` | Debug log |
| `logs/session/` | Session logs directory |
| `tools/` | Custom tool definitions |
| `skills/` | Custom skills (markdown frontmatter) |
| `agents/` | Custom agent profiles (TOML) |
| `prompts/` | Custom system prompts (markdown) |

### `.vibe/` (Project-Level)

When a folder is trusted, vibe checks for `.vibe/` subdirectory in the project root:

| File | Purpose |
|------|---------|
| `.vibe/config.toml` | Project-specific config overrides |
| `.vibe/tools/` | Project-specific custom tools |
| `.vibe/skills/` | Project-specific skills |
| `.vibe/agents/` | Project-specific agent profiles |
| `.vibe/prompts/` | Project-specific system prompts |

### `VIBE_HOME` env var

Override the global config dir location: `export VIBE_HOME=/custom/path`

### Config Structure (TOML)

```toml
active_model = "devstral-2"
textual_theme = "terminal"
vim_keybindings = false
auto_approve = false
system_prompt_id = "cli"
api_timeout = 720.0
auto_compact_threshold = 200000
include_commit_signature = true
include_model_info = true
include_project_context = true
enable_update_checks = true
enable_auto_update = true

[session_logging]
enabled = true
session_prefix = "session"

[project_context]
max_chars = 40000
max_depth = 3
max_files = 1000
timeout_seconds = 2.0

[[providers]]
name = "mistral"
api_base = "https://api.mistral.ai/v1"
api_key_env_var = "MISTRAL_API_KEY"
backend = "mistral"

[[models]]
name = "mistral-vibe-cli-latest"
provider = "mistral"
alias = "devstral-2"
input_price = 0.4
output_price = 2.0

# MCP servers
[[mcp_servers]]
name = "my-server"
transport = "stdio"
command = "npx"
args = ["-y", "@my/mcp-server"]

[[mcp_servers]]
name = "http-server"
transport = "streamable-http"
url = "https://example.com/mcp"
```

### VIBE_* Environment Variables

Any config key can be overridden via `VIBE_` prefix: `VIBE_ACTIVE_MODEL=devstral-small`.

Settings priority: CLI args > env vars (`VIBE_*`) > TOML config > defaults.

---

## Session Management

### Storage

Sessions stored in `~/.vibe/logs/session/` as directories:

```
session_20260204_211503_902fca1f/
  meta.json       # Session metadata (stats, config, git info, tools)
  messages.jsonl  # Message log (one JSON object per line)
```

Directory naming: `{prefix}_{YYYYMMDD}_{HHMMSS}_{session_id[:8]}`

### Resume

```bash
vibe -c                      # Continue most recent session
vibe --resume abc123         # Resume by partial session ID match
```

Resume loads previous messages (excluding system messages) into the agent loop. Works in both interactive and programmatic modes.

### Metadata

`meta.json` includes:
- `session_id`, `start_time`, `end_time`
- `git_commit`, `git_branch`, `username`
- `stats` (tokens, steps, cost, tool calls)
- `title` (first 50 chars of first user message)
- `total_messages`
- `tools_available` (tool schemas)
- `config` (full VibeConfig dump)
- `agent_profile` (name + overrides)
- `system_prompt`

---

## Built-in Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands |
| `read_file` | Read file contents |
| `write_file` | Write/create files |
| `search_replace` | Search and replace in files |
| `grep` | Search file contents |
| `todo` | Task tracking |
| `task` | Subagent task delegation |
| `ask_user_question` | Ask the user a question |

### Tool Permissions

Configurable per-tool in config.toml:

```toml
[tools.write_file]
permission = "always"  # always | ask | never
```

### Custom Tools

Place Python files in `~/.vibe/tools/` or `.vibe/tools/` (project-level).

---

## MCP Support

**Yes, vibe supports MCP.** Three transport types:

1. **stdio** - Spawn process, communicate via stdin/stdout
2. **http** - HTTP-based MCP protocol
3. **streamable-http** - Streamable HTTP transport

Configuration in `config.toml` `[[mcp_servers]]` sections (see Config Structure above).

MCP tools appear with server name prefix (e.g., `myserver_tool_name`).

Features:
- Startup timeout (default 10s)
- Tool execution timeout (default 60s)
- API key injection via `api_key_env`, `api_key_header`, `api_key_format`
- Server prompt appended to tool descriptions

---

## ACP Support

Vibe includes an ACP (Agent Client Protocol) mode via `vibe-acp` binary. This is a separate entrypoint for running vibe as an ACP-compatible agent server. Currently not used by mycelium dispatch.

```bash
vibe-acp          # Run in ACP mode
vibe-acp --setup  # Setup API key
```

---

## Error Patterns

### HTTP Error Handling (from `llm/exceptions.py`)

| HTTP Status | Error Message | Mycelium Health Detection |
|-------------|---------------|---------------------------|
| 401 Unauthorized | "Invalid API key. Please check your API key and try again." | `extractError()`: checks for `MISTRAL_API_KEY` or `Unauthorized` |
| 429 Too Many Requests | "Rate limit exceeded. Please wait a moment before trying again." | Standard rate limit pattern |
| Other errors | Structured error with provider, status, request_id, model, payload summary | Generic error extraction |

### Error Classes

- `BackendError` - LLM API errors (HTTP failures, rate limits, auth)
- `MissingAPIKeyError` - API key not found in environment
- `MissingPromptFileError` - Custom system prompt file not found
- `WrongBackendError` - Backend type mismatch (mistral vs generic)
- `ConversationLimitException` - Max turns or max price exceeded
- `RateLimitError` - Rate limit exceeded (separate from BackendError)
- `ToolError` - Tool execution failure
- `ToolPermissionError` - Tool permission denied

### Stderr Error Patterns

```
# Auth failure
Error: Missing MISTRAL_API_KEY environment variable for mistral provider

# Rate limit
Rate limits exceeded. Please wait a moment before trying again.

# Programmatic mode, no prompt
Error: No prompt provided for programmatic mode

# Cost limit
Session will be interrupted if cost exceeds this limit.
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (auth, runtime, tool failure) |
| 124 | Timeout (synthetic, from dispatch.ts timeout handler) |

---

## Billing

### Mistral API (Default Provider)

- **Billing:** Per-token via Mistral API credits
- **Pricing:** Depends on model (devstral-2: $0.40/$2.00 per million input/output tokens)
- **Free tier:** None for API access (requires paid API key)
- **Cost tracking:** `--max-price` flag caps session cost; `AgentStats.session_cost` estimated from token counts

### Local Models (llamacpp)

- **Billing:** Free (self-hosted)
- **Requirements:** `llama-server` running on `localhost:8080` with a Devstral model

### Quota Detection

No specific quota tracking in mycelium for vibe. The `health.ts` checks for `MISTRAL_API_KEY` in error output and `Unauthorized` for the vibe agent specifically (line 296).

---

## Fallback Chain

From `fallback.ts`:

- **Vibe has no in-agent fallback models** (no model escalation chain - model is fixed in config.toml)
- **Cross-agent fallback:** `vibe` -> `cline` with model `mistralai/devstral-2512` (same Mistral backend via OpenRouter)

---

## Middleware Pipeline

Vibe uses a middleware pipeline for conversation control:

| Middleware | Purpose |
|------------|---------|
| `TurnLimitMiddleware` | Enforce `--max-turns` |
| `PriceLimitMiddleware` | Enforce `--max-price` |
| `AutoCompactMiddleware` | Auto-compact at 200K tokens |
| `ContextWarningMiddleware` | Warn at 50% context usage |
| `PlanAgentMiddleware` | Inject read-only reminder for plan agent |

---

## Adapter Analysis

### Current Adapter (`adapters/vibe.ts`)

```typescript
buildArgs(options: AdapterOptions): string[] {
  return ['-p', prompt, '--output', 'text']
}

buildEnv(): Record<string, string> {
  const keyPath = join(homedir(), '.config', 'mk-agent', 'MISTRAL_API_KEY')
  // Reads MISTRAL_API_KEY from individual file
}
```

### Issues Found

1. **BUG: Wrong credential file path.** The adapter reads `~/.config/mk-agent/MISTRAL_API_KEY` as a file, but this file does NOT exist. The key is in `~/.config/mk-agent/env` (the main env file). This is inconsistent with `credentials.ts` which correctly parses the `env` file first. The key currently works because `process.env` at line 143 of `dispatch.ts` likely inherits `MISTRAL_API_KEY` from the server's environment (if it was exported in the shell), but this is fragile.

   **Fix:** Use `getCredential('MISTRAL_API_KEY')` from `credentials.ts`:
   ```typescript
   import { getCredential } from '../credentials'

   buildEnv(): Record<string, string> {
     const env: Record<string, string> = {}
     const key = getCredential('MISTRAL_API_KEY')
     if (key) env.MISTRAL_API_KEY = key
     return env
   }
   ```

2. **Missing `--workdir` flag.** The adapter doesn't pass `--workdir` to vibe. Vibe supports `--workdir DIR` which sets the working directory. Currently, `dispatch.ts` sets `cwd` on the spawn config, which achieves the same effect, so this is cosmetic -- but `--workdir` also affects project context loading (trusted folders, `.vibe/` config).

3. **Missing `--max-turns` and `--max-price`.** For cost control, the adapter should pass `--max-turns` and `--max-price` to prevent runaway sessions. Without these, vibe runs until the default `api_timeout` (720s = 12 minutes).

4. **No model selection possible.** Vibe has no `--model` flag. The active model is determined by `~/.vibe/config.toml`. The `model` field from task config is silently ignored. This is a known limitation.

5. **No JSON output parsing.** The adapter uses `--output text` which doesn't provide token counts. Using `--output json` would give full message history with tool calls, but requires parsing the JSON array to extract the final response.

6. **Missing `postProcessOutput`.** Vibe output is clean in `-p` mode (no banners, no progress), so this is not needed. However, if the model produces tool calls in text output, they're not visible.

7. **No `--enabled-tools` filtering.** In `-p` mode, `--enabled-tools` can restrict which tools vibe uses. Not currently leveraged.

### Recommended Adapter Improvements

```typescript
import { getCredential } from '../credentials'
import type { AgentAdapter, AdapterOptions } from './types'

export const vibeAdapter: AgentAdapter = {
  id: 'vibe',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt } = options
    return [
      '-p', prompt,
      '--output', 'text',
      '--max-turns', '50',
      '--max-price', '1.00',
    ]
  },

  buildEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    const key = getCredential('MISTRAL_API_KEY')
    if (key) env.MISTRAL_API_KEY = key
    return env
  },
}
```

---

## Validation Checklist

| Check | Status | Notes |
|-------|--------|-------|
| Binary found | OK | `~/.local/bin/vibe` -> uv tool |
| Version detected | OK | `vibe --version` = 2.1.0 |
| Help output | OK | Full flag reference available |
| Auth mechanism | OK | `MISTRAL_API_KEY` env var via `~/.vibe/.env` or env |
| Programmatic mode | OK | `vibe -p "prompt" --output text` |
| JSON output | OK | `--output json` gives full message array |
| Streaming output | OK | `--output streaming` gives NDJSON |
| Session resume | OK | `-c` / `--resume SESSION_ID` |
| MCP support | OK | stdio, http, streamable-http transports |
| ACP support | OK | Separate `vibe-acp` binary |
| Cost control | OK | `--max-turns N`, `--max-price $` |
| Config location | OK | `~/.vibe/config.toml` |
| Adapter credential loading | BUG | Reads wrong file path; should use `credentials.ts` |
| Model selection at dispatch | N/A | No `--model` flag; config.toml only |
| Token counting | N/A | Not in text output; available in JSON mode |
| Error detection | OK | `health.ts` checks for MISTRAL_API_KEY and Unauthorized |
| Fallback chain | OK | vibe -> cline (same Mistral backend via OpenRouter) |
| Workspace trust | OK | Trust dialog skipped in `-p` mode |
| Auto-update | OK | Built-in PyPI version check + auto-update |

---

## Internal Architecture

### Process Flow (Programmatic Mode)

```
entrypoint.main()
  -> parse_arguments()
  -> unlock_config_paths()
  -> cli.run_cli(args)
    -> load_dotenv_values()          # Load ~/.vibe/.env into os.environ
    -> bootstrap_config_files()      # Create default config.toml if missing
    -> VibeConfig.load()             # Load config, validate API key
    -> run_programmatic()
      -> AgentLoop(config, agent_name="auto-approve")
      -> agent_loop.act(prompt)      # async generator
        -> middleware.run_before_turn()
        -> build system prompt
        -> call LLM (Mistral SDK or generic httpx)
        -> process tool calls
        -> middleware.run_after_turn()
      -> formatter.finalize()        # Return final text
```

### Key Files

| File | Purpose |
|------|---------|
| `cli/entrypoint.py` | Arg parsing, trust check, workdir setup |
| `cli/cli.py` | Main CLI flow, config loading, mode routing |
| `core/config.py` | VibeConfig (pydantic-settings), providers, models |
| `core/programmatic.py` | Headless execution wrapper |
| `core/agent_loop.py` | Main agent loop (LLM calls, tool execution) |
| `core/middleware.py` | Turn limits, cost limits, auto-compact |
| `core/output_formatters.py` | Text, JSON, Streaming output formatters |
| `core/llm/backend/mistral.py` | Mistral SDK backend |
| `core/llm/backend/generic.py` | OpenAI-compatible generic backend |
| `core/llm/exceptions.py` | BackendError, error parsing |
| `core/session/session_logger.py` | Session persistence |
| `core/session/session_loader.py` | Session loading and resume |
| `core/tools/mcp.py` | MCP server integration |
| `core/tools/builtins/` | Built-in tools (bash, read_file, etc.) |
| `core/skills/manager.py` | Skill discovery and management |
| `core/agents/models.py` | Agent profiles (default, plan, auto-approve) |
| `core/system_prompt.py` | System prompt assembly with project context |
| `core/paths/global_paths.py` | VIBE_HOME, log dirs, config paths |
| `core/paths/config_paths.py` | Project-local config resolution |
| `setup/onboarding/` | First-run API key setup TUI |
| `acp/` | Agent Client Protocol mode |
