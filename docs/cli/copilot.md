# GitHub Copilot CLI - Agent Decomposition

**CLI:** `copilot`
**Version:** 0.0.407 (updated 2026-02-11)
**Vendor:** GitHub
**Install:** npm global (`~/.npm-global/bin/copilot`)
**Config dir:** `~/.copilot/`

---

## Authentication

Copilot uses GitHub OAuth via device flow, stored locally. **Not API key based.**

| Method | Priority | How | Status |
|--------|----------|-----|--------|
| `COPILOT_GITHUB_TOKEN` env | 1 (highest) | Env var | Not set |
| `GH_TOKEN` env | 2 | Env var | Not set |
| `GITHUB_TOKEN` env | 3 | Env var | **SET (leaking from mk-agent/env) - CAUSES 401** |
| Stored OAuth | 4 (fallback) | `copilot login` | **Working** |

### Known Issue (2026-02-10)

`GITHUB_TOKEN` (fine-grained PAT for GitHub API) is sourced from `~/.config/mk-agent/env` into shell env. Copilot CLI picks it up and tries to use it for model access, but the PAT doesn't have Copilot scope. Result: **401 on model listing, instant failure, empty output, exit code 1.**

This caused **all 8+ Copilot task failures** in the Feb 10 run. Every Copilot task failed in ~2-3s with empty output, then fell back to Claude (which then also failed when credits ran out).

**Fix:** Adapter must strip `GITHUB_TOKEN` from spawned process env so Copilot falls back to its own stored OAuth credentials.

### Additional Issue

The adapter's `getCopilotToken()` looks for `~/.config/mk-agent/COPILOT_TOKEN` as a **file**, but `COPILOT_TOKEN` is defined as an **env var** in `~/.config/mk-agent/env`. The file doesn't exist, so `getCopilotToken()` always returns null. The adapter then sets nothing for `GH_TOKEN`, but `GITHUB_TOKEN` leaks through `process.env` anyway and breaks auth.

### Verified Working

```bash
# With GITHUB_TOKEN stripped - uses stored OAuth, works perfectly
GITHUB_TOKEN="" copilot -p "hello" --model claude-sonnet-4.5 --allow-all-tools --no-ask-user
# EXIT: 0

# With GITHUB_TOKEN present - 401 on model listing
copilot -p "hello" --model claude-sonnet-4.5 --allow-all-tools --no-ask-user
# EXIT: 1 (empty output)
```

---

## Models

**Copilot is multi-provider.** It supports Claude (Anthropic), GPT (OpenAI), and Gemini (Google) models through GitHub's subscription.

### Available Models (from `--model` choices)

| Model ID | Family | Premium Requests | Tier |
|----------|--------|-----------------|------|
| `claude-opus-4.6` | Anthropic | 3 per request | Expensive |
| `claude-opus-4.5` | Anthropic | (legacy) | Expensive |
| `claude-sonnet-4.5` | Anthropic | 1 per request | Standard |
| `claude-sonnet-4` | Anthropic | (legacy) | Standard |
| `claude-haiku-4.5` | Anthropic | 0.33 per request | Cheap |
| `gemini-3-pro-preview` | Google | 1 per request | Standard |
| `gpt-5.2-codex` | OpenAI | 1 per request | Standard |
| `gpt-5.2` | OpenAI | 1 per request | Standard |
| `gpt-5.1-codex-max` | OpenAI | (unknown) | Premium |
| `gpt-5.1-codex` | OpenAI | (unknown) | Standard |
| `gpt-5.1` | OpenAI | (unknown) | Standard |
| `gpt-5` | OpenAI | (unknown) | Standard |
| `gpt-5.1-codex-mini` | OpenAI | (unknown) | Cheap |
| `gpt-5-mini` | OpenAI | 0 per request | Free |
| `gpt-4.1` | OpenAI | 0 per request | Free |

### Premium Request Costs (Verified)

| Model | Est. Premium Requests | Notes |
|-------|----------------------|-------|
| `claude-opus-4.6` | **3** | Most expensive |
| `claude-sonnet-4.5` | 1 | Standard |
| `claude-haiku-4.5` | 0.33 | Cheap |
| `gemini-3-pro-preview` | 1 | Standard |
| `gpt-5.2-codex` | 1 | Standard |
| `gpt-5-mini` | **0** | Free tier |
| `gpt-4.1` | **0** | Free tier |

### Optimal Model Strategy

