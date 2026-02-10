# Mycelium v2 - Agent Context

> Agent orchestration system. See README.md for public docs.
> See PROGRESS.md for status. See docs/archive/ for historical plans.

## Current State

**Core loop operational.** Scheduler cycles running, agents dispatching, SSE streaming.

| Component | Status |
|-----------|--------|
| Backend API | Hono + Bun, 85+ endpoints |
| Scheduler | 11 cycles (dispatcher, discovery, shepherd, max_alignment, github_sync, registry_refresh, etc.) |
| Agent Dispatch | 10 agents (Claude, Codex, Gemini, Cline, Cursor, Kiro, Vibe, Pi, OpenCode, Copilot) across 12 providers |
| Frontend | Three-column layout (sidebar, React Flow canvas, detail panel) |
| Cost Tracking | Per-use (Cline/OpenRouter) vs subscription billing |

---

## Running

### Dev Management Script (Recommended)

```bash
cd ~/repos/mycelium-v2
bun run dev:manage start       # Start backend + frontend
bun run dev:manage stop        # Stop all services
bun run dev:manage restart     # Restart all services
bun run dev:manage status      # Status + health
bun run dev:manage logs        # Tail logs
bun run dev:manage check       # Task stats + scheduler

# Data management (keeps repos + config)
bun run dev:manage reset tasks    # Clear tasks + sessions
bun run dev:manage reset memory   # Clear patterns + warnings
bun run dev:manage reset all      # Clear tasks + memory + signals
bun run dev:manage fresh          # Reset all + restart scheduler

# Build cycle
bun run dev:manage build          # Build all packages
bun run dev:manage build-restart  # Build + restart servers
bun run dev:manage scheduler start  # Start scheduler via API
```

### Manual

```bash
bun run dev              # Backend :8765
bun run dev:client       # Frontend :5765
```

### NixOS Service

```bash
systemctl --user start mycelium
systemctl --user status mycelium
journalctl --user -u mycelium -f
```

---

## CLI Reference

```bash
# Tasks
mycel stats
mycel tasks [--status pending]
mycel task create "title" --repo /path --agent claude --model sonnet
mycel task create "title" --agent cline --provider openrouter
mycel task run <id>
mycel task cancel <id>

# Repos
mycel repos
mycel repos add <path>
mycel repos discover [path]

# Registry
mycel registry                             # Full matrix view
mycel registry agents                      # Agent list + status + version
mycel registry providers                   # Provider list + credits
mycel registry models [--agent X] [--free] # Model list
mycel registry detect                      # CLI detection
mycel registry refresh                     # Full refresh
mycel registry health                      # Health summary
mycel registry fallback <agent> <model>    # Fallback chain

# Discovery
mycel discover /path --agent --auto

# Alignment
mycel align "question" --options "A" "B"
mycel signals
mycel notify "message"

# Scheduler
mycel runner start
mycel runner stop
```

---

## Key API Endpoints

```
# Tasks
GET/POST   /api/tasks
GET        /api/tasks/:id
POST       /api/tasks/:id/run
POST       /api/tasks/:id/cancel
POST       /api/tasks/:id/merge
GET        /api/tasks/:id/context
GET        /api/tasks/:id/sessions

# Scheduler
GET        /api/scheduler/status
POST       /api/scheduler/start
POST       /api/scheduler/stop

# System Agents
POST       /api/discovery/trigger
POST       /api/shepherd/trigger
GET        /api/shepherd/status
POST       /api/max-alignment/trigger
GET        /api/max-alignment/status

# Health
GET        /api/stats
GET        /api/health
GET        /api/events              # SSE stream

# GitHub
POST       /api/github/webhook
POST       /api/github/setup-security
POST       /api/github/rulesets/apply
GET        /api/github/rulesets/:owner/:repo

# Registry
GET        /api/registry/agents
GET/PATCH  /api/registry/agents/:id
GET        /api/registry/providers
GET/PATCH  /api/registry/providers/:id
POST       /api/registry/providers/:id/refresh
GET        /api/registry/models
PATCH      /api/registry/models/:id
GET        /api/registry/matrix
GET        /api/registry/health
POST       /api/registry/detect
POST       /api/registry/refresh
GET        /api/registry/credentials
GET        /api/registry/fallback/:agent/:model
```

Full API list in README.md.

---

## Scheduler Cycles

