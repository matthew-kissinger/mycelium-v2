# OpenAI Codex CLI - Agent Decomposition

**CLI:** `codex`
**Version:** 0.99.0 (updated 2026-02-11)
**Vendor:** OpenAI
**Install:** bun global (`~/.bun/bin/codex`)
**Config dir:** `~/.codex/`
**Binary:** Rust-based native binary

---

## Authentication

Codex supports two auth modes: ChatGPT login (subscription) and API key (pay-per-token).

| Method | Priority | How | Status |
|--------|----------|-----|--------|
| ChatGPT OAuth | 1 (preferred) | `codex login` device flow | **Active (Pro plan)** |
| `OPENAI_API_KEY` env | 2 (fallback) | Env var or `codex login --with-api-key` | Available but unused |
| `~/.codex/auth.json` | Storage | Stores tokens, refresh token, account ID | Present |

### Current Auth State

- `auth_mode`: `chatgpt` (using ChatGPT subscription)
- `OPENAI_API_KEY` in auth.json: `null` (not using API key auth)
- Plan: ChatGPT Pro (subscription active until 2026-02-19)
- Account: MKVision org (owner)
- `codex login status` -> "Logged in using ChatGPT"

### Auth Files

- `~/.codex/auth.json` - OAuth tokens (id_token, access_token, refresh_token, account_id)
- Tokens are JWTs with expiry, codex handles refresh automatically
- `last_refresh` field tracks when tokens were last refreshed

### OPENAI_API_KEY Env Var Conflict

`OPENAI_API_KEY` is set in `~/.config/mk-agent/env` (an `sk-proj-...` key). This key is loaded into the server process environment by the mycelium backend.

**Current behavior:** Codex checks `~/.codex/auth.json` first. Since `auth_mode` is `chatgpt` and the OAuth tokens are valid, it uses subscription auth regardless of `OPENAI_API_KEY` in the environment. **No conflict observed** - the env var is ignored when ChatGPT OAuth is active.

**Potential risk:** If `auth.json` is missing or tokens expire and cannot refresh, codex could fall back to the `OPENAI_API_KEY` from the environment. This would switch from subscription billing (included in Pro plan) to API billing (pay-per-token from the $40 API credit balance). This is a billing concern but not a breakage risk.

**No adapter fix needed** (unlike Claude's ANTHROPIC_API_KEY and Copilot's GITHUB_TOKEN issues). Codex prioritizes its own auth.json over env vars, and both auth methods work.

---

## Models

Models are cached in `~/.codex/models_cache.json` and refreshed from OpenAI's API. All models require ChatGPT Pro subscription.

### Available Models (from cache, 2026-02-12)

| Model | Description | Reasoning Levels | API Support |
|-------|-------------|-----------------|-------------|
| `gpt-5.3-codex` | Latest frontier agentic coding model | low/medium/high/xhigh | Yes |
| `gpt-5.2-codex` | Frontier agentic coding model | low/medium/high/xhigh | Yes |
| `gpt-5.1-codex-max` | Codex-optimized flagship, deep reasoning | low/medium/high/xhigh | Yes |
| `gpt-5.1-codex` | Optimized for codex | low/medium/high/xhigh | Yes |
| `gpt-5.2` | Latest frontier model (general) | low/medium/high/xhigh | Yes |
| `gpt-5.1` | Broad world knowledge, strong reasoning | low/medium/high/xhigh | Yes |
| `gpt-5-codex` | Optimized for codex (previous gen) | low/medium/high/xhigh | Yes |
| `gpt-5` | Broad world knowledge (previous gen) | low/medium/high/xhigh | Yes |
| `gpt-5.1-codex-mini` | Cheaper, faster, less capable | low/medium/high/xhigh | Yes |
| `gpt-5-codex-mini` | Cheaper, faster, less capable | low/medium/high/xhigh | Yes |

### Model Selection

- Default model is `gpt-5.2-codex` (hardcoded in mycelium agent-matrix)
- Models are selected via `-m <model>` flag
- Invalid model names return HTTP 400 with clear error message
- Reasoning effort levels: `low`, `medium` (default), `high`, `xhigh`

### Model Notes