- **Free tasks (unlimited):** `gpt-4.1` or `gpt-5-mini` (0 premium requests)
- **Standard tasks:** `claude-sonnet-4.5` or `gpt-5.2-codex` (1 premium request)
- **Complex tasks:** `claude-opus-4.6` (3 premium requests - use sparingly)
- **Cheap Claude:** `claude-haiku-4.5` (0.33 premium requests - 3x cheaper than sonnet)

---

## Configuration

### Config File (`~/.copilot/config.json`)

Current state:
```json
{
  "banner": "never",
  "render_markdown": true,
  "trusted_folders": ["/home/mkagent"],
  "model": "gemini-3-pro-preview"
}
```

### All Config Settings

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `model` | string | varies | Default AI model |
| `banner` | "always"\|"once"\|"never" | "once" | Startup banner |
| `render_markdown` | bool | true | Markdown rendering |
| `stream` | bool | true | Streaming mode |
| `trusted_folders` | string[] | [] | Trusted paths |
| `allowed_urls` | string[] | [] | Auto-allowed URLs |
| `denied_urls` | string[] | [] | Blocked URLs |
| `auto_update` | bool | true | Auto-update CLI |
| `log_level` | string | "default" | Logging level |
| `parallel_tool_execution` | bool | true | Parallel tools |
| `beep` | bool | true | Audio beep |
| `compact_paste` | bool | true | Collapse large pastes |
| `screen_reader` | bool | false | Accessibility |
| `theme` | "auto"\|"dark"\|"light" | "auto" | Terminal theme |
| `experimental` | bool | false | Experimental features |
| `launch_messages` | string[] | [] | Custom startup messages |
| `custom_agents.default_local_only` | bool | false | Local agents only |
| `update_terminal_title` | bool | true | Show intent in title bar |
| `undo_without_confirmation` | bool | false | Skip undo confirm (experimental) |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `COPILOT_GITHUB_TOKEN` | Auth token (highest priority) |
| `GH_TOKEN` | Auth token (second priority) |
| `GITHUB_TOKEN` | Auth token (third priority) |
| `COPILOT_MODEL` | Default model override |
| `COPILOT_ALLOW_ALL` | "true" = allow all tools |
| `COPILOT_AUTO_UPDATE` | "false" = disable auto-update |
| `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` | Extra instruction dirs |
| `XDG_CONFIG_HOME` | Override config dir |
| `XDG_STATE_HOME` | Override state dir |
| `USE_BUILTIN_RIPGREP` | "false" = use system rg |

---

## CLI Flags (Relevant to Mycelium Dispatch)

| Flag | Used | Purpose |
|------|------|---------|
| `-p <prompt>` | Yes | Non-interactive mode |
| `--model <model>` | Yes | Set model |
| `--allow-all-tools` | Yes | Skip tool prompts |
| `--no-ask-user` | Yes | Disable user questions |
| `-s, --silent` | **No (should use)** | Output only response, no stats |
| `--yolo` | No | Allow all (tools + paths + urls) |
| `--allow-all` | No | Same as --yolo |
| `--allow-all-paths` | **No (should use)** | Access any path |
| `--add-dir <dir>` | No | Allow extra directory |
| `--resume [id]` | No | Resume session |
| `--continue` | No | Resume last session |
| `--no-auto-update` | No | Skip update check |
| `--no-custom-instructions` | No | Skip AGENTS.md loading |
| `--additional-mcp-config` | No | Extra MCP servers |
| `--share` | No | Save session as markdown |
| `--log-level` | No | Debug logging |

---

## Mycelium Integration

### Current Adapter (`packages/server/src/agents/adapters/copilot.ts`)

```typescript
buildArgs(options): string[] {
  return [
    '-p', prompt,
    ...(model ? ['--model', model] : ['--model', 'claude-sonnet-4.5']),
    '--allow-all-tools',
    '--no-ask-user',
  ]
}

buildEnv(): Record<string, string> {
  const token = getCopilotToken()  // Looks for FILE, always returns null
  if (token) env.GH_TOKEN = token
  return env
}
```

### Issues Found

1. **GITHUB_TOKEN poisoning** - `process.env.GITHUB_TOKEN` (fine-grained PAT) leaks into spawned process and overrides stored OAuth. Must be stripped.

2. **getCopilotToken() dead code** - Looks for `~/.config/mk-agent/COPILOT_TOKEN` as a file, but it's an env var in the env file. Always returns null.

3. **Default model mismatch** - Adapter defaults to `claude-sonnet-4.5` if no model specified, but the local config says `gemini-3-pro-preview`. The adapter override is fine for our use case but worth knowing.