| Cycle | Interval | Purpose |
|-------|----------|---------|
| Dispatcher | 60s | Run tasks with resolved deps |
| Discovery | 15min | Scan repos, create tasks with deps |
| Shepherd | 15min | Evaluate tasks per repo (5+ threshold) |
| Armory | 1h | Skill/MCP inventory (batch threshold) |
| Digest | 6h | Smart status summaries (Haiku agent) |
| Compaction | 4h | Semantic memory cleanup (Haiku agent) |
| Blocked Check | 15min | Detect stuck tasks, orphan cleanup |
| Health Check | 60s | Provider status monitoring |
| GitHub Sync | 30min | Cache repo slugs, default branches, enable security |
| Registry Refresh | 6h | Re-detect CLIs, re-fetch provider models |
| Max Alignment | 15min | Repo-level health audit after N shepherd evaluations |

### Task Flow

```
Discovery -> creates tasks with dependencies (--depends-on)
Dispatcher -> runs tasks when deps resolve
Shepherd -> evaluates completed tasks
```

---

## Database Schema (Key Tables)

```sql
tasks (id, title, prompt, status, agent, model, provider, repo_path,
       depends_on, sequenced, branch_name, worktree_path, github_pr_number,
       github_pr_url, spec_context, retry_context, cost_usd, duration_seconds,
       input_tokens, output_tokens, ...)

repos (id, path, name, description, language, weight, ...)

signals (id, question, options, status, response, ...)

memory_patterns (id, content, repo_path, tags, ...)
memory_warnings (id, content, severity, repo_path, ...)

fruiting_sessions (id, task_id, agent, model, context_trace, session_log, ...)

config_overrides (key, value, updated_at)
prompt_overrides (prompt_id, content, updated_at)

providers (id, name, api_base, billing, status, credits_info, models_fetched_at, ...)
agents (id, command, cli_version, timeout_seconds, default_provider, default_model, enabled, status, ...)
models (id, provider_id, model_id, context_window, cost_input, cost_output, free, compatible_agents, fallback_model_id, ...)
```

---

## System Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| Discovery | opus/sonnet | Find work, create tasks with deps |
| Shepherd | opus | Evaluate yields, merge/reject |
| Digest | haiku | Trend analysis, anomaly detection, recommendations |
| Compaction | haiku | Semantic deduplication, pattern consolidation |
| Armory | sonnet | Skill/MCP inventory |
| Max Alignment | opus | Repo-level health audit, cleanup, docs, runtime verification |
| Genesis | opus | Create new repos (manual only) |

### Context Injection

- `buildMycelContext()` - CLI instructions, agent identity, worktree path, branch name
- `buildAgentsSectionWithCredits()` - Agent matrix with live credits/quota (Discovery only)
- `buildSkillsSection()` - Skills from ~/.claude/skills/
- `buildMcpSection(agent)` - MCP servers for specific agent
- `buildMemorySection(repoPath)` - Memory patterns/warnings for repo (task agents + shepherd)

### Startup Safety

- Orphaned running tasks marked as failed on server restart (prevents token burn)
- Orphaned system agent runs cleaned up (>1h threshold)
- Stale worktrees cleaned up
- Manual `POST /api/tasks/:id/run` gets full context enrichment (matches dispatcher pipeline)

### Fallback & Health

- Fallback chains: auto-retry with more capable model on failure (up to 2 retries)
- Cross-agent fallback: codex->cursor, pi->opencode, opencode->gemini, vibe->cline
- Quota tracking: Gemini, Groq, Cerebras, Codex (auto-backoff until reset)
- OpenRouter credit monitoring: live balance via `/api/health`
- Health state DB-backed (survives restarts)

### Dynamic Registry

- DB-backed agents/providers/models tables (replaces hardcoded AGENT_MATRIX)
- Write-through in-memory cache for sub-ms dispatch reads
- CLI auto-detection on startup + 6h refresh cycle
- Provider model fetching from 7 APIs (OpenRouter, Anthropic, OpenAI, Groq, Cerebras, Mistral, Google)
- Centralized credentials from `~/.config/mk-agent/`
- `isCacheReady() ? getCached...() : HARDCODED_FALLBACK` pattern for graceful degradation
- API: 14 endpoints under `/api/registry/`
- CLI: `mycel registry` with 8 subcommands

---

## File Locations

### Config Directory

| Platform | Path |
|----------|------|
| Linux/NixOS | `~/.config/mycelium-v2/` |
| macOS | `~/Library/Application Support/mycelium-v2/` |

Contents: `mycelium.db`, `scheduler.json`, `agents.json`, `prompts/`

DB path resolved via `platform/index.ts` - respects `MYCELIUM_DB_PATH` env var and platform conventions.

### Frontend Structure

```
packages/client/src/
├── layout/          # AppLayout, LeftSidebar, RightPanel
├── panels/          # 10 panel components (lazy loaded)
├── stores/          # 12 Zustand domain stores
├── nodes/           # React Flow node components
└── lib/             # Formatters, utilities
```

---

## Conventions

- No emojis unless requested
- Conventional commits
- Agent-agnostic dispatch
- Database as coordination mechanism
- Use mycel CLI, not curl