- All `-codex` models are optimized for code generation tasks
- `-mini` variants are cheaper but less capable
- `-max` variant has deepest reasoning
- Non-codex models (`gpt-5.2`, `gpt-5.1`, `gpt-5`) are general-purpose
- The agent-matrix defines reasoning variants like `gpt-5.2-codex-high`, `gpt-5.2-codex-fast` but these are not in the models cache - they may be config-level reasoning effort overrides

### Provider

Codex is single-provider: **OpenAI only**. It connects to OpenAI's Responses API. No third-party provider support (no OpenRouter, no local models by default).

The `--oss` flag enables local model providers (LM Studio or Ollama) but this is separate from the main OpenAI provider.

---

## CLI Flags Reference

### Main Command (`codex`)

```
codex [OPTIONS] [PROMPT]     # Interactive TUI mode
codex exec [OPTIONS] [PROMPT] # Non-interactive (what mycelium uses)
```

### Key Flags for `codex exec`

| Flag | Description | Mycelium Use |
|------|-------------|-------------|
| `[PROMPT]` | Positional arg or stdin | Prompt passed positionally |
| `-m, --model <MODEL>` | Model selection | Yes, from task config |
| `--full-auto` | Alias for `-a on-request --sandbox workspace-write` | **Currently used** |
| `--dangerously-bypass-approvals-and-sandbox` | No confirmation, no sandbox | Alternative option |
| `-s, --sandbox <MODE>` | `read-only`, `workspace-write`, `danger-full-access` | Via `--full-auto` |
| `-a, --ask-for-approval <POLICY>` | `untrusted`, `on-failure`, `on-request`, `never` | Via `--full-auto` |
| `-C, --cd <DIR>` | Working directory | Not used (cwd set by dispatch) |
| `--json` | JSONL output to stdout | **Not used (should be)** |
| `--color <COLOR>` | `always`, `never`, `auto` | Not used |
| `-o, --output-last-message <FILE>` | Write last agent message to file | Not used |
| `--skip-git-repo-check` | Allow running outside git repo | Not used (worktrees are git) |
| `--search` | Enable web search tool | Not used |
| `-i, --image <FILE>` | Attach images | Not used |
| `-c, --config <key=value>` | Override config.toml values | Not used |
| `--add-dir <DIR>` | Additional writable dirs | Not used |
| `--output-schema <FILE>` | JSON schema for response | Not used |
| `-p, --profile <PROFILE>` | Config profile | Not used |

### Approval Policies Explained

- `untrusted`: Only trusted commands (ls, cat, sed) auto-approve
- `on-failure`: Auto-approve all, escalate on failure
- `on-request`: Model decides when to ask (used by `--full-auto`)
- `never`: Never ask - failures go back to model immediately

### Sandbox Modes

- `read-only`: Can read files, no writes
- `workspace-write`: Read anything, write only in workspace dir
- `danger-full-access`: No restrictions

---

## Configuration

### Config File: `~/.codex/config.toml`

```toml
personality = "pragmatic"     # pragmatic | friendly

[projects."/path/to/repo"]
trust_level = "trusted"       # trusted | untrusted

[mcp_servers.name]
command = "npx"
args = ["-y", "package-name"]
```

Currently configured MCP servers: context7, playwright, exa, github.

### Config Override via CLI

```bash
codex exec -c model="gpt-5.3-codex" -c 'sandbox_permissions=["disk-full-read-access"]' "prompt"
```

### Key Config Keys

- `model` - Default model
- `personality` - Agent personality (pragmatic/friendly)
- `model_provider` - `openai` or `oss`
- `sandbox_permissions` - Array of permission strings
- `shell_environment_policy.inherit` - `all` or selective
- `features.<name>` - Feature flag toggles

### Data Files

| File | Purpose |
|------|---------|
| `~/.codex/auth.json` | OAuth tokens (ChatGPT or API key) |
| `~/.codex/config.toml` | Configuration |
| `~/.codex/models_cache.json` | Cached model list (auto-refreshed) |
| `~/.codex/history.jsonl` | Session history (prompts + timestamps) |
| `~/.codex/version.json` | Version check cache |
| `~/.codex/sessions/` | Session data for resume/fork |
| `~/.codex/skills/` | Custom and system skills |
| `~/.codex/log/` | Debug logs |
| `~/.codex/tmp/` | Temporary files |

### Feature Flags (from `codex features list`)

