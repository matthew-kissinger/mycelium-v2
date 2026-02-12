# Agent Data Surface Reference

> Complete inventory of what each CLI agent exposes: structured output fields, session storage, CLI introspection commands, billing/quota APIs, and local state files. Audited against live CLIs on the hub (2026-02-11).

---

## Summary Matrix

| Agent | Exact Tokens | Cost | Cache Stats | Session Resume | CLI Stats Command | Disk Sessions | Cost Cap |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Claude Code | JSON | JSON | JSON | `--resume` | - | JSONL | - |
| Cline | taskHistory | taskHistory | taskHistory | `-T <id>` | `history` | JSON per-task | - |
| Codex | JSONL | - (sub) | JSONL | `resume` | - | JSONL | - |
| Copilot | stderr (k) | premium reqs | - | `--resume` | - | YAML+checkpoints | - |
| Cursor | - | - (sub) | - | `--resume` | - | SQLite (binary) | - |
| Gemini | JSON | - (free/sub) | JSON | `--resume` | `--list-sessions` | project-local | - |
| Kiro | - | - (sub) | - | - | - | SQLite | - |
| OpenCode | NDJSON | NDJSON | NDJSON | `--continue` | `stats` | SQLite | - |
| Pi | NDJSON | NDJSON | NDJSON | `--continue` | - | JSONL | - |
| Vibe | - | - | - | `--resume` | - | log file | `--max-price` |

**Legend**: JSON = available in structured output. JSONL/NDJSON = streaming JSON lines. (sub) = subscription, cost always 0. (k) = kilotoken approximation. `-` = not available.

---

## Tier 1: Rich Data

### Claude Code (v2.1.38)

**Structured Output**: `--output-format json`

```json
{
  "type": "result",
  "subtype": "success",
  "cost_usd": 0.0342,
  "duration_ms": 12450,
  "duration_api_ms": 8200,
  "is_error": false,
  "num_turns": 3,
  "result": "response text here",
  "session_id": "abc-123-def",
  "total_cost_usd": 0.0342,
  "usage": {
    "input_tokens": 4500,
    "output_tokens": 1200,
    "cache_creation_input_tokens": 800,
    "cache_read_input_tokens": 2000,
    "service_tier": "standard"
  }
}
```

**Session Management**:
- Resume: `claude --resume <session_id>` or `claude --continue` (most recent)
- Fork: `claude --fork-session --resume <id>` (new session from existing)
- PR-linked: `claude --from-pr <number>` (resume session linked to PR)
- Disable: `claude --no-session-persistence` (ephemeral, no disk write)

**Local State** (`~/.claude/`):
| Path | Contents |
|------|----------|
| `projects/<path>/` | Session dirs + JSONL conversation logs |
| `projects/<path>/<uuid>.jsonl` | Full conversation with all messages |
| `stats-cache.json` | Daily activity: messageCount, sessionCount, toolCallCount per day |
| `history.jsonl` | Command history |
| `settings.json` | User preferences |

**Billing**: Subscription (Max plan, cost_usd=0) or API key (pay-per-token, exact cost in JSON).

**What We Can Extract**:
- `usage.input_tokens`, `usage.output_tokens` (exact)
- `usage.cache_creation_input_tokens`, `usage.cache_read_input_tokens` (cache efficiency)
- `cost_usd` (exact, API key mode) or 0 (subscription)
- `session_id` (for resume on retry)
- `num_turns` (agent loop iterations)
- `duration_api_ms` (API-only time, excluding tool execution)
- `service_tier` (standard vs premium routing)

---

### OpenCode (v1.1.59)

**Structured Output**: `--format json` (NDJSON events)

Three event types in output stream:

```jsonl
{"type":"step_start","timestamp":"...","sessionID":"ses_xxx","snapshot":{}}
{"type":"text","timestamp":"...","sessionID":"ses_xxx","part":{"type":"text","text":"response chunk","time":{"start":"...","end":"..."}}}
{"type":"step_finish","timestamp":"...","sessionID":"ses_xxx","part":{"reason":"end_turn","cost":0.0023,"tokens":{"total":5200,"input":4000,"output":1200,"reasoning":0,"cache":{"read":1500,"write":800}}}}
```

