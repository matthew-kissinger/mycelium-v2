# Agent-Provider-Model Matrix

**Updated:** 2026-02-10
**Source of truth:** DB tables `agents`, `providers`, `models` (seeded from `packages/shared/src/schemas/agent-matrix.ts`, grows via provider API fetch)

---

## Quick Reference

| Agent | Provider(s) | Billing | Default Model | CLI |
|-------|-------------|---------|---------------|-----|
| claude | anthropic | sub | sonnet | `claude` |
| codex | openai | sub | gpt-5.2-codex | `codex` |
| cursor | cursor | sub | composer-1 | `agent` |
| kiro | aws | sub | default | `kiro-cli` |
| copilot | github | sub | claude-opus-4.6 | `copilot` |
| gemini | google | free | flash | `gemini` |
| opencode | opencode-zen | free | kimi-k2.5-free | `opencode` |
| cline | openrouter, cline | $/tok | kimi-k2.5 | `cline` |
| vibe | mistral | $/tok | default | `vibe` |
| pi | openrouter, groq, cerebras, mistral, google, anthropic, openai | varies | varies | `pi` |

**Note:** `groq` and `cerebras` are providers (used via `pi --provider groq`), not standalone agents.

---

## Complete Matrix

### Subscription Agents (Unlimited)

#### claude (anthropic)
| Model | Context | Best For |
|-------|---------|----------|
| opus | 200K | Architecture, complex debugging, nuanced decisions |
| sonnet | 200K | Balanced - most tasks |
| haiku | 200K | Simple fixes, docs, quick iterations |

#### codex (openai)
| Model | Context | Best For |
|-------|---------|----------|
| gpt-5.3-codex | 400K | Latest, most capable codex |
| gpt-5.2-codex | 400K | Balanced code generation |
| gpt-5.2-codex-high | 400K | Complex refactors |
| gpt-5.2-codex-fast | 400K | Quick edits |

#### cursor (cursor)
| Model | Context | Best For |
|-------|---------|----------|
| opus-4.6-thinking | 200K | Default, best reasoning, architecture |
| opus-4.6 | 200K | Non-thinking opus, fast reasoning |
| composer-1 | 200K | Multi-file composition, large refactors |
| sonnet-4.5-thinking | 200K | Balanced with thinking |
| sonnet-4.5 | 200K | Balanced feature work |
| gpt-5.2-codex | 400K | Mechanical tasks |
| gpt-5.2-codex-xhigh | 400K | Highest quality codex |
| gemini-3-flash | 1M | Fast iteration |
| grok | 128K | Alternative perspective |

#### kiro (aws)

**Note:** No `--model` CLI flag. Model routed by AWS.

| Model | Best For |
|-------|----------|
| default | Auto-routing, balanced |
| claude-opus-4.6 | Most intelligent, latest |
| claude-opus-4.5 | Complex coding |
| claude-sonnet-4.5 | Balanced, fast |
| claude-sonnet-4.0 | Stable, predictable |
| claude-haiku-4.5 | Fast, cost-effective |

#### copilot (github)

**Note:** Supports `--model` flag.

| Model | Best For |
|-------|----------|
| claude-opus-4.6 | Default, most capable |
| claude-sonnet-4.5 | Code quality, balanced |
| claude-sonnet-4 | Stable |
| claude-haiku-4.5 | Fast |
| gpt-5.2 | Latest OpenAI |
| gpt-5.1, gpt-5.1-codex-mini, gpt-5-mini | OpenAI alternatives |
| gpt-4.1 | Legacy, reliable |
| gemini-3-pro-preview | Large context |

---

### Free Agents (Rate-limited)

#### gemini (google)

**Note:** CLI requires `-preview` suffix for Gemini 3 models. `gemini-3-pro` and `gemini-3-flash` are NOT valid gemini CLI model IDs.