4. **Missing --allow-all-paths** - Without this, copilot can only access files in cwd. Worktrees at `~/.mycelium/worktrees/task-{id}` are the cwd, but some tasks may need to reference other paths.

5. **Missing -s (silent)** - Without this, stats output (premium requests, timing) is included in stdout, which contaminates the output parser.

6. **No token tracking** - Copilot reports premium requests and token counts in stats output. Should parse these for tracking.

### Recommended Adapter Changes

```typescript
buildArgs(options): string[] {
  return [
    '-p', prompt,
    ...(model ? ['--model', model] : []),  // Let config.json default apply
    '--allow-all-tools',
    '--no-ask-user',
    '--allow-all-paths',
    '--no-auto-update',
  ]
}

buildEnv(): Record<string, string> {
  // Strip GITHUB_TOKEN to prevent it from overriding stored OAuth
  return { GITHUB_TOKEN: '', GH_TOKEN: '' }
}
```

### Fallback Chain

Currently in fallback.ts: `copilot -> claude/sonnet` (cross-agent only, no in-agent model escalation)

Should add in-agent model escalation:
```
gpt-4.1 -> gpt-5-mini -> claude-haiku-4.5 -> claude-sonnet-4.5 -> claude-opus-4.6
```

Or by premium request cost:
```
gpt-4.1 (free) -> gpt-5-mini (free) -> claude-haiku-4.5 (0.33) -> claude-sonnet-4.5 (1) -> gpt-5.2-codex (1) -> claude-opus-4.6 (3)
```

### Model ID Mapping (Mycelium -> Copilot CLI)

| Mycelium DB model | Copilot --model |
|-------------------|-----------------|
| `claude-opus-4.6` | `claude-opus-4.6` |
| `claude-sonnet-4.5` | `claude-sonnet-4.5` |
| `claude-haiku-4.5` | `claude-haiku-4.5` |
| `gpt-5.2-codex` | `gpt-5.2-codex` |
| `gpt-5.2` | `gpt-5.2` |
| `gpt-5-mini` | `gpt-5-mini` |
| `gpt-4.1` | `gpt-4.1` |
| `gemini-3-pro-preview` | `gemini-3-pro-preview` |

No translation needed - IDs match directly.

---

## Billing

| Plan | Premium Requests | Monthly Cost |
|------|-----------------|-------------|
| GitHub Copilot Free | Limited | $0 |
| GitHub Copilot Pro | Unlimited (within limits) | $10/mo |
| GitHub Copilot Business | Per-seat | $19/seat/mo |
| GitHub Copilot Enterprise | Per-seat | $39/seat/mo |

Premium request costs vary by model (see table above). Free-tier models (`gpt-4.1`, `gpt-5-mini`) don't consume premium requests.

---

## Validation Checklist

- [x] `copilot --version` works
- [x] `copilot -p "hello" --model claude-sonnet-4.5 --allow-all-tools --no-ask-user` works (with GITHUB_TOKEN stripped)
- [x] Claude Sonnet 4.5 works (1 premium request)
- [x] Claude Haiku 4.5 works (0.33 premium requests)
- [x] Claude Opus 4.6 works (3 premium requests)
- [x] GPT-5.2-codex works (1 premium request)
- [x] GPT-5-mini works (0 premium requests)
- [x] GPT-4.1 works (0 premium requests)
- [x] Gemini 3 Pro Preview works (1 premium request)
- [x] GITHUB_TOKEN="" makes it fall back to stored OAuth
- [x] GITHUB_TOKEN set causes 401 failure
- [x] `--allow-all-paths` with worktree paths (verified 2026-02-11)
- [x] Session resume (`--resume` and `--continue`) (verified 2026-02-11)
- [x] Stats output parsing for premium request tracking (verified 2026-02-11)

---

## Key Insight: Copilot as Multi-Provider Agent

Copilot is unique among our agents - it's the **only CLI that provides access to Claude, GPT, AND Gemini models under a single subscription**. This means:

1. It can serve as a fallback for ANY model family
2. Free-tier models (gpt-4.1, gpt-5-mini) provide unlimited capacity for simple tasks
3. Model escalation within Copilot can cross provider boundaries (gpt-4.1 -> claude-sonnet-4.5)
4. It's effectively a superset of the claude, codex, and gemini agents for model access

This makes fixing Copilot high priority - when working correctly, it's the most versatile agent in the fleet.

---

## Follow-Up Research (2026-02-11)

### 1. Stats Output Parsing