**Session Management**:
- Resume: `opencode --continue` (last) or `opencode --session <id>`
- Fork: `opencode --fork --continue`
- List: `opencode session list`
- Export: `opencode export <sessionID>` (full JSON dump)
- Import: `opencode import <file>` (restore session)

**CLI Stats Command**: `opencode stats`
```
OVERVIEW: Sessions 27, Messages 368, Days 7
COST & TOKENS: Total $0.12, Avg/Day $0.02, Avg Tokens/Session 905.7K
  Input 3.5M, Output 140.0K, Cache Read 20.7M, Cache Write 33.0K
TOOL USAGE: edit 183 (34%), read 165 (31%), bash 150 (28%), ...
```

**Local State** (`~/.local/share/opencode/`):
| Path | Contents |
|------|----------|
| `storage/session` | SQLite - session metadata |
| `storage/message` | SQLite - all messages |
| `storage/part` | SQLite - message parts with token/cost data |
| `storage/session_diff` | SQLite - file diffs per session |
| `storage/todo` | SQLite - task tracking |
| `log/opencode.log` | Debug log |

**Billing**: Per-provider. Zen models = free. Paid providers via API keys.

**What We Can Extract**:
- `step_finish.part.tokens.input`, `.output` (exact per step)
- `step_finish.part.tokens.cache.read`, `.cache.write` (cache efficiency)
- `step_finish.part.tokens.reasoning` (thinking tokens)
- `step_finish.part.cost` (exact USD per step)
- `sessionID` (for resume)
- Aggregate stats via `opencode stats` CLI command

---

### Pi (v0.52.9)

**Structured Output**: `--mode json` (NDJSON events)

Key event types:

```jsonl
{"type":"session","version":3,"id":"uuid","timestamp":"...","cwd":"/path"}
{"type":"model_change","provider":"openrouter","modelId":"moonshotai/kimi-k2.5"}
{"type":"thinking_level_change","thinkingLevel":"medium"}
{"type":"message_start","id":"...","role":"assistant"}
{"type":"message_update","delta":{"type":"text","text":"chunk"}}
{"type":"message_end","id":"...","usage":{"input":4500,"output":1200,"cacheRead":2000,"cacheWrite":500,"totalTokens":8200,"cost":{"input":0.001,"output":0.002,"total":0.003}}}
{"type":"agent_end","messages":[{"role":"assistant","content":"full response"}]}
```

**Session Management**:
- Resume: `pi --continue` (last) or `pi --resume` (picker) or `pi --session <path>`
- Session dir: `pi --session-dir <dir>`
- Ephemeral: `pi --no-session`
- Export: `pi --export <file> output.html`
- Share: via `PI_SHARE_VIEWER_URL`

**Local State** (`~/.pi/agent/`):
| Path | Contents |
|------|----------|
| `sessions/<project>/` | JSONL session files per project dir |
| Session JSONL events | session, model_change, thinking_level_change, message_*, agent_end |

**Billing**: Per-provider. OpenRouter = per-use with cost in output. Groq/Cerebras = free tier.

**What We Can Extract**:
- `message_end.usage.input`, `.output` (exact per message)
- `message_end.usage.cacheRead`, `.cacheWrite` (cache efficiency)
- `message_end.usage.cost.total` (exact USD per message)
- `session.id` (for resume)
- `model_change` events (track which model was actually used)
- `thinking_level_change` events (reasoning mode)

---

## Tier 2: Good Data

### Cline (v2.2.0)

**Structured Output**: `--json` (NDJSON events)

Key event types:

```jsonl
{"type":"say","say":"task_started","ts":1770858797370}
{"type":"say","say":"text","text":"response chunk"}
{"type":"say","say":"api_req_finished","text":"{\"tokensIn\":4500,\"tokensOut\":1200,\"totalCost\":0.035}"}
{"type":"say","say":"completion_result","text":"final answer here"}
```

Note: Token/cost data is a JSON string *inside* the `text` field of `api_req_finished` events. Requires double-parsing.