| Model | Context | Notes |
|-------|---------|-------|
| gemini-3-pro-preview | 1M | Deep research, complex analysis |
| gemini-3-flash-preview | 1M | Fast iteration, most tasks |
| flash | 1M | Alias for default flash |
| gemini-2.5-pro | 1M | Large context, stable |
| gemini-2.5-flash | 1M | Fast, large context |

Free tier with daily quota limits. Quota errors include reset time.

#### opencode (opencode-zen)
| Model | Context | Notes |
|-------|---------|-------|
| opencode/kimi-k2.5-free | 262K | Best free coder |
| opencode/glm-4.7-free | 200K | Function calling |
| opencode/gpt-5-nano | 400K | Fast |
| opencode/big-pickle | 128K | Alternative |
| opencode/trinity-large-preview-free | 131K | Alternative |
| opencode/minimax-m2.1-free | 128K | Alternative |

---

### Per-Use Agents ($/token)

#### cline (openrouter)

**Top models by usage (sorted by tokens processed):**

| Model | $/1K in | $/1K out | Context | Notes |
|-------|---------|----------|---------|-------|
| moonshotai/kimi-k2.5 | $0.45 | $2.50 | 262K | #1 usage, top coder |
| google/gemini-3-flash-preview | $0.10 | $0.40 | 1M | #2 usage, fast, cheap |
| anthropic/claude-opus-4.5 | $15.0 | $75.0 | 200K | Best reasoning, thinking |
| anthropic/claude-sonnet-4.5 | $3.0 | $15.0 | 200K | Balanced claude |
| anthropic/claude-sonnet-4 | $3.0 | $15.0 | 200K | Stable claude |
| anthropic/claude-haiku-4.5 | $0.80 | $4.0 | 200K | Fast claude |
| deepseek/deepseek-v3.2 | $0.25 | $0.38 | 164K | Best value |
| x-ai/grok-4.1-fast | $1.0 | $3.0 | 128K | Fast, capable |
| minimax/minimax-m2.1 | $0.50 | $1.50 | 128K | Balanced |
| z-ai/glm-4.5-air | $0.10 | $0.40 | 131K | Function calling |
| google/gemini-2.5-flash | $0.075 | $0.30 | 1M | Fast, large context |
| google/gemini-3-pro-preview | $1.25 | $5.0 | 1M | Most capable google |
| z-ai/glm-4.7 | $0.40 | $1.50 | 203K | Function calling, latest |
| z-ai/glm-4.7-flash | $0.07 | $0.40 | 200K | Fast GLM |
| openai/gpt-5.2 | $2.50 | $10.0 | 400K | Latest OpenAI |
| nvidia/nemotron-3-nano-30b-a3b | $0.10 | $0.30 | 128K | Efficient |
| qwen/qwen3-coder | $0.22 | $0.95 | 262K | 480B MoE, SWE-bench |
| mistralai/devstral-2512 | $0.05 | $0.22 | 262K | Cheapest coder |

**Free on OpenRouter:**
- `arcee-ai/trinity-large-preview:free` - #3 by usage
- `stepfun/step-3.5-flash:free` - Fast
- `deepseek/deepseek-r1-0528:free` - Reasoning
- `qwen/qwen3-coder:free` - Top coder
- `z-ai/glm-4.5-air:free` - Function calling
- `meta-llama/llama-3.3-70b-instruct:free` - General

#### vibe (mistral)

**Note:** No `--model` CLI flag. Model auto-selected by Mistral.

| Model | Notes |
|-------|-------|
| default | Auto-selects best model |
| devstral-latest | Coding agent |
| devstral-small-latest | Fast coding |
| codestral-latest | Code generation |

#### pi (multi-provider)

**Providers and key models:**

