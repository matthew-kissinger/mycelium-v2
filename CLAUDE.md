# Mycelium v2 - Agent Context

> Agent orchestration system. See README.md for public docs.
> See PROGRESS.md for status. See docs/archive/ for historical plans.

## Current State

**Core loop operational.** Scheduler cycles running, agents dispatching, SSE streaming.

| Component | Status |
|-----------|--------|
| Backend API | Hono + Bun, 70+ endpoints |
| Scheduler | 8 cycles (dispatcher, discovery, shepherd, etc.) |
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

# Health
GET        /api/stats
GET        /api/health
GET        /api/events              # SSE stream
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
       depends_on, sequenced, cost_usd, duration_seconds, ...)

repos (id, path, name, description, language, weight, ...)

signals (id, question, options, status, response, ...)

memory_patterns (id, content, repo_path, tags, ...)
memory_warnings (id, content, severity, repo_path, ...)

fruiting_sessions (id, task_id, agent, model, context_trace, session_log, ...)

config_overrides (key, value, updated_at)
prompt_overrides (prompt_id, content, updated_at)
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
| Genesis | opus | Create new repos (manual only) |

### Context Injection

- `buildMycelContext()` - CLI instructions, agent identity
- `buildAgentsSectionWithCredits()` - Agent matrix with live credits/quota (async)
- `buildSkillsSection()` - Skills from ~/.claude/skills/
- `buildMcpSection(agent)` - MCP servers for specific agent

### Fallback & Health

- Fallback chains: auto-retry with more capable model on failure (up to 2 retries)
- Cross-agent fallback: codex->cursor, pi->opencode, opencode->gemini, vibe->cline
- Quota tracking: Gemini, Groq, Cerebras, Codex (auto-backoff until reset)
- OpenRouter credit monitoring: live balance via `/api/health`

---

## File Locations

### Config Directory

| Platform | Path |
|----------|------|
| Linux/NixOS | `~/.config/mycelium-v2/` |
| macOS | `~/Library/Application Support/mycelium-v2/` |

Contents: `mycelium.db`, `scheduler.json`, `agents.json`, `prompts/`

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
