# Gemini CLI - Agent Decomposition

**CLI:** `gemini`
**Version:** 0.28.2
**Vendor:** Google (`@google/gemini-cli` + `@google/gemini-cli-core`)
**Install:** bun global (`bun install -g @google/gemini-cli`)
**Binary:** `/home/mkagent/.bun/bin/gemini`
**Source:** `~/.bun/install/global/node_modules/@google/gemini-cli-core/dist/src/`

---

## Authentication Modes

Gemini CLI supports multiple auth modes. **Auth is selected via `~/.gemini/settings.json` `security.auth.selectedType` field**, not auto-detected from env vars.

| Mode | `selectedType` | Detection | Billing | Rate Limits |
|------|----------------|-----------|---------|-------------|
| **Google OAuth (Personal)** | `oauth-personal` | Login via `gemini` interactive + browser | Free tier or Google AI Pro subscription | Tiered by tier |
| **Gemini API Key** | `gemini-api-key` | `GEMINI_API_KEY` env var or stored in keychain | Pay-per-token (AI Studio) | Per-model quotas |
| **Vertex AI** | `vertex-ai` | `GOOGLE_API_KEY` + `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION` | Pay-per-token via GCP | GCP quotas |
| **Cloud Shell (Legacy)** | `cloud-shell` | GCE metadata | Via GCP project | GCP quotas |
| **Compute ADC** | `compute-default-credentials` | Application Default Credentials | Via GCP project | GCP quotas |

### Current Configuration

```json
// ~/.gemini/settings.json
{
  "security": { "auth": { "selectedType": "oauth-personal" } },
  "core": { "previewFeatures": true }
}
```

Active Google account: `matt.m.kissinger@gmail.com` (from `~/.gemini/google_accounts.json`).

OAuth credentials cached at `~/.gemini/oauth_creds.json`.

### Auth Priority

Unlike Claude Code, **`selectedType` in settings.json is the authoritative auth method**. Environment variables are only used when the corresponding auth type is selected:

- `oauth-personal`: Uses cached OAuth credentials. Ignores `GEMINI_API_KEY` and `GOOGLE_API_KEY`.
- `gemini-api-key`: Reads from `GEMINI_API_KEY` env var, then falls back to keychain storage.
- `vertex-ai`: Reads `GOOGLE_API_KEY` for auth, plus `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`.

### Env Var Poisoning Analysis

**NO POISONING ISSUE.** Unlike Claude Code (where `ANTHROPIC_API_KEY` silently overrides subscription auth), the Gemini CLI respects the explicit `selectedType` setting. With `selectedType: "oauth-personal"`:

- `GOOGLE_API_KEY` in env: **IGNORED** (only used when `selectedType` is `vertex-ai`)
- `GEMINI_API_KEY` in env: **IGNORED** (only used when `selectedType` is `gemini-api-key`)

The current `~/.config/mk-agent/env` exports `GOOGLE_API_KEY=AIzaSy...` which is sourced via `~/.zshenv` into all shell sessions and therefore into the mycelium server's `process.env`. This key is inherited by spawned gemini processes but has **no effect** on auth because the settings file forces `oauth-personal`.

**However**, if the settings file ever changes to `vertex-ai` or `gemini-api-key`, the env var WOULD take effect. The adapter's `buildEnv()` currently returns `{}` which is correct for the current setup. No defensive stripping is needed (unlike the Claude adapter).

### Auth Chain (from source)

```
GEMINI_API_KEY env -> loadApiKey() from keychain -> undefined
GOOGLE_API_KEY env -> undefined
```

Only evaluated when `selectedType` matches the relevant auth type.

---

## Models

### Constants (from `gemini-cli-core` source)