**Critical discovery: stats go to stderr, not stdout.** This means the current adapter does NOT need `-s` to get clean output - stdout is already clean agent response only.

#### Output Format (stdout vs stderr)

```bash
# stdout contains ONLY the agent's response text
# stderr contains the stats block

GITHUB_TOKEN="" copilot -p "say hello" --model gpt-4.1 --allow-all-tools --no-ask-user \
  2>/tmp/stderr.txt 1>/tmp/stdout.txt

# stdout: "hello"
# stderr: (stats block below)
```

#### Stats Block Format (stderr)

```
Total usage est:        0 Premium requests
API time spent:         1s
Total session time:     15s
Total code changes:     +0 -0
Breakdown by AI model:
 gpt-4.1                 19.0k in, 3 out, 0 cached (Est. 0 Premium requests)
```

With premium model:
```
Total usage est:        3 Premium requests
API time spent:         2s
Total session time:     5s
Total code changes:     +0 -0
Breakdown by AI model:
 claude-opus-4.6         24.2k in, 6 out, 0 cached (Est. 3 Premium requests)
```

With tool usage:
```
Total usage est:        0 Premium requests
API time spent:         2s
Total session time:     5s
Total code changes:     +0 -0
Breakdown by AI model:
 gpt-4.1                 38.1k in, 44 out, 24.8k cached (Est. 0 Premium requests)
```

#### Parseable Fields

| Field | Regex | Example |
|-------|-------|---------|
| Total premium requests | `Total usage est:\s+(\d+) Premium request` | 3 |
| API time | `API time spent:\s+(\d+)s` | 2 |
| Session time | `Total session time:\s+(\d+)s` | 5 |
| Code changes | `Total code changes:\s+\+(\d+) -(\d+)` | +0 -0 |
| Per-model input tokens | `(\S+)\s+([\d.]+)k in` | gpt-4.1, 19.0k |
| Per-model output tokens | `([\d.]+) out` | 3 |
| Per-model cached tokens | `([\d.]+)k? cached` | 5.9k |
| Per-model premium | `Est\. (\d+) Premium request` | 0 |

#### Parsing Strategy for Adapter

```typescript
// Stats are on stderr. To parse without -s flag:
// 1. Capture stderr separately from the spawned process
// 2. Parse the stats regex from stderr
// 3. Return stdout as the agent output (already clean)

const premiumMatch = stderr.match(/Total usage est:\s+(\d+) Premium request/);
const premiumRequests = premiumMatch ? parseInt(premiumMatch[1]) : 0;

const modelMatch = stderr.match(/(\S+)\s+([\d.]+)k in, ([\d.]+) out/);
if (modelMatch) {
  const inputTokens = Math.round(parseFloat(modelMatch[2]) * 1000);
  const outputTokens = Math.round(parseFloat(modelMatch[3]));
}
```

#### Impact on Adapter

The `-s` (silent) flag is **NOT needed** for clean output parsing. Stats are already separated to stderr. However, `-s` suppresses the stats entirely, which means:

- **Without `-s`**: stdout = response, stderr = stats (can parse both)
- **With `-s`**: stdout = response, stderr = empty (no stats to parse)

**Recommendation:** Do NOT use `-s`. Instead, capture stderr separately and parse the stats for cost tracking.

### 2. Session Resume

Both `--continue` and `--resume [id]` work correctly.

#### Session Storage

Sessions are stored in `~/.copilot/session-state/{uuid}/` with:
- `workspace.yaml` - Session metadata (id, cwd, git_root, repo, branch, timestamps, summary)
- `events.jsonl` - Full conversation history as JSON events
- `checkpoints/` - Workspace state checkpoints
- `files/` - File snapshots

#### Resume Behavior

```bash
# Resume most recent session
GITHUB_TOKEN="" copilot --continue -p "what was the previous message?" --model gpt-4.1 --allow-all-tools --no-ask-user -s
# Output: "Your previous message was: "say hello"."

# Resume specific session by ID
GITHUB_TOKEN="" copilot --resume c437e961-91f8-429d-a119-ed4d79a5ea7e -p "what was the first message?" --model gpt-4.1 --allow-all-tools --no-ask-user -s
# Output: "The first message in this session was: "say hello"."
```

#### Session ID in Events

The session ID is recorded in the first event of `events.jsonl`:
```json
{"type":"session.start","data":{"sessionId":"92a63e18-...","version":1,"producer":"copilot-agent","copilotVersion":"0.0.407","startTime":"...","selectedModel":"gpt-4.1","context":{"cwd":"...","gitRoot":"...","branch":"master","repository":"matthew-kissinger/mycelium-v2"}}}
```

