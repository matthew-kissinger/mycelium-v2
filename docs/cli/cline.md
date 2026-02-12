# Cline CLI - Agent Decomposition

**CLI:** `cline`
**Version:** 2.2.0
**Vendor:** Cline Bot Inc. (Apache-2.0)
**Install:** `npm i -g cline`
**Binary:** `~/.npm-global/bin/cline` -> `~/.npm-global/lib/node_modules/cline/dist/cli.mjs`
**Config dir:** `~/.cline/data/`
**Log dir:** `~/.cline/logs/`
**Engine:** Node.js >= 20, single bundled `cli.mjs` (26 MB, esbuild)
**Package:** `cline` on npm (not `@anthropic-ai/cline`)

---

## Architecture

Cline CLI uses a two-process architecture:

1. **Host Bridge** (Go binary, `cline-host-*`): gRPC server providing workspace/env/diff services. Registers HealthService, WorkspaceService, WindowService, DiffService, EnvService.
2. **Core** (Node.js, `cline-core-*`): The actual agent. Loads prompt variants (Gemini 3.0, GPT-5, XS), initializes telemetry (PostHog + OpenTelemetry), connects to Host Bridge via gRPC.

The host bridge starts on a random port (e.g. `:44465`) and the core connects to it. Log files are named `cline-host-{date}-{host}-{port}.log` and `cline-core-{date}-{host}-{port}.log`.

### ACP Mode

`--acp` flag enables Agent Client Protocol mode for editor integration (VS Code extension equivalent). Not used by Mycelium.

### Telemetry

Cline sends telemetry to PostHog and an OTLP endpoint. Configured via `globalState.json`. Cannot be easily disabled via CLI flags.

---

## Authentication Modes

Cline supports multiple auth flows. **Interactive setup via `cline auth`.**

| Mode | Detection | Billing | Setup |
|------|-----------|---------|-------|
| **Cline Account** | OAuth sign-in via browser | Credits-based (pay-as-you-go) | `cline auth` -> "Sign in with Cline" |
| **ChatGPT Subscription** | OpenAI SSO | Subscription | `cline auth` -> "Sign in with ChatGPT Subscription" |
| **OpenRouter API Key** | Key in secrets.json | Pay-per-token | `cline auth -p openrouter -k <key>` |
| **Anthropic API Key** | Key in secrets.json | Pay-per-token | `cline auth -p anthropic -k <key>` |
| **OpenAI API Key** | Key in secrets.json | Pay-per-token | `cline auth -p openai-native -k <key>` |
| **Other Providers** | Per-provider API key | Varies | `cline auth -p <provider> -k <key>` |

### Supported Providers (from bundle analysis)

anthropic, openrouter, openai, google, azure, deepseek, bedrock, fireworks, mistral, vertex, together, groq, requesty, ollama, sambanova, cerebras, lmstudio, x-ai, cline (built-in account)

### Secrets Storage

Credentials stored in `~/.cline/data/secrets.json`:

```json
{
  "cline:clineAccountId": { "idToken": "...", "refreshToken": "...", "expiresAt": ..., "userInfo": {...} },
  "openRouterApiKey": "sk-or-v1-..."
}
```

The `idToken` auto-refreshes on startup (3 attempts, 5s timeout per attempt). Logs: `Token expired or expiring soon, attempting refresh`.

### Auth Priority

The active provider is set per-mode in `globalState.json`:
- `actModeApiProvider`: Provider used in act mode
- `planModeApiProvider`: Provider used in plan mode

Each provider has its own model field (e.g. `actModeOpenRouterModelId`, `actModeFireworksModelId`).

### Env Var Interaction

**OPENROUTER_API_KEY** in the shell environment (`~/.config/mk-agent/env`) does NOT override `secrets.json` - Cline reads keys from its own secrets file, not from env vars. This is different from Claude Code where `ANTHROPIC_API_KEY` overrides subscription auth.

However, the `OPENROUTER_API_KEY` env var IS visible to Cline's child processes and MCP servers.

---

## Models