| Constant | Value | Notes |
|----------|-------|-------|
| `DEFAULT_GEMINI_MODEL` | `gemini-2.5-pro` | Pro default |
| `DEFAULT_GEMINI_FLASH_MODEL` | `gemini-2.5-flash` | Flash default |
| `DEFAULT_GEMINI_FLASH_LITE_MODEL` | `gemini-2.5-flash-lite` | Lite (used for routing) |
| `PREVIEW_GEMINI_MODEL` | `gemini-3-pro-preview` | Preview pro |
| `PREVIEW_GEMINI_FLASH_MODEL` | `gemini-3-flash-preview` | Preview flash |
| `DEFAULT_GEMINI_MODEL_AUTO` | `auto-gemini-2.5` | Auto-routing mode |
| `PREVIEW_GEMINI_MODEL_AUTO` | `auto-gemini-3` | Preview auto-routing |
| `DEFAULT_GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | Embeddings |

### Valid Models Set

The CLI defines a `VALID_GEMINI_MODELS` Set containing:
- `gemini-3-pro-preview`
- `gemini-3-flash-preview`
- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

Other models (like `gemini-2.0-flash`) work via direct API passthrough but are not in the "validated" set.

### Model Aliases

| Alias | With `previewFeatures: false` | With `previewFeatures: true` |
|-------|-------------------------------|------------------------------|
| `auto` | `auto-gemini-2.5` -> smart routing | `auto-gemini-2.5` -> smart routing |
| `pro` | `gemini-2.5-pro` | `gemini-3-pro-preview` |
| `flash` | `gemini-2.5-flash` | `gemini-3-flash-preview` |
| `flash-lite` | `gemini-2.5-flash-lite` | `gemini-2.5-flash-lite` |

**Current settings have `previewFeatures: true`**, so `pro` resolves to `gemini-3-pro-preview` and `flash` to `gemini-3-flash-preview`.

### Model Availability (Tested 2026-02-12)

| Model | Status | Notes |
|-------|--------|-------|
| `gemini-2.5-pro` | Working | Stable, good for complex tasks |
| `gemini-2.5-flash` | Working | Fast, default for most tasks |
| `gemini-2.5-flash-lite` | Working | Used by auto-routing for prompt classification |
| `gemini-3-pro-preview` | Working | Preview, slower (~3.5s latency for simple prompt) |
| `gemini-3-flash-preview` | Working | Preview, fast (~1s latency) |
| `gemini-2.0-flash` | Working | Older, no thinking tokens, fast (~0.6s) |
| `gemini-2.0-flash-lite` | **404 Error** | Not available on this API |
| `gemini-3.0-flash` | **404 Error** | Does not exist |

### Auto-Routing (Default Behavior)

When no `-m` flag is specified, the CLI uses `auto-gemini-2.5` mode:
1. Sends prompt to `gemini-2.5-flash-lite` for classification (~1s)
2. Routes to either `gemini-2.5-flash` or `gemini-2.5-pro` based on complexity
3. The JSON stats show both models used in one session

### Thinking Tokens

Models 2.5+ emit "thoughts" tokens (chain-of-thought reasoning). The CLI caps thinking at 8,192 tokens (`DEFAULT_THINKING_MODE`). Gemini 2.0 models do not produce thinking tokens.

---

## Output Formats

### `-o text` (Default)

```
Loaded cached credentials.              # stderr
Hook registry initialized with 0 hook entries  # stderr
<response text>                          # stdout
```

### `-o json`

Stderr: Boot messages (same as text).
Stdout: Single JSON object:

```json
{
  "session_id": "uuid",
  "response": "the response text",
  "stats": {
    "models": {
      "gemini-2.5-flash": {
        "api": { "totalRequests": 1, "totalErrors": 0, "totalLatencyMs": 1310 },
        "tokens": {
          "input": 8245, "prompt": 8245, "candidates": 6,
          "total": 8278, "cached": 0, "thoughts": 27, "tool": 0
        }
      }
    },
    "tools": {
      "totalCalls": 0, "totalSuccess": 0, "totalFail": 0,
      "totalDurationMs": 0,
      "totalDecisions": { "accept": 0, "reject": 0, "modify": 0, "auto_accept": 0 },
      "byName": {}
    },
    "files": { "totalLinesAdded": 0, "totalLinesRemoved": 0 }
  }
}
```

**Key fields for mycelium:**
- `stats.models.<model>.tokens.input` - input token count
- `stats.models.<model>.tokens.candidates` - output token count
- `stats.models.<model>.tokens.thoughts` - thinking token count
- `stats.models.<model>.tokens.total` - total (input + output + thoughts + tool)
- `stats.models.<model>.api.totalLatencyMs` - latency
- `stats.tools.totalCalls` - tool use count
- `stats.files.totalLinesAdded/Removed` - file change metrics

### `-o stream-json`

NDJSON (newline-delimited JSON) streaming format:

```jsonl
{"type":"init","timestamp":"...","session_id":"uuid","model":"auto-gemini-2.5"}
{"type":"message","timestamp":"...","role":"user","content":"the prompt"}
{"type":"message","timestamp":"...","role":"assistant","content":"response","delta":true}
{"type":"result","timestamp":"...","status":"success","stats":{"total_tokens":11312,"input_tokens":11155,"output_tokens":39,"cached":0,"input":11155,"duration_ms":2356,"tool_calls":0}}
```

### Error Output (-o json)

```json
{
  "session_id": "uuid",
  "error": {
    "type": "Error",
    "message": "[object Object]",
    "code": 1
  }
}
```

Stderr also contains the full stack trace with error classification (e.g., `ModelNotFoundError`, `TerminalQuotaError`, `RetryableQuotaError`).

---

## Quota and Rate Limits

### Quota Error Classification (from source)

| Error Class | HTTP Code | Condition | Retryable |
|-------------|-----------|-----------|-----------|
| `TerminalQuotaError` | 429 | Daily limit exhausted (`PerDay`/`Daily` in quotaId) | No (wait for daily reset) |
| `RetryableQuotaError` | 429 | Per-minute rate limit | Yes (with retry delay) |
| `RetryableQuotaError` | 429 | CloudCode `RATE_LIMIT_EXCEEDED` | Yes (10s default) |
| `TerminalQuotaError` | 429 | CloudCode `QUOTA_EXHAUSTED` | No |
| `ValidationRequiredError` | 403 | Account validation needed | No (user action required) |
| `ModelNotFoundError` | 404 | Invalid model name | No |

### Quota Error Format (from stderr)

Per-minute quota exceeded:
```
RESOURCE_EXHAUSTED: You exceeded your current quota...
* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_paid_tier_input_token_count, limit: 10000
Please retry in 40.025771073s.
```

Daily quota exceeded:
```
TerminalQuotaError: You have exhausted your daily quota on this model.
```

### Retry Delay Parsing

The CLI source parses retry delays from:
1. `RetryInfo.retryDelay` field (e.g., `"40s"`, `"900ms"`)
2. Error message regex: `/Please retry in ([0-9.]+(?:ms|s))/`
3. Default fallback: 5 seconds for generic 429

### Mycelium Health.ts Patterns

The current `health.ts` matches:
- `/Your quota will reset after (\d+)h(\d+)m(\d+)s/` - **This pattern may be outdated.** The actual error format uses `TerminalQuotaError` class names and `Please retry in Xs` format.
- `output.includes('TerminalQuotaError') || output.includes('code: 429')` - This works correctly.

**Recommendation:** Add a matcher for `Please retry in (\d+\.?\d*)(ms|s)` to extract retry delay from stderr.

### User Tiers

| Tier | ID | Billing |
|------|-----|---------|
| Free | `free-tier` | No charge, strict daily limits |
| Legacy | `legacy-tier` | Previous plan (being deprecated) |
| Standard (Paid) | `standard-tier` | Google AI Pro subscription (~$20/month), higher limits |

Current account tier: **Standard (Paid)** (Google AI Pro subscription via `matt.m.kissinger@gmail.com`).

---

## Configuration

### Config File Locations

| File | Purpose |
|------|---------|
| `~/.gemini/settings.json` | User-level settings (auth type, theme, preview features) |
| `~/.gemini/google_accounts.json` | Active Google account |
| `~/.gemini/oauth_creds.json` | Cached OAuth credentials |
| `~/.gemini/installation_id` | Unique installation UUID |
| `~/.gemini/tmp/<hash>/chats/` | Session history (per-project hash) |
| `.gemini/settings.json` | Project-level settings (MCP servers, policies) |

### Current Project Config

```json
// /home/mkagent/mycelium-v2/.gemini/settings.json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

### Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | API key auth (when selectedType = gemini-api-key) |
| `GOOGLE_API_KEY` | Vertex AI auth (when selectedType = vertex-ai) |
| `GOOGLE_CLOUD_PROJECT` | GCP project for Vertex AI |
| `GOOGLE_CLOUD_LOCATION` | GCP region for Vertex AI |
| `GEMINI_API_KEY_AUTH_MECHANISM` | Auth header format: `x-goog-api-key` (default) or `bearer` |
| `GEMINI_CLI_CUSTOM_HEADERS` | Custom headers for API requests |

---

## CLI Flags (Relevant to Mycelium Dispatch)

| Flag | Used By Mycelium | Purpose |
|------|-----------------|---------|
| `-p <prompt>` | **MUST USE** | Non-interactive (headless) mode. **CRITICAL: Without -p, gemini enters interactive mode and hangs.** |
| `-m <model>` | Yes | Set model for session |
| `--yolo` / `-y` | Yes | Auto-approve all tool actions |
| `--approval-mode <mode>` | Alternative to --yolo | `default`, `auto_edit`, `yolo`, `plan` |
| `-o <format>` | **Should use** | Output format: `text`, `json`, `stream-json` |
| `-s` / `--sandbox` | No | Run in sandbox |
| `--resume <id\|latest>` | Not yet | Resume previous session |
| `-i <prompt>` | No | Execute prompt then continue interactive |
| `-r` / `--resume` | Not yet | Resume session by index or ID |
| `--include-directories` | No | Additional workspace directories |
| `--allowed-tools` | No | Allowlist specific tools |
| `--allowed-mcp-server-names` | No | Allowlist specific MCP servers |
| `-e` / `--extensions` | No | Limit extensions |
| `--raw-output` | No | Allow ANSI escape sequences |