#### Mycelium Integration Potential

Session resume could enable:
1. **Retry without context loss** - Resume a failed session instead of starting fresh
2. **Multi-turn tasks** - Dispatch follow-up prompts to the same session
3. **Session ID tracking** - Store session UUID in `fruiting_sessions` table

However, the workspace.yaml also locks the session to a specific cwd/repo, so worktree paths must match.

### 3. --allow-all-paths with Worktree Paths

**Verified working.** Copilot can access files outside cwd when `--allow-all-paths` is set.

```bash
cd /tmp && GITHUB_TOKEN="" copilot -p "read /home/mkagent/mycelium-v2/package.json and tell me the name field" \
  --model gpt-4.1 --allow-all-tools --no-ask-user --allow-all-paths -s
# Output: The value of the name field is "mycelium-v2".
```

Without `--allow-all-paths`, file access is restricted to:
1. Current working directory and subdirectories
2. System temporary directory (unless `--disallow-temp-dir`)
3. Directories listed in `trusted_folders` config
4. Directories added via `--add-dir`

**Recommendation for adapter:** Use `--allow-all-paths` since worktrees may need to reference files in the main repo or other worktrees. Alternatively, `--yolo` or `--allow-all` enables all paths + all tools + all URLs in one flag.

### 4. MCP Servers

#### Built-in MCP: github-mcp-server

Copilot automatically starts a **remote MCP server** called `github-mcp-server` on every run. It connects to `https://api.individual.githubcopilot.com/mcp/readonly` and provides 17 read-only GitHub tools:

| Tool | Purpose |
|------|---------|
| `github-mcp-server-actions_get` | Get workflow run details |
| `github-mcp-server-actions_list` | List workflow runs |
| `github-mcp-server-get_commit` | Get commit details |
| `github-mcp-server-get_copilot_space` | Get Copilot space info |
| `github-mcp-server-get_file_contents` | Read file from GitHub |
| `github-mcp-server-get_job_logs` | Get CI job logs |
| `github-mcp-server-issue_read` | Read issue details |
| `github-mcp-server-list_branches` | List repo branches |
| `github-mcp-server-list_commits` | List commits |
| `github-mcp-server-list_issues` | List issues |
| `github-mcp-server-list_pull_requests` | List PRs |
| `github-mcp-server-pull_request_read` | Read PR details |
| `github-mcp-server-search_code` | Search code |
| `github-mcp-server-search_issues` | Search issues |
| `github-mcp-server-search_pull_requests` | Search PRs |
| `github-mcp-server-search_repositories` | Search repos |
| `github-mcp-server-search_users` | Search users |

Flags for controlling the GitHub MCP server:
- `--add-github-mcp-tool <tool>` - Enable specific tools beyond the default CLI subset
- `--add-github-mcp-toolset <toolset>` - Enable toolset(s), use "all" for all toolsets
- `--enable-all-github-mcp-tools` - Enable all tools
- `--disable-builtin-mcps` - Disable all built-in MCP servers
- `--disable-mcp-server <name>` - Disable a specific server by name

#### Custom MCP Configuration

Three ways to add custom MCP servers:

1. **CLI flag**: `--additional-mcp-config <json-or-filepath>`
   ```bash
   copilot --additional-mcp-config '{"mcpServers":{"my-server":{"command":"node","args":["server.js"]}}}'
   # Or from file:
   copilot --additional-mcp-config @mcp-config.json
   ```

2. **Global config**: `~/.copilot/mcp-config.json` (does not exist yet on this system)

3. **Workspace config**: `.vscode/mcp.json` in the project (added in v0.0.407)

The `--additional-mcp-config` flag augments (does not replace) configs from the global/workspace files. Can be specified multiple times.

#### Interactive MCP management

The `/mcp` command in interactive mode supports: `show`, `add`, `edit`, `delete`, `disable`, `enable`.

### 5. Custom Agents

#### What Are Custom Agents?

Custom agents are specialized agent configurations loaded from GitHub organizations/enterprises. The `--agent <name>` flag allows selecting a custom agent. On every startup, Copilot tries to fetch custom agents from:

```
GET https://api.individual.githubcopilot.com/agents/swe/custom-agents/{owner}/{repo}?exclude_invalid_config=true&include_sources=org,enterprise
```

This returns 404 for `matthew-kissinger/mycelium-v2` because custom agents are an **organization/enterprise feature** - they are configured at the org level, not per-repo.