**Session Management**:
- Resume: `cline --taskId <id>` or `cline -T <id>`
- History: `cline history` (paginated list with cost + model per task)

**CLI History Command**: `cline history -n 10`
```
  2/4/2026, 8:07 PM
    1770253651391
    what is 2+2
    Cost: $0.0313
    Model: moonshotai/kimi-k2.5
```

**Local State** (`~/.cline/`):
| Path | Contents |
|------|----------|
| `data/state/taskHistory.json` | Array of all tasks with `tokensIn`, `tokensOut`, `totalCost`, `cacheWrites`, `cacheReads`, `modelId`, `size` |
| `data/tasks/<id>/task_metadata.json` | Per-task: `model_usage` array, `files_in_context`, environment info |
| `data/tasks/<id>/api_conversation_history.json` | Full API message log |
| `data/tasks/<id>/ui_messages.json` | UI-facing message log |
| `data/secrets.json` | API keys (OpenRouter, etc.) |
| `logs/` | Per-session log files |

**taskHistory.json entry**:
```json
{
  "id": "1768857412530",
  "ulid": "01KFC1W8XW...",
  "ts": 1768857436317,
  "task": "say hello in one word",
  "tokensIn": 11100,
  "tokensOut": 199,
  "cacheWrites": 0,
  "cacheReads": 0,
  "totalCost": 0.0446025,
  "size": 37531,
  "modelId": "anthropic/claude-sonnet-4.5",
  "cwdOnTaskInitialization": "/home/dev/repos",
  "isFavorited": false
}
```

**Billing**: Per-use via OpenRouter (or Cline account).

**What We Can Extract**:
- `tokensIn`, `tokensOut` from taskHistory.json (post-task, exact)
- `totalCost` from taskHistory.json (exact USD)
- `cacheWrites`, `cacheReads` (cache efficiency)
- `modelId` (actual model used)
- Task ID for resume via `-T`
- Real-time token/cost from `api_req_finished` NDJSON events during streaming

---

### Codex (v0.99.0)

**Structured Output**: `--json` (JSONL events)

Key event types:

```jsonl
{"type":"thread.started","thread_id":"..."}
{"type":"turn.started","turn_id":"..."}
{"type":"item.completed","item":{"type":"agent_message","content":[{"type":"output_text","text":"response"}]}}
{"type":"turn.completed","usage":{"input_tokens":4500,"cached_input_tokens":2000,"output_tokens":1200}}
{"type":"error","message":"error details"}
```

**Session Management**:
- Resume: `codex resume` (interactive picker) or `codex resume --last`
- Fork: `codex fork` (picker) or `codex fork --last`

**Local State** (`~/.codex/`):
| Path | Contents |
|------|----------|
| `sessions/YYYY/MM/DD/` | Session files by date |
| `history.jsonl` | Full prompt history with session_id, timestamp, prompt text |
| `models_cache.json` | Available models from OpenAI |
| `auth.json` | OAuth tokens |
| `config.toml` | MCP servers, personality, project trust levels |

**Billing**: Subscription (Pro plan). Cost always 0.

**What We Can Extract**:
- `turn.completed.usage.input_tokens` (exact)
- `turn.completed.usage.output_tokens` (exact)
- `turn.completed.usage.cached_input_tokens` (cache efficiency)
- `thread_id` for potential resume
- Session history from `history.jsonl`

---

### Gemini (v0.28.2)

**Structured Output**: `-o json`

```json
{
  "session_id": "uuid",
  "response": "response text",
  "stats": {
    "models": {
      "gemini-2.5-flash": {
        "api": {
          "totalRequests": 3,
          "totalErrors": 0,
          "totalLatencyMs": 4500
        },
        "tokens": {
          "input": 4500,
          "prompt": 4500,
          "candidates": 1200,
          "total": 6500,
          "cached": 2000,
          "thoughts": 800,
          "tool": 150
        }
      }
    },
    "tools": { "tool_name": { "calls": 5, "successes": 5 } },
    "files": { "linesAdded": 50, "linesRemoved": 10 }
  }
}
```