### Stdin Support

The gemini CLI accepts prompt via stdin:
```bash
echo "prompt" | gemini -o text   # Works without -p
echo "context" | gemini -p "question about context"  # Stdin prepended to -p
```

This is useful for injecting large prompts that exceed shell argument limits.

---

## Session Management

Sessions are stored per-project in `~/.gemini/tmp/<project-hash>/chats/`.

```bash
gemini --list-sessions          # List all sessions for current project
gemini --resume latest          # Resume most recent session
gemini --resume 5               # Resume session by index
gemini --resume <uuid>          # Resume by session ID
gemini --delete-session 5       # Delete session by index
```

Session resume works with `-p` (non-interactive mode):
```bash
gemini --resume latest -p "follow up question" -o text
```

---

## Mycelium Integration

### Current Adapter (UPDATED 2026-02-11)

`packages/server/src/agents/adapters/gemini.ts`:

```typescript
export const geminiAdapter: AgentAdapter = {
  id: 'gemini',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, sessionId } = options
    // CRITICAL: -p is required for non-interactive (headless) mode.
    // Without it, gemini enters interactive TUI and hangs until timeout.
    return [
      ...(sessionId ? ['--resume', sessionId, '-p', prompt] : ['-p', prompt]),
      ...(model ? ['--model', model] : []),
      '--yolo',
      '-o', 'json',
    ]
  },

  buildEnv(): Record<string, string> {
    // No env var stripping needed. The Gemini CLI respects settings.json
    // selectedType (oauth-personal) and ignores GOOGLE_API_KEY/GEMINI_API_KEY
    // when OAuth is active.
    return {}
  },

  postProcessOutput(output: string): string {
    // With -o json, output is a JSON object with response + stats.
    // Extract just the response text for downstream consumers.
    try {
      const data = JSON.parse(output)
      return data.response ?? output
    } catch {
      return output
    }
  },
}
```