### Provider-Specific Model IDs

Models are identified differently per provider. The `globalState.json` stores separate model IDs per provider/mode:

| Config Key | Example Value |
|-----------|---------------|
| `actModeOpenRouterModelId` | `moonshotai/kimi-k2.5` |
| `actModeFireworksModelId` | `accounts/fireworks/models/kimi-k2-instruct-0905` |

### OpenRouter Models (Primary for Mycelium)

Cline via OpenRouter supports any model on OpenRouter. Key models used by Mycelium:

| Short Name | OpenRouter Model ID | Cost (Input/Output per 1M) | Free? |
|-----------|-------------------|---------------------------|-------|
| `kimi-k2.5` | `moonshotai/kimi-k2.5` | Varies | No |
| `kimi-k2` | `moonshotai/kimi-k2-0905` | Varies | No |
| `deepseek-v3.2` | `deepseek/deepseek-v3.2` | Varies | No |
| `deepseek-r1` | `deepseek/deepseek-r1-0528` | Varies | No |
| `qwen3-coder` | `qwen/qwen3-coder` | Varies | No |
| `glm-4.7` | `z-ai/glm-4.7` | Varies | No |
| `glm-4.7-flash` | `z-ai/glm-4.7-flash` | Varies | No |
| `devstral` | `mistralai/devstral-2512` | Varies | No |

### CLI Model Flag

`-m <model>` / `--model <model>` sets the model for a task. The model ID format depends on the active provider.

### Cline Account Models

When using `cline` provider (Cline Account), the model is selected on their platform. Claims "access to the newest models as soon as they're available" including Opus 4.6.

---

## Output Format

### Default (Styled Text)

In default mode, Cline outputs an interactive TUI with spinners, progress bars, and styled text. Useless for headless dispatch - use `--json` instead.

### `--json` Mode (NDJSON)

With `--json`, Cline outputs newline-delimited JSON events to stdout:

```json
{"type":"task_started","taskId":"1770858773985"}
{"ts":1770858774000,"type":"say","say":"task","text":"echo hello","modelInfo":{...},"conversationHistoryIndex":-1}
{"ts":1770858775358,"type":"say","say":"api_req_started","text":"{\"request\":\"...\"}","modelInfo":{...}}
{"ts":1770858780578,"type":"say","say":"error_retry","text":"{\"attempt\":1,...}","modelInfo":{...}}
```

#### Event Types

| `type` | `say`/`ask` | Description |
|--------|-------------|-------------|
| `say` | `task` | Task prompt echoed back |
| `say` | `api_req_started` | API request sent (contains full request text) |
| `say` | `api_req_finished` | API response received |
| `say` | `text` | Assistant text output |
| `say` | `tool` | Tool use (file read/write/command) |
| `say` | `error_retry` | Auto-retry on error (attempt/maxAttempts/delay) |
| `say` | `completion_result` | Final result |
| `ask` | `resume_task` | Asking to resume (on error/interrupt) |

The `modelInfo` field in each event contains `{providerId, modelId, mode}`.

### Cost Tracking in JSON

Cost appears in `api_req_finished` events as part of task metadata (`tokensIn`, `tokensOut`, `totalCost`). Also visible in task history.

### Exit Behavior

- **Successful completion:** Outputs `completion_result` event, exits 0
- **Error with retry:** Outputs `error_retry` events (3 attempts, 2s delay), then `resume_task` ask
- **SIGTERM:** Outputs `SIGTERM received, shutting down...` to stderr, exits

---

## Non-Interactive / Headless Mode

### `--yolo` Flag

Enables auto-approval of all actions. Without this, Cline prompts for each file edit, command execution, etc. **Required for Mycelium dispatch.**

### `--timeout <seconds>`

Timeout for yolo mode (default: 600s = 10 minutes). The agent self-terminates after this.

### `--act` / `--plan`

Force a specific mode. Mycelium uses `--act` for execution tasks.

### `--json`

Output as NDJSON instead of styled TUI. Essential for parsing results programmatically.

### Recommended Headless Invocation