| Feature | Stage | Default |
|---------|-------|---------|
| `undo` | stable | false |
| `shell_tool` | stable | true |
| `unified_exec` | stable | true |
| `exec_policy` | under development | true |
| `remote_compaction` | under development | true |
| `remote_models` | under development | true |
| `enable_request_compression` | stable | true |
| `steer` | stable | true |
| `collaboration_modes` | stable | true |
| `personality` | stable | true |
| `skill_mcp_dependency_install` | stable | true |
| `request_rule` | stable | true |

---

## JSON Output Format

When `--json` is passed to `codex exec`, output is JSONL (one JSON object per line):

```jsonl
{"type":"thread.started","thread_id":"019c4f35-b1a7-..."}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"..."}}
{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"..."}}
{"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"...","aggregated_output":"...","exit_code":0,"status":"completed"}}
{"type":"turn.completed","usage":{"input_tokens":12597,"cached_input_tokens":5888,"output_tokens":23}}
{"type":"error","message":"..."}
{"type":"turn.failed","error":{"message":"..."}}
```

### Key Event Types

- `thread.started` - Session begins, includes thread_id
- `turn.started` - Turn begins
- `item.completed` with `type:"reasoning"` - Thinking/reasoning step
- `item.completed` with `type:"agent_message"` - Final text response
- `item.completed` with `type:"command_execution"` - Tool use (shell commands)
- `turn.completed` - Includes `usage` with exact token counts
- `error` / `turn.failed` - Error occurred

### Token Tracking

The `turn.completed` event includes exact token usage:
```json
{"input_tokens": 12597, "cached_input_tokens": 5888, "output_tokens": 23}
```

This is important: mycelium's `estimateTokens()` regex looks for `input_tokens` and `output_tokens` patterns in output text, and **it will match these from the JSON output**. With `--json`, token tracking becomes accurate rather than estimated.

---

## Billing

### Current: ChatGPT Pro Subscription

- Plan: ChatGPT Pro ($200/month)
- Subscription active until 2026-02-19
- All codex models included in subscription
- No per-token charges for subscription auth
- Billing type in mycelium: `subscription`

### Alternative: API Key

- `OPENAI_API_KEY` is available (`sk-proj-...` in `~/.config/mk-agent/env`)
- API billing is pay-per-token
- $40 API credits available (per agent-matrix notes)
- Would require switching auth mode or setting env var

### Cost Tracking in Mycelium

- Billing type: `subscription` (cost_usd = 0 for all tasks)
- No OpenRouter integration (codex is single-provider)
- Token counts available from `--json` output but not cost

---

## Current Adapter (UPDATED 2026-02-11)

### File: `packages/server/src/agents/adapters/codex.ts`

```typescript
export const codexAdapter: AgentAdapter = {
  id: 'codex',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    return [
      'exec',
      prompt,
      ...(model ? ['--model', model] : []),
      '--full-auto',
      '--json',
      '--color', 'never',
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },

  postProcessOutput(output: string): string {
    // With --json, output is JSONL. Extract the final agent_message text.
    const lines = output.trim().split('\n')
    let lastMessage = ''
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
          lastMessage = event.item.text ?? ''
        }
      } catch { /* Non-JSON line, skip */ }
    }
    return lastMessage || output
  },
}
```

### Issues Status

| Issue | Status | Notes |
|-------|--------|-------|
| No `--json` flag | **FIXED** | Added, gives JSONL with exact token counts |
| No `--color never` | **FIXED** | Added, prevents ANSI pollution |
| No `postProcessOutput()` | **FIXED** | Extracts agent_message from JSONL |
| MCP startup overhead | Open | 4 MCP servers start on every exec (~2-3s) |
| `--full-auto` approval | Open | Model can still try to ask for approval |
| `buildEnv()` empty | OK | Codex ignores OPENAI_API_KEY when OAuth active |

---

## Env Var Poisoning Analysis

Environment variables from `~/.config/mk-agent/env` that flow through `process.env` to spawned codex processes:

| Env Var | Risk to Codex | Notes |
|---------|---------------|-------|
| `OPENAI_API_KEY` | **Low** | Codex ignores when ChatGPT OAuth is active. Would be used if OAuth expires. |
| `ANTHROPIC_API_KEY` | None | Codex doesn't use Anthropic APIs |
| `GOOGLE_API_KEY` | None | Codex doesn't use Google APIs |
| `GITHUB_TOKEN` | **Low** | MCP github server might use it; codex itself doesn't |
| `GROQ_API_KEY` | None | Codex doesn't use Groq |
| `MISTRAL_API_KEY` | None | Codex doesn't use Mistral |
| `OPENROUTER_API_KEY` | None | Codex doesn't use OpenRouter |
| `CEREBRAS_API_KEY` | None | Codex doesn't use Cerebras |
| `TELEGRAM_BOT_TOKEN` | None | Irrelevant |
| `HF_TOKEN` | None | Irrelevant |
| `EXA_API_KEY` | **Low** | The exa MCP server might use it |
| `COPILOT_TOKEN` | None | Irrelevant |

**Verdict:** No env var poisoning issues for codex. The OPENAI_API_KEY situation is a billing concern (subscription vs API), not a breakage concern. The MCP servers (github, exa) may use leaked tokens, but this is expected behavior.

---

## Test Results

### Basic Execution (works)

```bash
$ codex exec --json -m gpt-5-codex-mini "respond with exactly: HELLO_TEST" \
    --skip-git-repo-check --sandbox read-only -C /tmp
{"type":"thread.started","thread_id":"..."}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"..."}}
{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"HELLO_TEST"}}
{"type":"turn.completed","usage":{"input_tokens":12597,"cached_input_tokens":5888,"output_tokens":23}}
```

### Latest Model (works)

```bash
$ codex exec --json -m gpt-5.3-codex "respond with exactly: LATEST_TEST" \
    --skip-git-repo-check --sandbox read-only -C /tmp
# Returns LATEST_TEST, ~12K input tokens, 20 output tokens
```

### Invalid Model (fails cleanly)

```bash
$ codex exec --json -m gpt-nonexistent "say hello" --skip-git-repo-check -C /tmp
# Exit code 1
# {"type":"error","message":"{\"detail\":\"The 'gpt-nonexistent' model is not supported...\"}"}
```

### Non-git Directory Without Flag (fails)

```bash
$ codex exec -m gpt-5-codex-mini "say hello" --sandbox read-only -C /tmp
# Exit code 1: "Not inside a trusted directory and --skip-git-repo-check was not specified."
```

### Git Directory Without Flag (works)

```bash
$ codex exec --json -m gpt-5-codex-mini "say hello" -C /home/mkagent/mycelium-v2
# Works fine - git repo detected
```

### Tool Use / Command Execution (works)

```bash
$ codex exec --json -m gpt-5-codex-mini "list files in current directory" \
    --sandbox workspace-write -C /tmp --skip-git-repo-check
# Runs shell commands, outputs command_execution events with results
```

### Non-interactive Output (with -o flag)

```bash
$ codex exec -m gpt-5-codex-mini "respond with exactly: HELLO" \
    --skip-git-repo-check -C /tmp -o /tmp/output.txt
# Prints TUI-style output to stderr
# Writes last message to /tmp/output.txt
# Note: output appears twice (in TUI and in file)
```

---

## Fallback Chain

From mycelium's fallback configuration:

```
gpt-5.2-codex-fast -> gpt-5.2-codex -> gpt-5.2-codex-high -> gpt-5.3-codex -> (cross-agent) cursor/composer-1.5
```

Cross-agent fallback: `codex -> cursor (composer-1.5)`
Default model: `gpt-5.2-codex`

---

## Subcommands Reference

| Subcommand | Purpose | Relevance to Mycelium |
|------------|---------|----------------------|
| `exec` | Non-interactive execution | **Primary use** |
| `review` | Code review (non-interactive) | Could be useful for shepherd |
| `login` / `logout` | Auth management | Setup only |
| `mcp` | MCP server management | Configuration |
| `cloud` | Codex Cloud tasks | Not used |
| `resume` / `fork` | Session management | Not used |
| `apply` | Apply git diffs | Not used |
| `sandbox` | Run commands in sandbox | Not used |
| `features` | Feature flag management | Debugging |
| `debug` | Debug tools | Debugging |
| `completion` | Shell completions | Setup only |

---

## Remaining Improvements

1. **Consider MCP server disable** via `-c mcp_servers={}` to reduce startup overhead (~2-3s per task)
2. **Consider `-a never`** instead of `--full-auto` for fully automated dispatch
3. **Consider `--skip-git-repo-check`** for defensive programming
4. **Consider `codex review`** subcommand for shepherd evaluation tasks