### Issues Status

| Issue | Status | Notes |
|-------|--------|-------|
| Missing `-p` flag (CRITICAL) | **FIXED** | Without `-p`, CLI enters interactive mode and hangs until timeout. Every gemini dispatch was broken. |
| No `-o json` flag | **FIXED** | JSON output provides exact token counts, latency, tool call stats |
| No `postProcessOutput` | **FIXED** | Extracts response text from JSON, prevents boot messages polluting output |
| No session resume | **FIXED** | `--resume sessionId` now passed when `sessionId` is set (retry support) |
| `--yolo` usage | OK | Shorthand for `--approval-mode yolo`, works correctly |
| `buildEnv` returns empty | OK | Correct - no env var poisoning with oauth-personal auth |

### Open Improvements

| Improvement | Priority | Notes |
|-------------|----------|-------|
| Token count extraction | Medium | `postProcessOutput` could parse `stats.models.*.tokens` and store in task record |
| `--allowed-mcp-server-names` | Low | Could disable MCP servers for faster startup |
| Stdin for large prompts | Low | `prepareStdin()` could pipe prompts exceeding shell arg limits |

### Token Count Extraction

With `-o json`, exact token counts are available. The dispatch.ts `estimateTokens()` function could be enhanced to parse the Gemini JSON stats:

```typescript
// In dispatch.ts or a gemini-specific parser
function parseGeminiTokens(jsonOutput: string): { input_tokens: number; output_tokens: number } | null {
  try {
    const data = JSON.parse(jsonOutput)
    let input = 0, output = 0
    for (const model of Object.values(data.stats?.models ?? {})) {
      input += (model as any).tokens?.input ?? 0
      output += (model as any).tokens?.candidates ?? 0
    }
    return { input_tokens: input, output_tokens: output }
  } catch {
    return null
  }
}
```

### Fallback Chain (in fallback.ts)

```
gemini-2.5-flash -> gemini-2.5-pro -> null
```

Cross-agent fallback: Not defined (gemini is a terminal node).

### Model ID Mapping (Mycelium -> Gemini CLI)

| Mycelium model | Gemini CLI --model | Notes |
|----------------|-------------------|-------|
| `gemini-2.5-pro` | `gemini-2.5-pro` | Direct passthrough |
| `gemini-2.5-flash` | `gemini-2.5-flash` | Direct passthrough |
| `gemini-3-pro-preview` | `gemini-3-pro-preview` | Direct passthrough |
| `gemini-3-flash-preview` | `gemini-3-flash-preview` | Direct passthrough |
| `flash` | `flash` | Alias, resolves based on previewFeatures |
| `pro` | `pro` | Alias, resolves based on previewFeatures |

No translation needed - model IDs and aliases pass through directly.

---

## Billing Classification

| Auth Mode | Mycelium Billing Type | Cost Tracking |
|-----------|----------------------|---------------|
| OAuth (Google AI Pro subscription) | `subscription` | `cost_usd = 0` |
| Gemini API Key | `per_use` | Parse from token counts + pricing |
| Vertex AI | `per_use` | Via GCP billing |

### Current Setup

Using Google AI Pro subscription (oauth-personal). No per-token charges. Billing type: `subscription`.

### Subscription Tier Limits

The Google AI Pro subscription provides significantly higher limits than free tier:

| Limit Type | Free Tier | Paid (Standard) |
|------------|-----------|-----------------|
| Daily requests | Low (varies by model) | ~1500 RPD for 2.5 Pro, higher for Flash |
| Per-minute input tokens | ~10,000 | ~100,000+ |
| Context window | Same | Same |
| Thinking tokens | Limited | Higher allocation |

Exact limits are model-specific and change frequently. The CLI's built-in quota error classification handles all cases automatically.

### API Key Pricing (If Used)