From the logs:
```
[WARNING] Failed to load custom agents for matthew-kissinger/mycelium-v2: Not Found
[WARNING] could not load remote agents for matthew-kissinger/mycelium-v2: server returned 404
```

The 404 is benign - it just means no org-level custom agents are configured.

#### Built-in Agent Definitions

Copilot ships with 3 built-in sub-agent definitions in `~/.copilot/pkg/universal/0.0.407/definitions/`:

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| `code-review` | claude-sonnet-4.5 | All | High-signal code review (bugs, security, logic only) |
| `explore` | claude-haiku-4.5 | grep, glob, view, lsp | Fast read-only codebase exploration (<300 words) |
| `task` | claude-haiku-4.5 | All | Execute dev commands (tests, builds, lints) |

These are invoked as **sub-agents** via the `task` tool call (background agents), NOT via `--agent`. The interactive `/agent` command may also reference them.

#### Feature Flags Related to Agents

From the process log, these feature flags control agent behavior:
```json
{
  "CUSTOM_AGENTS": true,
  "CCA_DELEGATE": true,
  "COPILOT_SWE_AGENT_UNIFIED_TASK_TOOL": true,
  "COPILOT_SWE_AGENT_BACKGROUND_AGENTS": true,
  "COPILOT_SWE_AGENT_PARALLEL_TASK_EXECUTION": true,
  "COPILOT_SWE_AGENT_EXPANDED_BUILTIN_AGENTS": false,
  "AUTOPILOT_MODE": false,
  "FLEET_COMMAND": false
}
```

The `custom_agents.default_local_only` config option controls whether to skip remote org/enterprise agents.

### 6. Custom Instructions (AGENTS.md)

#### Loading Behavior

Copilot loads custom instructions from these locations (in order):
1. `.github/copilot-instructions.md` - Primary project instructions
2. `AGENTS.md` - Agent-specific instructions (checked at git root and cwd)
3. Directories listed in `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` env var

The `--no-custom-instructions` flag disables all custom instruction loading.

#### Current State

No custom instruction files exist in mycelium-v2:
- `/home/mkagent/mycelium-v2/AGENTS.md` - does not exist
- `/home/mkagent/mycelium-v2/.github/copilot-instructions.md` - does not exist
- `/home/mkagent/mycelium-v2/.copilot/` - does not exist

#### copilot init

The `copilot init` command creates `.github/copilot-instructions.md` with a template:

```markdown
# Copilot Instructions

## Build, Test, and Lint
<!-- Specify the commands to run builds, tests, and linters. -->

## Architecture
<!-- Provide a high-level overview of the system architecture. -->

## Conventions
<!-- List specific coding conventions, naming patterns, or project structure rules. -->
```

It runs as an interactive agent session that analyzes the codebase before generating the file.

#### Recommendation

Creating a `.github/copilot-instructions.md` for mycelium-v2 would give Copilot context about the project when dispatched. Since we already have `CLAUDE.md`, we could either:
1. Symlink or copy relevant sections to `.github/copilot-instructions.md`
2. Use `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` to point at a shared instructions directory
3. Pass `--no-custom-instructions` and rely solely on the prompt from the dispatcher

### 7. Latest Models (v0.0.407)

Two new models since the original doc:

| Model ID | Added In | Premium Requests | Notes |
|----------|----------|-----------------|-------|
| `gpt-5.3-codex` | v0.0.407 | (unknown, likely 1) | Latest OpenAI codex model |
| `claude-opus-4.6-fast` | v0.0.406 | (unknown, likely 3) | Fast preview variant of Opus 4.6 |

#### Full Model List (v0.0.407, 17 CLI choices)

```
claude-sonnet-4.5, claude-haiku-4.5, claude-opus-4.6, claude-opus-4.6-fast,
claude-opus-4.5, claude-sonnet-4, gemini-3-pro-preview, gpt-5.3-codex,
gpt-5.2-codex, gpt-5.2, gpt-5.1-codex-max, gpt-5.1-codex, gpt-5.1,
gpt-5, gpt-5.1-codex-mini, gpt-5-mini, gpt-4.1
```

The API lists 37 total models, but only 17 are exposed as CLI `--model` choices. The remaining 20 are likely internal/preview models or older versions.

#### Model Capabilities (from API)