```bash
cline task "prompt" --yolo --act --json --timeout 900 --cwd /path/to/repo
```

---

## Session Management

### Task Storage

Each task gets a directory under `~/.cline/data/tasks/{taskId}/`:

```
~/.cline/data/tasks/{timestamp}/
  api_conversation_history.json    # Full API conversation (messages array)
  ui_messages.json                 # UI-formatted messages
  task_metadata.json               # Model usage, environment history
  settings.json                    # Task-specific settings (yoloModeToggled, etc.)
  focus_chain_taskid_{id}.md       # Focus chain document
```

### Task Metadata

```json
{
  "model_usage": [
    {"ts": 1770253651514, "model_id": "moonshotai/kimi-k2.5", "model_provider_id": "openrouter", "mode": "plan"},
    {"ts": 1770253667173, "model_id": "moonshotai/kimi-k2.5", "model_provider_id": "openrouter", "mode": "act"}
  ],
  "environment_history": [
    {"ts": ..., "os_name": "linux", "host_name": "Cline CLI", "host_version": "1.0.10", "cline_version": "3.52.0"}
  ]
}
```

Note: `cline_version` in metadata (3.52.0) differs from CLI version (2.2.0) - the core/extension has its own versioning.

### Task Resume

`-T <taskId>` / `--taskId <id>` resumes an existing task by its ID (timestamp-based).

### Task History

`cline history` shows interactive TUI list. `cline history -n 20 -p 2` for pagination. No JSON output mode for history.

### Checkpoints

Cline creates checkpoints in `~/.cline/data/checkpoints/{hash}/` for git-based undo/redo. Requires git in the workspace.

---

## MCP Support

Cline has built-in MCP support. Config: `~/.cline/data/settings/cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "playwright": {"command": "npx", "args": ["@playwright/mcp@latest"]},
    "context7": {"command": "npx", "args": ["-y", "@context7/mcp@latest"]},
    "exa": {"command": "npx", "args": ["-y", "exa-mcp-server"], "env": {"EXA_API_KEY": "..."}},
    "github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": {"GITHUB_TOKEN": "..."}}
  }
}
```

MCP servers start on each task. Failures are logged but non-fatal (`Failed to connect to new MCP server context7:`).

### Auto-Approval of MCP

In `globalState.json`, `autoApprovalSettings.actions.useMcp: true` allows MCP tool use without approval.

---

## Multi-Instance Pool (BROKEN)

### Current Implementation

`packages/server/src/agents/cline-instances.ts` manages up to 4 concurrent Cline instances using `cline instance new/list/kill` commands.

### Problem: Commands Removed in v2.x

The `instance` subcommand (`cline instance new`, `cline instance list`, `cline instance kill`) no longer exists in Cline CLI v2.2.0. The bundle contains zero matches for `instance new|list|kill`.

Similarly, `cline config set` and `cline config list -F plain` (used by the adapter for model switching) are not present in v2.2.0. The `config` command now only shows an interactive TUI.

### Impact on Mycelium

| Feature | Status | Effect |
|---------|--------|--------|
| `cline instance new` | **REMOVED** | `createClineInstance()` silently fails, falls back to `localhost:50052` |
| `cline instance list` | **REMOVED** | PID tracking broken |
| `cline instance kill` | **REMOVED** | `cleanupClineInstances()` is a no-op |
| `cline config set` | **REMOVED** | `switchClineModel()` silently fails |
| `cline config list -F plain` | **REMOVED** | `getClineConfig()` returns null |
| `--address` flag | **REMOVED** | Instance routing broken |

### Effective Behavior

Since all instance management fails silently, Cline currently runs as a single-instance agent. The pool creates no instances, acquires no addresses, and model switching via `config set` does nothing. Tasks still execute because the adapter falls through to spawning `cline task "prompt" --yolo --act` without the `--address` flag.

### Recommended Fix