Gemini API pricing (pay-per-token via AI Studio):

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Gemini 2.5 Pro | $1.25 (<=200K) / $2.50 (>200K) | $10.00 (<=200K) / $15.00 (>200K) |
| Gemini 2.5 Flash | $0.15 (<=200K) / $0.30 (>200K) | $0.60 (<=200K) / $3.50 (>200K) |
| Gemini 2.5 Flash Lite | $0.075 | $0.30 |

---

## Error Patterns for Health.ts

### Verified Error Patterns

```
# Model not found (exit code 1)
stderr: "ModelNotFoundError: Requested entity was not found."
json: { "error": { "type": "Error", "message": "[object Object]", "code": 1 } }

# Terminal quota (daily limit)
stderr: "TerminalQuotaError: You have exhausted your daily quota on this model."

# Retryable quota (per-minute)
stderr: "RetryableQuotaError: ...Please retry in 40.025771073s."
stderr: "RESOURCE_EXHAUSTED: You exceeded your current quota..."

# Validation required (account issue)
stderr: "ValidationRequiredError: ..."

# Generic API error
stderr: "Error when talking to Gemini API Full report available at: /tmp/gemini-client-error-..."
```

### Health.ts Matchers (UPDATED 2026-02-11)

| Pattern | Status | Error Type |
|---------|--------|------------|
| `/Your quota will reset after (\d+)h(\d+)m(\d+)s/` | Working | `quota` with reset time |
| `TerminalQuotaError` / `code: 429` | Working | `quota` |
| `/Please retry in (\d+\.?\d*)(ms\|s)/` | **ADDED** | `quota` with retry delay in ms |

The new retry delay pattern extracts exact backoff timing from `RetryableQuotaError` messages. This enables precise quota backoff instead of the default 5-minute wait.

### Unmatched Patterns (Low Priority)

```typescript
// ValidationRequiredError - needs user action, not auto-recoverable
output.includes('ValidationRequiredError')
```

---

## Comparison with Claude Adapter

| Aspect | Claude | Gemini |
|--------|--------|--------|
| Non-interactive flag | `-p` (or `--resume`) | `-p` (MUST use, broken without it) |
| Auto-approve | `--dangerously-skip-permissions` | `--yolo` / `--approval-mode yolo` |
| Model flag | `--model` | `--model` / `-m` |
| Structured output | `--output-format json` | `-o json` (richer stats) |
| Session resume | `--resume <sessionId>` | `--resume <sessionId\|latest\|index>` |
| Env var poisoning | **YES** (ANTHROPIC_API_KEY overrides sub) | **NO** (settings.json auth type wins) |
| Stdin support | No | Yes (piped stdin + -p combine) |
| Token counting | Not in output | Full breakdown in JSON stats |

---

## Validation Checklist

- [x] `gemini --version` returns `0.28.2`
- [x] `gemini -p "hello" -o text` completes in non-interactive mode
- [x] `gemini -p "hello" -o json` returns structured JSON with token stats
- [x] `gemini -p "hello" -o stream-json` returns NDJSON events
- [x] `gemini -p "hello" -m gemini-2.5-pro` selects specific model
- [x] `gemini -p "hello" -m gemini-2.5-flash` selects flash model
- [x] `gemini -p "hello" -m gemini-3-pro-preview` works with preview model
- [x] `gemini -p "hello" -m gemini-3-flash-preview` works with preview model
- [x] `gemini -p "hello" -m gemini-2.0-flash` works with 2.0 model
- [x] `gemini -p "hello" --yolo` auto-approves (YOLO mode banner on stderr)
- [x] `--resume latest -p "followup"` resumes previous session
- [x] Without `-p`, positional prompt enters interactive mode and **hangs**
- [x] `GOOGLE_API_KEY` in env does NOT override oauth-personal auth
- [x] `GEMINI_API_KEY` in env does NOT override oauth-personal auth
- [x] Exit code 0 on success, 1 on error
- [x] Boot messages ("Loaded cached credentials.") go to stderr, not stdout
- [x] Invalid model returns ModelNotFoundError on stderr, exit code 1