**Session Management**:
- Resume: `gemini --resume latest` or `gemini --resume N` (by index)
- List: `gemini --list-sessions`
- Delete: `gemini --delete-session N`

**Local State** (`~/.gemini/`):
| Path | Contents |
|------|----------|
| `settings.json` | Auth, model preferences |
| `oauth_creds.json` | Google OAuth tokens |
| `<project>/.gemini/` | Per-project session storage |

**Billing**: Free tier (quota limited) or Google AI Pro subscription.

**What We Can Extract**:
- `stats.models.*.tokens.input`, `.candidates` (exact in/out)
- `stats.models.*.tokens.cached` (cache hits)
- `stats.models.*.tokens.thoughts` (thinking/reasoning tokens)
- `stats.models.*.tokens.tool` (tool-use tokens)
- `stats.models.*.api.totalLatencyMs` (API latency)
- `stats.tools` (tool call counts and success rates)
- `stats.files` (lines added/removed)
- `session_id` (for resume)

---

## Tier 3: Limited Data

### Copilot (v0.0.407)

**Structured Output**: Stats in **stderr** (not stdout)

```
Total usage est: 3 Premium requests
API time spent: 45s
Total session time: 62s
Total code changes: +150 -30

claude-opus-4.6   12.5k in, 3200 out, 8.1k cached (Est. 3 Premium requests)
```

**Session Management**:
- Resume: `copilot --resume [sessionId]` or `copilot --continue`
- Share: `copilot --share [path]` (markdown export) or `copilot --share-gist` (GitHub gist)
- Silent: `copilot -s` (suppress stats, agent response only)

**Local State** (`~/.copilot/`):
| Path | Contents |
|------|----------|
| `session-state/<uuid>/workspace.yaml` | Session metadata (id, cwd, timestamps) |
| `session-state/<uuid>/checkpoints/` | Git checkpoints for rollback |
| `session-state/<uuid>/files/` | File snapshots |
| `logs/copilot.log` | Main log |
| `logs/process-*.log` | Per-process debug logs |
| `config.json` | User config |
| 90 sessions on disk | Full history |

**Billing**: Free models (gpt-4.1, gpt-5-mini = 0 premium) and paid (claude-sonnet = 1, claude-opus = 3 premium requests).

**What We Can Extract**:
- Premium request count (from stderr parsing)
- Per-model token estimates in kilotokens (from stderr)
- API time and session time (from stderr)
- Code change metrics (from stderr)
- Session ID for resume
- Note: Requires capturing stderr separately in dispatch.ts

---

### Vibe (v2.1.0)

**Structured Output**: `--output json` returns message array but no usage data.

```json
[
  {"role": "user", "content": "prompt"},
  {"role": "assistant", "content": "response", "message_id": "uuid", "tool_calls": [...]}
]
```

**Session Management**:
- Resume: `vibe --resume <session_id>` (supports partial ID match)
- Continue: `vibe --continue` (most recent)

**Safety Caps**:
- `vibe --max-price 0.50` (abort if cost exceeds $0.50, programmatic mode only)
- `vibe --max-turns 20` (limit agent loop iterations)

**Local State** (`~/.vibe/`):
| Path | Contents |
|------|----------|
| `config.toml` | API key, model preferences |
| `vibe.log` | HTTP request log (timestamps, endpoints, status codes) |
| `vibehistory/` | Session history (currently empty on hub) |
| `trusted_folders.toml` | Auto-approved directories |

**Billing**: Per-API-call via Mistral API. Cost tracked internally but not exposed in output.

**What We Can Extract**:
- Session ID from message array `message_id` field
- `--max-price` enforcement (Vibe kills itself if cost exceeded)
- HTTP request log from `vibe.log` (timestamps, but not tokens)
- Note: **No token or cost data in output**. Would need Mistral API billing endpoint or token estimation.

---

## Tier 4: Minimal Data

### Cursor (v2026.01.28)