| Provider | Billing | Key Models |
|----------|---------|------------|
| openrouter | $/tok | kimi-k2.5, gemini-3-flash, deepseek-v3.2, sonnet-4.5, trinity-free |
| groq | free | kimi-k2-instruct, llama-3.3-70b-versatile |
| cerebras | free | llama-3.3-70b, qwen-3-235b, glm-4.7 |
| mistral | $/tok | mistral-large-latest, devstral-latest |
| google | free | gemini-2.5-flash, gemini-2.5-pro |
| anthropic | $/tok | claude-sonnet-4.5, claude-haiku-4.5 |
| openai | $/tok | gpt-5.2, gpt-5-mini |

---

## Task-to-Agent Mapping

| Task Type | Agent | Provider | Model | Why |
|-----------|-------|----------|-------|-----|
| Simple fix | pi | groq | kimi-k2-instruct | Free, ultra-fast |
| Simple fix | pi | cerebras | llama-3.3-70b | Free, ultra-fast |
| Simple fix | opencode | - | kimi-k2.5-free | Free, capable |
| Docs/comments | claude | - | haiku | Sub, fast |
| Feature | claude | - | sonnet | Sub, balanced |
| Feature | cursor | - | composer-1 | Sub, multi-file |
| Refactor | codex | - | gpt-5.2-codex | Sub, code-focused |
| Complex | claude | - | opus | Sub, best reasoning |
| Complex | cursor | - | opus-4.6-thinking | Sub, extended thinking |
| Bulk/mechanical | cline | openrouter | deepseek-v3.2 | Cheap $0.25/$0.38 |
| Research | copilot | - | default | GitHub MCP built-in |
| Exploration | gemini | - | flash | Free quota |

**Note:** `-` means no --provider needed (single-provider agent).

---

## CLI Examples

```bash
# Single-provider agents (NO --provider needed)
mycel task create "fix bug" --agent claude --model sonnet --repo /path
mycel task create "refactor" --agent cursor --model composer-1 --repo /path
mycel task create "docs" --agent opencode --model opencode/kimi-k2.5-free --repo /path
mycel task create "explore" --agent gemini --model flash --repo /path

# Multi-provider agents (MUST specify --provider)
mycel task create "feature" --agent cline --provider openrouter --model kimi-k2.5 --repo /path
mycel task create "task" --agent cline --provider openrouter --model deepseek/deepseek-r1-0528:free --repo /path

# Pi with different providers (MUST specify --provider)
mycel task create "simple fix" --agent pi --provider groq --model kimi-k2-instruct --repo /path
mycel task create "simple fix" --agent pi --provider cerebras --model llama-3.3-70b --repo /path
mycel task create "task" --agent pi --provider openrouter --model qwen/qwen3-coder:free --repo /path
```

---

## Credentials

| Provider | Location | Status |
|----------|----------|--------|
| Groq | `~/.groq/config.json` | Configured |
| Cerebras | `~/.config/mk-agent/CEREBRAS_API_KEY` | Configured |
| Mistral | `~/.config/mk-agent/MISTRAL_API_KEY` | Configured |
| OpenRouter | `~/.config/mk-agent/OPENROUTER_API_KEY` | Configured |
| Copilot | `~/.config/mk-agent/COPILOT_TOKEN` | Configured |
| Claude | `~/.claude/` | Managed by CLI |
| Cursor | `~/.cursor/` | Managed by CLI |
| Cline | `~/.cline/data/` | Managed by CLI |
| Kiro | `~/.local/share/kiro-cli/` | AWS SSO |
| OpenCode | `~/.local/share/opencode/` | Interactive |

---

## Cost Strategy

1. **Prefer subscription** (claude, codex, cursor, kiro, copilot) - unlimited
2. **Use free** (groq, opencode, gemini) for simple tasks
3. **Use free OpenRouter models** (cline with :free suffix) when possible
4. **Reserve per-use** (cline/pi paid models) for specific capabilities
5. **Use cerebras/groq via pi** for free ultra-fast inference

**Current OpenRouter balance:** Check via `/api/health`