1. Remove `cline-instances.ts` and all `--address` / `instance` references
2. Model switching: write directly to `~/.cline/data/globalState.json` (the actual config store)
3. Concurrent execution: spawn multiple `cline` processes with separate `--config <dir>` paths (each gets its own `globalState.json`)
4. Or: accept single-instance limitation and queue cline tasks

---

## Adapter Analysis

### Current Adapter (`packages/server/src/agents/adapters/cline.ts`)

```typescript
buildArgs(options: AdapterOptions): string[] {
  const { prompt, clineAddress } = options
  return [
    ...(clineAddress ? ['--address', clineAddress] : []),
    'task', 'new',        // BUG: 'new' is not a valid argument
    prompt,
    '--yolo',
    '--mode', 'act',      // BUG: '--mode' is not a flag, use '--act'
  ]
}
```

#### Issues Found

| Issue | Severity | Details |
|-------|----------|---------|
| `task new` instead of `task` | **High** | `new` is not a valid argument to `cline task`. The `new` is passed as part of the prompt. |
| `--mode act` instead of `--act` | **High** | `--mode` is not a flag. Should be `--act`. |
| `--address` flag removed | **Medium** | No longer exists in v2.2.0. Silently ignored or causes error. |
| No `--json` flag | **Medium** | Output is TUI-styled, not parseable. |
| No `--timeout` flag | **Low** | Relies on dispatch.ts timeout only (external kill). |
| No `--cwd` flag | **Low** | cwd set via spawn options, but `--cwd` would be more explicit. |
| Model switching via `config set` broken | **High** | Command removed. Models locked to whatever globalState has. |
| `CLINE_MODEL_MAP` hardcoded | **Low** | Should read from registry DB. |

#### Corrected `buildArgs`

```typescript
buildArgs(options: AdapterOptions): string[] {
  const { prompt, model } = options
  return [
    'task',
    prompt,
    '--yolo',
    '--act',
    '--json',
    '--timeout', '900',
    ...(model ? ['-m', model] : []),
  ]
}
```

### Model Switching

The adapter's `preSpawn()` calls `switchClineModel()` which runs `cline config set act-mode-api-provider=openrouter act-mode-open-router-model-id=<model>`. Since `config set` no longer exists:

**Alternative approaches:**
1. Direct file write to `~/.cline/data/globalState.json` (race-unsafe for concurrent tasks)
2. Use `cline auth -p openrouter -k <key> -m <modelId>` (works but resets auth each time)
3. Use the `-m <model>` flag on `cline task` directly (if it sets the model per-task)

### Resource Acquisition

`acquireResources()` calls `acquireClineInstance()` which tries `cline instance new` (removed). Falls back to `localhost:50052`. The returned address is set on `options.clineAddress` and passed as `--address` to buildArgs (also removed).

**Net effect:** The pool is dead code. Cline runs single-threaded through the default instance.

---

## Error Patterns

### Error Patterns in `health.ts`

| Error | Match Pattern | Type | Notes |
|-------|--------------|------|-------|
| Process crash | `Cleaning up core process` + `Cleaning up host process` | `crash` | Both processes cleaned up |
| Conversation error | `Conversation` + `error` | `api_error` | Generic conversation failure |
| OpenRouter rate limit | `rate limit` or `429` | `quota` | Shared with other agents |
| OpenRouter API key | `OPENROUTER_API_KEY` or `API key` | `api_error` | Missing/invalid key |
| Zombie/Orphan | `Zombie process` or `Orphaned` | `crash` | Process died unexpectedly |

### Additional Error Patterns (from JSON output)

| Error | JSON Event | Details |
|-------|-----------|---------|
| Auth failure (502) | `error_retry` | `Failed to authenticate request with Clerk` (bad model ID or provider) |
| Model not found | `error_retry` | Provider rejects unknown model ID |
| Credit exhaustion | `error_retry` | OpenRouter credit balance too low |
| Token refresh failure | Core log | `Token expired or expiring soon, attempting refresh` (Cline Account) |

### Auto-Retry Behavior

Cline has built-in retry: 3 attempts with 2s delay between each (`error_retry` events). After 3 failures, it emits `resume_task` ask and waits. In headless mode with SIGTERM, the process exits.

