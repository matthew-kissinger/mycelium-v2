# Pi CLI - Agent Decomposition

**CLI:** `pi`
**Version:** 0.52.9
**Vendor:** Mario Zechner (@badlogic)
**Package:** `@mariozechner/pi-coding-agent` (npm)
**License:** MIT
**Source:** [github.com/badlogic/pi-mono](https://github.com/badlogic/pi-mono)
**Binary:** `~/.npm-global/bin/pi` -> `~/.npm-global/lib/node_modules/@mariozechner/pi-coding-agent/dist/cli.js`
**Config dir:** `~/.pi/agent/`
**Runtime:** Node.js >= 20.0.0

---

## Authentication

Pi is a **multi-provider** agent - it routes to any LLM provider, unlike single-provider CLIs (Claude, Codex, Gemini). Auth is per-provider.

### Resolution Order (Highest Priority First)

1. CLI `--api-key` flag
2. `~/.pi/agent/auth.json` (API key or OAuth token)
3. Environment variable
4. Custom provider keys from `models.json`

### API Key Auth

| Provider | Environment Variable | `auth.json` Key |
|----------|---------------------|-----------------|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic` |
| OpenAI | `OPENAI_API_KEY` | `openai` |
| Google Gemini | `GEMINI_API_KEY` | `google` |
| Groq | `GROQ_API_KEY` | `groq` |
| Cerebras | `CEREBRAS_API_KEY` | `cerebras` |
| Mistral | `MISTRAL_API_KEY` | `mistral` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter` |
| xAI | `XAI_API_KEY` | `xai` |
| Hugging Face | `HF_TOKEN` | `huggingface` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | `vercel-ai-gateway` |
| ZAI | `ZAI_API_KEY` | `zai` |
| Kimi | `KIMI_API_KEY` | `kimi-coding` |
| MiniMax | `MINIMAX_API_KEY` | `minimax` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` | `azure-openai-responses` |

### OAuth/Subscription Auth

Use `/login` in interactive mode for subscription-based providers:
- Claude Pro/Max
- ChatGPT Plus/Pro (Codex)
- GitHub Copilot
- Google Gemini CLI
- Google Antigravity

Tokens stored in `~/.pi/agent/auth.json` with auto-refresh.

### Auth File Format

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "openrouter": { "type": "api_key", "key": "sk-or-..." }
}
```

The `key` field supports three formats:
- **Literal:** `"sk-ant-..."` - used directly
- **Shell command:** `"!security find-generic-password -ws 'anthropic'"` - executed, stdout used
- **Env var name:** `"MY_CUSTOM_KEY"` - resolved from environment

File created with `0600` permissions.

### Cloud Providers

| Provider | Auth Mechanism |
|----------|---------------|
| Amazon Bedrock | AWS Profile, IAM keys, Bearer token, IRSA |
| Azure OpenAI | API key + base URL or resource name |
| Google Vertex AI | Application Default Credentials + project |

---

## Models

### Provider Count

Pi supports **365+ models** across **8 providers** (as of v0.52.9):

| Provider | Model Count | Notable Models |
|----------|-------------|----------------|
| anthropic | ~22 | claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5 |
| openai | ~5 | gpt-5, gpt-5-mini |
| openrouter | ~250+ | All OpenRouter models including free tier |
| groq | ~15 | kimi-k2, llama-3.3-70b, qwq-32b |
| cerebras | ~3 | gpt-oss-120b, qwen-3-235b, glm-4.7 |
| mistral | ~10 | devstral-2512, codestral-latest, mistral-large |
| github-copilot | ~20 | claude-opus-4.6, gpt-5.2-codex, gemini-3-pro |
| huggingface | ~15 | DeepSeek-R1, Kimi-K2.5, Qwen3-Coder |

### Default

Provider: `google`, Model: `gemini-2.5-flash` (built-in default, overridable via settings).

### Mycelium Default

Provider: `openrouter`, Model: `moonshotai/kimi-k2.5` (set in `fallback.ts` and `seed-registry.ts`).

### Model Selection

```bash
# Specify provider + model
pi --provider openrouter --model moonshotai/kimi-k2.5 -p "prompt"

# Fuzzy model search
pi --list-models kimi

# Cycle models with Ctrl+P (interactive)
pi --models "claude-*,gpt-5*"
```

### Model ID Format

Pi uses the provider's native model IDs directly. The `--list-models` output shows `provider/model_id` pairs. When passing `--model`, use the model ID column (not the provider prefix):

```bash
# Correct
pi --provider groq --model kimi-k2-instruct

# Also correct (OpenRouter models include org prefix)
pi --provider openrouter --model moonshotai/kimi-k2.5
```

---

## Output Format

### Text Mode (Default)

```bash
pi -p "prompt"
```

- **stdout:** Clean text response only
- **stderr:** Progress/status indicators
- **Exit codes:** `0` = success, non-zero = error

### JSON Streaming Mode

```bash
pi -p "prompt" --mode json
```

Outputs NDJSON (one JSON object per line). Key event types:

| Type | Content |
|------|---------|
| `session` | Session header (version, ID, cwd) |
| `agent_start` | Agent begins processing |
| `turn_start` / `turn_end` | Turn boundaries |
| `message_start` / `message_end` | Full message with usage data |
| `message_update` | Streaming deltas (thinking, text, tool calls) |
| `agent_end` | Final messages array |

### Usage Data (from JSON mode)

The `message_end` event includes token counts and cost:

```json
{
  "usage": {
    "input": 126,
    "output": 173,
    "cacheRead": 3072,
    "cacheWrite": 0,
    "totalTokens": 3371,
    "cost": {
      "input": 0.0026,
      "output": 0.0011,
      "total": 0.0037
    }
  }
}
```

### RPC Mode

```bash
pi --mode rpc
```

Full bidirectional JSON protocol over stdin/stdout for embedding Pi in other applications. Supports prompting, steering, follow-up, model switching, tool approval, and session management via structured commands.

---

## CLI Flags (Relevant to Dispatch)

| Flag | Used By Mycelium | Purpose |
|------|-----------------|---------|
| `-p` / `--print` | Yes | Non-interactive mode |
| `--provider <name>` | Yes | Provider selection |
| `--model <id>` | Yes | Model selection |
| `--mode json` | **Should use** | Structured output with token counts |
| `--no-session` | **Should use** | Don't save session files |
| `--session <path>` | No | Use specific session file |
| `-c` / `--continue` | No | Continue previous session |
| `-r` / `--resume` | No | Select session to resume |
| `--api-key <key>` | No | Override API key |
| `--system-prompt <text>` | No | Override system prompt |
| `--append-system-prompt <text>` | No | Append to system prompt |
| `--thinking <level>` | No | off/minimal/low/medium/high/xhigh |
| `--tools <tools>` | No | Enable specific tools (read,bash,edit,write) |
| `--no-tools` | No | Disable all built-in tools |
| `-e` / `--extension <path>` | No | Load extension |
| `--no-extensions` | No | Disable extension discovery |
| `--skill <path>` | No | Load skill file |
| `--no-skills` | No | Disable skill discovery |
| `--verbose` | No | Force verbose startup |

### Built-in Tools

| Tool | Description |
|------|-------------|
| `read` | Read file contents |
| `bash` | Execute bash commands |
| `edit` | Edit files with find/replace |
| `write` | Write files (create/overwrite) |
| `grep` | Search file contents (off by default) |
| `find` | Find files by glob (off by default) |
| `ls` | List directory contents (off by default) |

---

## Error Patterns

### Error Pattern Summary

| Error Type | Signal | health.ts Match | Notes |
|-----------|--------|-----------------|-------|
| Missing API key | `OPENROUTER_API_KEY` or `API key` in output | Line 288 | `api_error` type |
| OpenRouter rate limit | `rate limit` or `429` | Line 261 | `quota` type |
| Cerebras rate limit | `cerebras` + `429` or `Too Many Requests` | Line 328 | `quota` type, 60s backoff |
| Groq rate limit | `Rate limit reached` or groq + `429` | Line 269 | `quota` type, parsed wait |
| Timeout | `[TIMEOUT]` marker (synthetic from dispatch.ts) | Line 156 | `timeout` type |
| General error | Generic line scan | Line 338 | `unknown` type |

### Provider-Specific Errors

**OpenRouter:**
- `402 Payment Required` - insufficient credits
- `429 Too Many Requests` - rate limited
- Model not found - invalid model ID

**Groq (free tier):**
- `Rate limit reached for model ... try again in Xs`
- Tokens per minute / requests per minute limits

**Cerebras (free tier):**
- `429 Too Many Requests` - bucket-based rate limit, refills continuously
- Daily request limits

**Google (free tier):**
- `TerminalQuotaError` - daily quota exceeded
- `Your quota will reset after XhYmZs` - with parsed backoff

### Retry Behavior (Built-in)

Pi has its own retry with exponential backoff:
```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "maxDelayMs": 60000
  }
}
```

When a provider requests a retry delay longer than `maxDelayMs`, the request fails immediately rather than waiting.

---

## Session Management

### Storage Location

```
~/.pi/agent/sessions/--<cwd-with-dashes>--/<timestamp>_<uuid>.jsonl
```

Example: `/home/mkagent/mycelium-v2` -> `--home-mkagent-mycelium-v2--/`

Override with `PI_CODING_AGENT_DIR` env var or `--session-dir <dir>`.

### Session Format

JSONL (JSON Lines) with tree structure (v3). Key entry types:

| Type | Purpose |
|------|---------|
| `session` | Header (version, ID, cwd) |
| `message` | User/assistant/toolResult messages |
| `model_change` | Model switch mid-session |
| `thinking_level_change` | Thinking level change |
| `compaction` | Context compaction summary |
| `branch_summary` | Branch divergence summary |
| `custom` | Extension state persistence |
| `label` | User bookmarks |
| `session_info` | Display name |

### Resume Flags

| Flag | Purpose |
|------|---------|
| `-c` / `--continue` | Continue most recent session |
| `-r` / `--resume` | Select session interactively |
| `--session <path>` | Use specific session file |
| `--no-session` | Ephemeral (no persistence) |

### Context Compaction

Pi auto-compacts context when approaching token limits:
- `compaction.enabled`: true (default)
- `compaction.reserveTokens`: 16384 (reserved for response)
- `compaction.keepRecentTokens`: 20000 (recent context preserved)

---

## Configuration

### Settings Files (Priority Order)

| Location | Scope |
|----------|-------|
| CLI flags | Highest priority |
| `.pi/settings.json` | Project (per-directory) |
| `~/.pi/agent/settings.json` | Global |

### Key Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `defaultProvider` | string | `"google"` | Default provider |
| `defaultModel` | string | `"gemini-2.5-flash"` | Default model ID |
| `defaultThinkingLevel` | string | - | off/minimal/low/medium/high/xhigh |
| `hideThinkingBlock` | boolean | false | Hide thinking blocks |
| `quietStartup` | boolean | false | Hide startup header |
| `enabledModels` | string[] | - | Model patterns for Ctrl+P cycling |
| `shellPath` | string | - | Custom shell path |
| `shellCommandPrefix` | string | - | Prefix for bash commands |

### Extension System

Pi has a rich extension system (not MCP, but native TypeScript extensions):

- **Discovery:** `~/.pi/agent/extensions/` (global), `.pi/extensions/` (project)
- **CLI:** `pi -e ./extension.ts` or `--no-extensions`
- **Capabilities:** Custom tools, event hooks, custom commands, session persistence, custom UI
- **Hot reload:** `/reload` in interactive mode
- **Package manager:** `pi install <source>`, `pi remove <source>`, `pi update`, `pi list`

### Skills

Pi implements the [Agent Skills standard](https://agentskills.io/specification):
- **Discovery:** `~/.pi/agent/skills/` (global), `.pi/skills/` (project)
- **Commands:** `/skill:name` in interactive mode
- **Cross-agent:** Can load skills from `~/.claude/skills/` or `~/.codex/skills/`
- **CLI:** `--skill <path>`, `--no-skills`

### Prompt Templates

- **Discovery:** `~/.pi/agent/prompts/` (global), `.pi/prompts/` (project)
- **CLI:** `--prompt-template <path>`, `--no-prompt-templates`

---

## Env Var Poisoning Analysis

### Current Environment (`~/.config/mk-agent/env`)

Pi reads API keys directly from environment variables. Our `~/.config/mk-agent/env` (sourced via `~/.zshenv`) sets:

| Env Var | Loaded By Pi | Provider Affected | Risk |
|---------|-------------|-------------------|------|
| `OPENROUTER_API_KEY` | Yes | openrouter | **Active** - Default provider. Credits consumed. |
| `GROQ_API_KEY` | Yes | groq | **Active** - Free tier, rate limits only |
| `CEREBRAS_API_KEY` | Yes | cerebras | **Active** - Free tier, rate limits only |
| `MISTRAL_API_KEY` | Yes | mistral | **Active** - Pay-per-use, credits consumed |
| `ANTHROPIC_API_KEY` | Yes | anthropic | **Passive** - Only if `--provider anthropic` |
| `OPENAI_API_KEY` | Yes | openai | **Passive** - Only if `--provider openai` |
| `GOOGLE_API_KEY` | No | - | Pi uses `GEMINI_API_KEY`, not `GOOGLE_API_KEY` |
| `HF_TOKEN` | Yes | huggingface | **Passive** - Only if `--provider huggingface` |

### Risk Assessment

**Unlike Claude Code, Pi does NOT have a poisoning problem.** Pi requires explicit `--provider` to select a provider, and the adapter always passes `--provider openrouter` (or whatever is configured). Environment variables only activate for the selected provider.

However, the adapter's `buildEnv()` method does set some keys explicitly:
- `OPENROUTER_API_KEY` for openrouter provider (reads from `~/.config/mk-agent/OPENROUTER_API_KEY` file)
- `MISTRAL_API_KEY` for mistral provider
- `GROQ_API_KEY` for groq provider (from `~/.groq/config.json`)
- `CEREBRAS_API_KEY` for cerebras provider

This means Pi gets the key from TWO sources: the env file AND the adapter's `buildEnv()`. The adapter's explicit key wins because it overrides `process.env`. No conflict, but redundant.

### Recommendation

The adapter's `buildEnv()` key injection is correct and safe. No fix needed. The env vars in `~/.config/mk-agent/env` do not cause unintended provider usage because Pi requires explicit `--provider`.

---

## Billing Classification

| Provider | Billing Type | Cost Tracking |
|----------|-------------|---------------|
| openrouter | `per_use` | OPENROUTER_API_KEY credits consumed |
| groq | `free` | Free tier with rate limits |
| cerebras | `free` | Free tier with rate limits |
| google | `free` | Free tier with quota |
| mistral | `per_use` | MISTRAL_API_KEY credits consumed |
| anthropic | `per_use` | ANTHROPIC_API_KEY credits consumed |
| openai | `per_use` | OPENAI_API_KEY credits consumed |
| github-copilot | `subscription` | Via OAuth login |
| huggingface | `free` | Free inference API |

### OpenRouter Pricing (Mycelium Default Models)

| Model | Input (per 1M) | Output (per 1M) |
|-------|---------------|-----------------|
| moonshotai/kimi-k2.5 | $0.45 | $2.50 |
| google/gemini-3-flash-preview | $0.10 | $0.40 |
| deepseek/deepseek-v3.2 | $0.25 | $0.38 |
| anthropic/claude-sonnet-4.5 | $3.00 | $15.00 |
| arcee-ai/trinity-large-preview:free | $0.00 | $0.00 |

---

## Mycelium Integration

### Current Adapter

`packages/server/src/agents/adapters/pi.ts`:

```typescript
export const piAdapter: AgentAdapter = {
  id: 'pi',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, provider } = options
    return [
      '-p', prompt,
      ...(provider ? ['--provider', mapProviderToPi(provider)] : ['--provider', 'openrouter']),
      ...(model ? ['--model', model] : []),
    ]
  },

  buildEnv(options: AdapterOptions): Record<string, string> {
    // Sets provider-specific API key from ~/.config/mk-agent/ files
    // Supports openrouter, mistral, groq, cerebras
  },

  tracksOpenRouterUsage(options: AdapterOptions): boolean {
    return options.provider === 'openrouter' || !options.provider
  },
}
```

### Provider Mapping

The adapter maps Mycelium `ProviderType` to Pi provider names:

| Mycelium Provider | Pi Provider |
|-------------------|-------------|
| `openrouter` | `openrouter` |
| `groq` | `groq` |
| `cerebras` | `cerebras` |
| `mistral` | `mistral` |
| `google` | `google` |
| `anthropic` | `anthropic` |
| `openai` | `openai` |
| (default) | `openrouter` |

### Supported Providers (from shared schema)

```typescript
pi: {
  supported: ['openrouter', 'groq', 'cerebras', 'mistral', 'google', 'anthropic', 'openai'],
  default: 'openrouter'
}
```

### Fallback Chain

```
moonshotai/kimi-k2.5 -> (no in-agent model fallback defined)
```

Cross-agent fallback: `pi -> opencode (opencode/kimi-k2.5-free)`

### Issues Found

| Issue | Severity | Status | Details |
|-------|----------|--------|---------|
| No `--mode json` in adapter | Medium | Open | Missing structured output with token counts |
| No `--no-session` in adapter | Low | Open | Session files accumulate at `~/.pi/agent/sessions/` |
| No `prepareStdin` | N/A | Correct | Pi uses `-p` flag, not stdin |
| No `postProcessOutput` | N/A | Correct | Pi output is clean text |
| Missing in-agent fallback chain | Medium | Open | Only cross-agent fallback exists; no model escalation within Pi |
| `buildEnv` key file parsing inconsistent | Low | Open | OpenRouter/Mistral parse `KEY=value` format, Cerebras reads raw file content |
| `google` provider not wired in `buildEnv` | Low | Open | No `GEMINI_API_KEY` injection; relies on env var |
| `anthropic`/`openai` providers not wired in `buildEnv` | Low | Open | No key injection; relies on env var |
| `huggingface` provider not in adapter mapping | Low | Open | Would fall through to `openrouter` default |
| No `--thinking` level control | Low | Open | Could improve quality with thinking levels |

### Recommended Adapter Improvements

1. **Add `--no-session`** to prevent session file accumulation
2. **Add `--mode json`** for structured output with token counts and cost
3. **Add in-agent fallback chain** for model escalation (e.g., free models -> paid models)
4. **Wire missing providers in `buildEnv`** - google (GEMINI_API_KEY), anthropic (ANTHROPIC_API_KEY), openai (OPENAI_API_KEY)
5. **Add `huggingface`** to the provider mapping function

---

## Comparison with Other Agents

| Feature | Pi | Claude Code | Codex | Gemini |
|---------|-----|-------------|-------|--------|
| Multi-provider | 8+ providers | Anthropic only | OpenAI only | Google only |
| Non-interactive | `-p` | `-p` | `--quiet` | `-` (stdin) |
| JSON output | `--mode json` (NDJSON) | `--output-format json` | N/A | N/A |
| Session resume | `-c`, `-r` | `--resume`, `-c` | N/A | N/A |
| Extension system | TypeScript extensions | MCP servers | N/A | N/A |
| Skills | Agent Skills standard | Skills | N/A | N/A |
| Context compaction | Auto (configurable) | Auto | N/A | N/A |
| RPC mode | `--mode rpc` | `--mode rpc` (experimental) | N/A | N/A |
| Thinking levels | 6 levels | 3 levels | N/A | N/A |
| Tool control | `--tools`, `--no-tools` | `--tools`, `--allowedTools` | N/A | N/A |

---

## Validation Checklist

- [x] `pi --version` returns 0.52.9
- [x] `which pi` resolves to `~/.npm-global/bin/pi`
- [x] `pi -p "hello" --provider openrouter --model openrouter/auto` completes
- [x] `pi -p "hello" --provider google` completes (free tier)
- [x] `pi --list-models` returns 365+ models across 8 providers
- [x] `pi -p "hello" --mode json` returns NDJSON with usage data
- [x] `pi list` shows installed extensions (none currently)
- [x] `pi --no-session` flag exists in help
- [x] Session files stored at `~/.pi/agent/sessions/`
- [x] No `auth.json` exists (using env vars only)
- [ ] `pi -p "test" --provider groq --model kimi-k2-instruct` completes (free tier)
- [ ] `pi -p "test" --provider cerebras --model gpt-oss-120b` completes (free tier)
- [ ] `--mode json` output parsed for token extraction in dispatch