Example for gpt-4.1 (free tier):
```json
{
  "billing": { "is_premium": false, "multiplier": 0 },
  "capabilities": {
    "family": "gpt-4.1",
    "limits": {
      "max_context_window_tokens": 128000,
      "max_output_tokens": 16384,
      "max_prompt_tokens": 64000,
      "vision": { "max_prompt_images": 1 }
    },
    "supports": {
      "parallel_tool_calls": true, "streaming": true,
      "structured_outputs": true, "tool_calls": true, "vision": true
    }
  },
  "is_chat_fallback": true
}
```

Example for claude-sonnet-4.5 (premium):
```json
{
  "billing": { "is_premium": true, "multiplier": 1 },
  "capabilities": {
    "family": "claude-sonnet-4.5",
    "limits": {
      "max_context_window_tokens": 144000,
      "max_output_tokens": 32000,
      "max_prompt_tokens": 128000,
      "vision": { "max_prompt_images": 5 }
    },
    "supports": {
      "max_thinking_budget": 32000, "min_thinking_budget": 1024,
      "parallel_tool_calls": true, "tool_calls": true, "vision": true
    }
  }
}
```

### 8. Error Output Format

#### Invalid Model (stderr, exit 1)

```
error: option '--model <model>' argument 'nonexistent-model' is invalid. Allowed choices are claude-sonnet-4.5, claude-haiku-4.5, ...
```

#### Auth Failure - No Token (stderr, exit 1)

```
Error: No authentication information found.

Copilot can be authenticated with GitHub using an OAuth Token or a Fine-Grained Personal Access Token.

To authenticate, you can use any of the following methods:
  - Start 'copilot' and run the '/login' command
  - Set the COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN environment variable
  - Run 'gh auth login' to authenticate with the GitHub CLI
```

#### Auth Failure - Classic PAT (in logs, exit 1)

```
[ERROR] Classic PATs are not supported. Please use fine-grained PATs or other supported token types.
[ERROR] No authentication information found.
```

#### Auth Failure - Wrong Token (exit 1, empty stdout)

When `GITHUB_TOKEN` is set to a valid PAT without Copilot scope, the log shows:
```
[ERROR] Error loading models: Error: Failed to list models: 401
```
Stdout is empty, stderr is empty, exit code 1.

#### Parsing Strategy

```typescript
// Error detection:
// 1. Exit code !== 0 -> failure
// 2. Stdout empty + exit 1 -> auth failure (check stderr for details)
// 3. Stderr starts with "error:" -> CLI argument error
// 4. Stderr contains "Error: No authentication" -> auth not configured
// 5. Stderr contains "401" -> token invalid/insufficient scope
```

### 9. Copilot Logs

Log files are at `~/.copilot/logs/`:
- `copilot.log` - OAuth device flow logs (login attempts)
- `process-{timestamp}-{pid}.log` - Per-session process logs

#### Log Content (Useful Fields)