---

## Configuration

### Global State (`~/.cline/data/globalState.json`)

Primary configuration store. 51+ settings including:

| Key | Type | Description |
|-----|------|-------------|
| `actModeApiProvider` | string | Provider for act mode (`cline`, `openrouter`, etc.) |
| `actModeOpenRouterModelId` | string | OpenRouter model ID for act mode |
| `planModeApiProvider` | string | Provider for plan mode |
| `autoApprovalSettings` | object | Which actions are auto-approved |
| `autoCondenseThreshold` | number | Context window usage threshold for auto-condensation (0.75) |
| `backgroundEditEnabled` | boolean | Background file editing |
| `clineWebToolsEnabled` | boolean | Web browsing capability |
| `workspaceRoots` | array | Configured workspace paths |

### Settings Directory

```
~/.cline/data/settings/
  cli-default-instance.json     # Default gRPC instance address
  cline_mcp_settings.json       # MCP server configuration
```

### Auto-Approval Settings

```json
{
  "version": 29,
  "enabled": true,
  "maxRequests": 20,
  "actions": {
    "readFiles": true,
    "readFilesExternally": false,
    "editFiles": false,
    "editFilesExternally": false,
    "executeSafeCommands": true,
    "executeAllCommands": false,
    "useBrowser": false,
    "useMcp": true
  }
}
```

Note: `--yolo` overrides all approval settings.

### Skills Directory

`~/.cline/skills/` - currently empty. Skills are workflow templates.

---

## CLI Flags (Complete Reference)