**Structured Output**: `--output-format json`

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 12000,
  "duration_api_ms": 8000,
  "result": "response text",
  "session_id": "uuid",
  "request_id": "uuid"
}
```

**No token counts. No cost data. No usage info.**

**Session Management**:
- Resume: `agent --resume <session_id>` or `agent --continue`

**Local State** (`~/.cursor/`):
| Path | Contents |
|------|----------|
| `chats/<hash>/<uuid>/store.db` | SQLite with binary protobuf blobs (not easily parseable) |
| `cli-config.json` | CLI preferences |
| `mcp.json` | MCP server config |

**Billing**: Subscription. Cost always 0.

**What We Can Extract**:
- `session_id` (for resume)
- `duration_ms`, `duration_api_ms` (timing only)
- Note: Token tracking requires external estimation. Subscription means cost=0 anyway.

---

### Kiro (v1.25.1)

**Structured Output**: None. Text-only output with ANSI codes.

**No JSON mode. No token counts. No cost. No session resume.**

Stderr contains a ~30-line banner and timing info (`Time: Xs`).

**Local State** (`~/.kiro/`):
| Path | Contents |
|------|----------|
| `agents/cli.json` | Agent config |
| `settings/` | AWS SSO credentials, preferences |

**Billing**: Subscription (AWS IAM Identity Center). Cost always 0.

**What We Can Extract**:
- Wall clock time from stderr `Time: Xs` pattern
- Note: Kiro is the most opaque agent. AWS manages all usage tracking server-side.

---

## Current vs Possible: The Gap

### What dispatch.ts does today

```
estimateTokens(): regex for "input_tokens: N" in output, fallback to prompt.length/4
parseCostFromOutput(): regex for "Cost: $N" or "cost_usd: N" in output
OpenRouter balance diff: API call before+after for per_use agents
```

All 10 agents use the same `Math.ceil(length / 4)` fallback. Zero agents have their structured output parsed for usage data.

### What's available but ignored

| Agent | Available Fields | Method | Priority |
|-------|-----------------|--------|----------|
| Claude | input/output/cache_read/cache_write tokens, cost_usd, num_turns, session_id, duration_api_ms, service_tier | Add `--output-format json` to adapter, parse result | HIGH |
| OpenCode | input/output/reasoning/cache tokens, cost per step, session_id | Parse existing NDJSON step_finish events | HIGH |
| Pi | input/output/cache tokens, per-message cost, session_id, model changes | Parse existing NDJSON message_end events | HIGH |
| Codex | input/output/cached tokens, thread_id | Parse existing JSONL turn.completed events | HIGH |
| Gemini | input/output/cached/thoughts/tool tokens, API latency, session_id, file metrics | Add `-o json`, parse stats object | HIGH |
| Cline | tokensIn/Out, totalCost, cacheReads/Writes, modelId | Parse existing NDJSON api_req_finished OR read taskHistory.json after task | MEDIUM |
| Copilot | premium reqs, k-notation tokens, API time, code changes | Capture stderr, regex parse stats block | MEDIUM |
| Vibe | session_id, max-price enforcement | No usage data available in output | LOW |
| Cursor | session_id, duration_ms | No usage data available in output | LOW |
| Kiro | wall clock time | Regex on stderr | LOW |

---

## Local State We Could Read

Beyond CLI output, several agents store rich data on disk that we could query post-task or periodically:

### High Value

| Source | Path | Data | How to Use |
|--------|------|------|------------|
| Cline taskHistory | `~/.cline/data/state/taskHistory.json` | All tasks: tokens, cost, model, cache | Read after dispatch, match by task timestamp |
| OpenCode stats | `opencode stats` CLI | Aggregate: total cost, avg tokens, tool usage | Periodic scheduler cycle or post-task |
| OpenCode sessions DB | `~/.local/share/opencode/storage/` | SQLite with messages, parts, costs | Direct DB query for session data |
| Claude stats cache | `~/.claude/stats-cache.json` | Daily activity: messages, sessions, tool calls | Periodic read for dashboard |
| Pi session JSONL | `~/.pi/agent/sessions/<project>/` | Full session with model changes, thinking levels | Post-task analysis |
| Codex history | `~/.codex/history.jsonl` | All prompts with session_id, timestamp | Session correlation |

### Medium Value

| Source | Path | Data | How to Use |
|--------|------|------|------------|
| Copilot sessions | `~/.copilot/session-state/<id>/workspace.yaml` | Session metadata, timestamps | Inventory of past sessions |
| Copilot logs | `~/.copilot/logs/copilot.log` | Debug output | Error investigation |
| Gemini sessions | `<project>/.gemini/` | Project-level session storage | Resume context |
| Cursor chat DBs | `~/.cursor/chats/<hash>/<uuid>/store.db` | SQLite with protobuf messages | Complex to parse, low ROI |
| Vibe HTTP log | `~/.vibe/vibe.log` | API request timestamps and status codes | Latency tracking |

---

## Provider Billing APIs

These are HTTP APIs we already call or could call for quota/credit monitoring:

| Provider | Endpoint | Data | Currently Used |
|----------|----------|------|:-:|
| OpenRouter | `GET https://openrouter.ai/api/v1/key` | `{ limit, remaining, usage, isFreeTier, expiresAt }` | Yes |
| Cline Account | `GET https://api.cline.bot/v1/user` | Balance, user info | Yes |
| Groq | `GET https://api.groq.com/openai/v1/models` | Rate limit headers (X-RateLimit-*) | Yes |
| Cerebras | `GET https://api.cerebras.ai/v1/models` | Daily/minute request quotas | Yes |
| Mistral | `GET https://api.mistral.ai/v1/models` | Service availability, key validity | Yes |
| Anthropic | `GET https://api.anthropic.com/v1/messages` (headers) | Rate limit headers | No |
| Google AI | Quota info in error responses | Reset time parsing | Partial (error only) |
| OpenAI | Billing API | Usage data | No |