The process logs contain rich debugging info at `--log-level debug`:
- Model listing results (37 models with full capabilities)
- Model billing info (`is_premium`, `multiplier`)
- MCP server connections and tool loading
- Feature flags
- Custom agent loading attempts
- Memory retrieval (Copilot's built-in memory feature)
- Token utilization percentages
- Compaction processor stats (e.g., "Utilization 46.1% (29504/64000 tokens)")
- Request/response timing

#### Key Log Patterns

```
Successfully listed 37 models                    # Model count
Got model info: { "billing": ... }               # Per-model details
CompactionProcessor: Utilization 46.1%           # Context window usage
Memory enablement check: enabled                 # Memory feature status
Error loading models: Error: Failed to list      # Auth failure
Starting remote MCP client for github-mcp-server # MCP startup
```

### 10. Config Exploration

#### Directory Structure (`~/.copilot/`)

```
~/.copilot/
  config.json          # User settings (model, banner, trusted_folders, etc.)
  logs/                # Process logs + OAuth log
  session-state/       # ~80 session directories (UUID-named)
    {uuid}/
      workspace.yaml   # Session metadata
      events.jsonl     # Conversation events (messages, tool calls, results)
      checkpoints/     # Workspace snapshots
      files/           # File state snapshots
  pkg/                 # CLI binaries
    linux-x64/         # v0.0.405
    universal/
      0.0.405/         # Previous version
      0.0.407/         # Current version
        changelog.json   # Release notes
        definitions/     # Built-in agent YAML files
        schemas/         # JSON schemas
        sdk/             # SDK exports
        ripgrep/         # Bundled rg binary
        sharp/           # Image processing
        tree-sitter*.wasm  # Syntax parsing
```

No `mcp-config.json` exists yet (created on first `/mcp add` or manually).

#### New Config Settings Discovered

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `on_air_mode` | bool | false | Hide model names/quota (for streaming) |
| `alt_screen` | bool | false | Use terminal alternate screen buffer |

#### Copilot Memory Feature

Copilot has a built-in **agentic memory** feature (separate from our Mycelium memory):
- Stores facts about codebases via `store_memory` tool
- Retrieved per-repository on each prompt
- Stored server-side (GitHub-managed)
- Currently empty for mycelium-v2: "No memories found for this repository"
- Feature flag: `copilot-feature-agentic-memory: true`

### 11. Full Tool Inventory

Copilot exposes these tools to the model (from process log):

| Tool | Description |
|------|-------------|
| `bash` | Run shell commands (sync/async modes, persistent sessions) |
| `write_bash` | Send input to running bash session |
| `read_bash` | Read output from async bash session |
| `stop_bash` | Terminate a bash session |
| `list_bash` | List active bash sessions |
| `store_memory` | Store facts about the codebase |
| `view` | View files/directories/images |
| `create` | Create new files |
| `edit` | String replacement edits (like Claude's Edit) |
| `web_fetch` | Fetch URLs as markdown or HTML |
| `report_intent` | Update session intent (UI display) |
| `fetch_copilot_cli_documentation` | Self-documentation |
| `update_todo` | Track task progress |
| `skill` | Invoke skills (44 available from Claude's skill set) |
| `read_agent` | Read background agent results |
| `list_agents` | List background agents |
| `grep` | ripgrep-based code search |
| `glob` | File pattern matching |
| `github-mcp-server-*` | 17 GitHub MCP tools (see MCP section) |

Note: The tool set closely mirrors Claude Code's tools (bash, edit, view, grep, glob). The `skill` tool loads Claude Code skills from `~/.claude/skills/`.

### 12. Updated Adapter Recommendations

Based on all findings, the recommended adapter changes:

```typescript
buildArgs(options): string[] {
  return [
    '-p', prompt,
    ...(model ? ['--model', model] : []),
    '--allow-all-tools',
    '--no-ask-user',
    '--allow-all-paths',
    '--no-auto-update',
    '--no-custom-instructions',  // We inject our own context via prompt
    '--disable-builtin-mcps',    // Saves ~200ms startup, we don't need GitHub MCP
  ]
}

buildEnv(): Record<string, string> {
  return { GITHUB_TOKEN: '', GH_TOKEN: '' }
}

// Parse stats from stderr for cost tracking
parseStats(stderr: string): { premiumRequests: number, inputTokens: number, outputTokens: number } {
  const premiumMatch = stderr.match(/Total usage est:\s+(\d+) Premium request/);
  const modelMatch = stderr.match(/\s+\S+\s+([\d.]+)k in, ([\d.]+)k? out/);
  return {
    premiumRequests: premiumMatch ? parseInt(premiumMatch[1]) : 0,
    inputTokens: modelMatch ? Math.round(parseFloat(modelMatch[1]) * 1000) : 0,
    outputTokens: modelMatch ? Math.round(parseFloat(modelMatch[2])) : 0,
  };
}
```

### 13. Updated Model Table

| Model ID | Family | Premium Multiplier | Context Window | Max Output | Vision |
|----------|--------|--------------------|---------------|------------|--------|
| `gpt-4.1` | OpenAI | **0** (free) | 128K | 16K | Yes (1 img) |
| `gpt-5-mini` | OpenAI | **0** (free) | (unknown) | (unknown) | (unknown) |
| `claude-haiku-4.5` | Anthropic | 0.33 | (unknown) | (unknown) | (unknown) |
| `claude-sonnet-4.5` | Anthropic | **1** | 144K | 32K | Yes (5 imgs) |
| `gpt-5.2-codex` | OpenAI | **1** | (unknown) | (unknown) | (unknown) |
| `gpt-5.2` | OpenAI | **1** | (unknown) | (unknown) | (unknown) |
| `gemini-3-pro-preview` | Google | **1** | (unknown) | (unknown) | (unknown) |
| `gpt-5.3-codex` | OpenAI | (unknown) | (unknown) | (unknown) | **NEW in v0.0.407** |
| `claude-opus-4.6` | Anthropic | **3** | (unknown) | (unknown) | (unknown) |
| `claude-opus-4.6-fast` | Anthropic | (unknown) | (unknown) | (unknown) | **NEW in v0.0.406** |

Note: `gpt-4.1` is marked as `is_chat_fallback: true` in the API, meaning it is the fallback model when others are unavailable.