| Flag | Used By Mycelium | Purpose |
|------|-----------------|---------|
| `task <prompt>` | Yes | Run a new task (subcommand) |
| `-y, --yolo` | Yes | Auto-approve all actions |
| `-a, --act` | **Should use** | Force act mode |
| `--json` | **Should use** | NDJSON output for parsing |
| `-m, --model <model>` | **Should use** | Set model per-task |
| `-t, --timeout <seconds>` | No (uses dispatch timeout) | Yolo mode timeout (default 600) |
| `-c, --cwd <path>` | No (uses spawn cwd) | Working directory |
| `--config <path>` | **Should use** | Config directory (enables concurrent instances) |
| `-T, --taskId <id>` | No | Resume existing task |
| `--thinking [tokens]` | No | Extended thinking (default 1024 budget) |
| `--reasoning-effort <level>` | No | none/low/medium/high/xhigh |
| `--max-consecutive-mistakes <n>` | No | Halt after N consecutive mistakes |
| `--double-check-completion` | No | Force re-verification before completing |
| `-v, --verbose` | No | Verbose output |
| `-p, --plan` | No | Plan mode (discuss, don't execute) |
| `--acp` | No | Agent Client Protocol mode |

---

## Billing Classification

| Provider | Mycelium Billing Type | Cost Tracking |
|----------|----------------------|---------------|
| Cline Account | `per_use` | Via Cline API (credits) |
| OpenRouter | `per_use` | Via OpenRouter API (`/api/v1/key` usage delta) |
| Other API keys | `per_use` | Provider-specific |

### OpenRouter Cost Tracking

Mycelium tracks OpenRouter costs by comparing `usage` before and after dispatch via the `/api/v1/key` endpoint. The API key is read from `~/.cline/data/secrets.json` (field: `openRouterApiKey`).

### Cline Account Cost Tracking

`checkClineCredits()` in `health.ts` hits `https://api.cline.bot/v1/user` with the stored `idToken`. Returns `balance`/`credits`. Token refresh is attempted if expired.

---

## Fallback Chain (in `fallback.ts`)

### In-Agent Escalation

```
glm-4.7-flash -> glm-4.7 -> deepseek/deepseek-v3.2 -> qwen/qwen3-coder -> moonshotai/kimi-k2.5 -> null
```

### Cross-Agent Fallback

```
cline -> pi (qwen/qwen3-coder via OpenRouter)
```

### Default Model

`moonshotai/kimi-k2.5` (set in `AGENT_DEFAULT_MODELS` and `seed-registry.ts`)

---

## Mycelium Integration

### Dispatch Pipeline

1. `dispatch()` calls `getAdapter('cline')` -> `clineAdapter`
2. `acquireResources()` tries `acquireClineInstance()` (BROKEN - falls back)
3. `preSpawn()` tries `switchClineModel()` via `cline config set` (BROKEN - no-op)
4. `buildArgs()` constructs command with `--address` (BROKEN), `task new` (wrong syntax)
5. `spawn(['cline', ...args], { cwd, env })` executes
6. Output streamed, timeout enforced externally
7. OpenRouter usage delta calculated for cost
8. `releaseClineInstance()` called (no-op)

### Effective Invocation

Despite adapter bugs, tasks do execute because:
- `cline task new "prompt" --yolo --mode act` -> `new` becomes part of task prompt, `--mode` is ignored
- The prompt gets `new\n<actual prompt>` prepended but the model handles it
- Cline uses whatever provider/model is in `globalState.json`

### OPENROUTER_API_KEY Env Interaction

Unlike Claude Code, Cline does NOT use env vars for auth. It reads from `~/.cline/data/secrets.json`. The `OPENROUTER_API_KEY` in the environment (from `~/.config/mk-agent/env`) is NOT used by Cline directly. No env var poisoning issue.

### Registry Seed Data

```
providers:
  - cline: { name: "Cline Account", auth_type: "oauth" }
  - openrouter: { name: "OpenRouter", auth_type: "api_key" }

agents:
  - cline: { default_provider: "openrouter", default_model: "moonshotai/kimi-k2.5" }

cross_agent_fallback:
  - cline -> pi (qwen/qwen3-coder)
  - vibe -> cline (mistralai/devstral-2512)
```

---

## Validation Checklist

- [x] `cline --version` returns 2.2.0
- [x] `cline task --help` shows available flags
- [x] `cline auth --help` shows provider/key/model flags
- [x] `cline history` shows 58 past tasks
- [x] `cline --json "prompt"` outputs NDJSON events
- [x] `~/.cline/data/secrets.json` has openRouterApiKey + clineAccountId
- [x] `~/.cline/data/settings/cline_mcp_settings.json` has 4 MCP servers
- [x] `~/.cline/data/globalState.json` has all config (51+ settings)
- [ ] `cline instance new` - **REMOVED** in v2.x (adapter broken)
- [ ] `cline config set` - **REMOVED** in v2.x (model switching broken)
- [ ] `cline config list -F plain` - **REMOVED** in v2.x (config read broken)
- [ ] `--address` flag - **REMOVED** in v2.x (multi-instance broken)
- [ ] Adapter `task new` syntax - **WRONG**, should be `task` only
- [ ] Adapter `--mode act` - **WRONG**, should be `--act`

---

## Recommended Fixes

### P0 (Critical - Adapter Broken)

1. **Fix `buildArgs()`**: Change `['task', 'new', prompt, '--yolo', '--mode', 'act']` to `['task', prompt, '--yolo', '--act', '--json']`
2. **Remove `--address` flag**: No longer exists
3. **Add `-m` model flag**: Use `--model <model>` per-task instead of `config set`

### P1 (Important - Dead Code)

4. **Remove or rewrite `cline-instances.ts`**: All `instance` commands removed in v2.x. Either:
   - Delete and accept single-instance (simplest)
   - Reimplement via `--config <dir>` for isolated concurrent instances
5. **Remove `switchClineModel()`**: `config set` no longer exists. Model switching via `-m` flag or direct `globalState.json` writes
6. **Remove `getClineConfig()`**: `config list -F plain` no longer exists

### P2 (Enhancement)

7. **Parse `--json` output**: Extract cost, token counts, model info from NDJSON events
8. **Add `--timeout`**: Let Cline self-terminate instead of relying on external SIGTERM
9. **Add `--cwd`**: Explicit working directory flag
10. **Consider `--reasoning-effort`**: Map task complexity to effort level