---

## Implementation Plan: Structured Output Parsing

### Phase 1: Adapter Output Format Flags

Add structured output flags to adapters that don't have them yet:

| Adapter | Current | Change |
|---------|---------|--------|
| claude.ts | no format flag | Add `--output-format json` |
| gemini.ts | `-o json` (uncommitted) | Already done |
| cline.ts | `--json` | Already done |
| codex.ts | `--json` | Already done |
| opencode.ts | `--format json` | Already done |
| pi.ts | `--mode json` | Already done |
| copilot.ts | none | Capture stderr in dispatch.ts |
| cursor.ts | `--output-format json` | Already done (no usage data) |
| vibe.ts | `--output json` | Already done (no usage data) |
| kiro.ts | none | No structured format available |

### Phase 2: Define ParsedUsage Interface

```typescript
interface ParsedUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  thinking_tokens?: number
  tool_tokens?: number
  cost_usd?: number
  session_id?: string
  model_used?: string
  num_turns?: number
  api_duration_ms?: number
  premium_requests?: number  // Copilot
}
```

### Phase 3: Per-Adapter Parsing

Each adapter's `postProcessOutput()` currently returns `string` (just the response text). Change to return `{ text: string, usage?: ParsedUsage }` or add a separate `parseUsage?(output: string, stderr?: string): ParsedUsage` method to the AgentAdapter interface.

### Phase 4: Wire Through dispatch.ts

Replace `estimateTokens()` fallback with parsed data when available. Update `AgentExecuteResult` to carry all new fields. Store in DB.

### Phase 5: Copilot stderr Capture

dispatch.ts already captures stderr (line 187: `stderr += chunk`). Currently only used as fallback output on empty stdout. Add stderr parsing for Copilot stats.

### Phase 6: Post-Task State Reading (Optional)

For agents where structured output parsing is insufficient (Cline taskHistory, OpenCode stats), add optional post-task hooks that read local state files to supplement usage data.

---

## Libraries

No external token counting library is needed. 8/10 agents already provide exact counts - the problem is parsing, not counting. For the 2 agents without data (Cursor, Kiro), both are subscription (cost=0), so token estimation via `length/4` is acceptable.

If future needs require pre-dispatch token counting (e.g., to check context window fit), consider:
- `tiktoken` (OpenAI's tokenizer, works for GPT models)
- `gpt-tokenizer` (JS port, lighter weight)
- `@anthropic-ai/tokenizer` (if it exists, for Claude models)

But none of these are needed for the current use case of parsing what agents already output.
