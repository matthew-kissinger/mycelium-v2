# Mycelium v2 - Agent Orchestration

> TypeScript rewrite of the Mycelium agent orchestration system.
> **Read IMPLEMENTATION_PLAN.md** for phases. Check PROGRESS.md for status.

## Current State

**Core loop operational.** Scheduler cycles running, agents dispatching, SSE streaming.

### What's Working

| Component | Status |
|-----------|--------|
| Monorepo Structure | packages/{shared,server,client,cli,mcp} |
| Backend API | Hono + Bun, 35+ endpoints |
| Scheduler | 7 cycles (dispatcher, discovery, sequencer, shepherd, etc.) |
| Agent Dispatch | Claude, Codex, Gemini, Cline, Cursor |
| Context Injection | Skills, MCP servers, MYCEL_CONTEXT, AGENTS_SECTION |
| SSE Streaming | Real-time task output |
| CLI | Core commands working |
| Frontend | React Flow visualization |

### Network

```
mycelium-v2          [auto] [TypeScript]
  Agent orchestration system - TypeScript rewrite
```

---

## Running Mycelium v2

### Development

```bash
cd /home/dev/repos/mycelium-v2

# Install dependencies
bun install

# Run backend + frontend
bun run dev

# Backend only (port 8000)
bun run dev:server

# Frontend only (port 5173)
bun run dev:client

# Build all packages
bun run build
```

### Configuration

Copy `.env.example` to `.env.local` with your Telegram credentials:
```bash
cp .env.example .env.local
# Edit with TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
```

---

## CLI Reference

```bash
# Task Management
mycel stats                                    # Show stats
mycel tasks [--status pending]                 # List tasks
mycel task create "title" --repo /path --agent claude --model sonnet
mycel task create "title" --prompt "full spec" # With full spec
mycel task run <id>                            # Run task
mycel task info <id>                           # Task details
mycel task cancel <id>                         # Cancel running
mycel task delete <id>                         # Delete task
mycel task update <id> --depends-on <id1> <id2>  # Set dependencies
mycel task merge <id>                          # Merge task branch

# Network Registry
mycel repos                                    # List network
mycel repos discover [path]                    # Scan for repos
mycel repos add <path>                         # Add to network
mycel repos add <path> --auto-create           # Add with auto task creation
mycel repos add <path> --description "text"    # Add with description
mycel repos describe <path>                    # Auto-extract description
mycel repos describe <path> --description "x"  # Set custom description
mycel repos remove <path>                      # Remove from network
mycel repos health                             # Health scores
mycel repos paths                              # List scan paths
mycel repos paths add ~/code                   # Add scan path
mycel repos paths remove ~/code                # Remove scan path

# Memory
mycel memory [--repo /path]                    # Show patterns/warnings
mycel memory add pattern "content"             # Add pattern
mycel memory add warning "content" --severity high
mycel compact [--repo /path]                   # Compact memory

# Sessions
mycel sessions                                 # List sessions
mycel session <id> [--tail N] [--search term]  # View session
mycel trace <task_id>                          # Show context trace

# Discovery & Sequencing
mycel discover /path                           # Just scan
mycel discover /path --agent                   # Scan + run Discovery Agent
mycel discover /path --agent --auto            # Autonomous mode
mycel sequence                                 # Analyze all pending tasks
mycel sequence /path                           # Analyze tasks for repo
mycel sequence --dry-run                       # Preview without applying

# Alignment (Telegram)
mycel align "question" --options "A" "B" "C"   # Async alignment
mycel align "question" --wait                  # Sync (blocks)
mycel signals                                  # View all signals
mycel check                                    # Process responses
mycel notify "message"                         # Send notification
mycel show <file> ["caption"]                  # Share image/file
mycel inbox [--limit N]                        # View user messages
mycel download <msg_id> [path]                 # Download file
mycel reply <msg_id> "text"                    # Reply to message
mycel status                                   # Check Telegram connection

# Config
mycel config show                              # Show scheduler config
mycel config set <key> <value>                 # Set config value

# Runner
mycel runner                                   # Show runner status
mycel runner start                             # Start autonomous runner
mycel runner stop                              # Stop runner
mycel runner config                            # Show runner config
mycel runner config --interval 900             # Set interval (seconds)

# Genesis
mycel genesis                                  # Show status/help
mycel genesis create "description"             # Create repo
mycel genesis create "desc" --private          # Private repo
mycel genesis auto                             # Analyze network, propose
mycel genesis auto --create                    # Create directly
mycel genesis config                           # Show genesis config

# MCP Server
mycel mcp                                      # Start MCP server (stdio)

# Version
mycel version                                  # Show versions
mycel version --deps                           # Include dependencies
mycel version --outdated                       # Show outdated packages
```

---

## API Endpoints

### Task Management
```
GET    /api/tasks                    List tasks (status, repo_path, limit filters)
GET    /api/tasks/:id                Get task details
GET    /api/tasks/:id/context        Get assembled context
GET    /api/tasks/:id/sessions       Get fruiting sessions
GET    /api/tasks/graph              Get dependency graph
POST   /api/tasks                    Create task
PATCH  /api/tasks/:id                Update task
DELETE /api/tasks/:id                Delete task
POST   /api/tasks/:id/run            Execute task
POST   /api/tasks/:id/cancel         Cancel running task
POST   /api/tasks/:id/merge          Merge task branch
POST   /api/tasks/:id/clone          Clone task
```

### Queue Management
```
GET    /api/queue                    Get execution queue
POST   /api/queue/run-next           Run next ready task
POST   /api/queue/run-all            Run all ready tasks
```

### Orchestration
```
POST   /api/orchestrate              Generate task spec with Opus
```

### Repos
```
GET    /api/repos                    List repos
GET    /api/repos/:id                Get repo
GET    /api/repos/health             Get health summary
POST   /api/repos                    Add repo
POST   /api/repos/discover           Scan paths for repos
PATCH  /api/repos/:id                Update repo
DELETE /api/repos/:id                Remove repo
```

### Signals & Alignment
```
GET    /api/signals                  List signals
GET    /api/signals/:id              Get signal
GET    /api/signals/pending          Get pending signals
POST   /api/signals                  Create signal
POST   /api/signals/:id/respond      Respond to signal
DELETE /api/signals/:id              Delete signal
POST   /api/align                    Create + send via Telegram
```

### Memory
```
GET    /api/memory/global            Get global patterns/warnings
POST   /api/memory/global            Add to global memory
GET    /api/memory/repo/:path        Get repo memory
POST   /api/memory/repo/:path        Add to repo memory
POST   /api/memory/compact           Trigger compaction
GET    /api/memory/agent-stats       Get agent performance stats
GET    /api/memory/agent-stats/:agent Get stats for agent
POST   /api/memory/agent-stats/backfill Rebuild from tasks
```

### Notifications & Telegram
```
POST   /api/notify                   Send notification
GET    /api/inbox                    Get user messages
GET    /api/inbox/:id/download       Download file
GET    /api/status                   Check Telegram connection
GET    /api/telegram/updates         Get received updates
GET    /api/telegram/webhook         Get webhook status
POST   /api/telegram/webhook         Set webhook URL
DELETE /api/telegram/webhook         Delete webhook
```

### System Agents
```
GET    /api/system-agents            List agent runs
POST   /api/discovery                Trigger Discovery
POST   /api/sequencer                Trigger Sequencer
POST   /api/shepherd                 Trigger Shepherd
GET    /api/shepherd/status          Get Shepherd status
GET    /api/shepherd/evaluations     List evaluations
POST   /api/shepherd/reset-counter   Reset counter
```

### Scheduler
```
GET    /api/scheduler                Get scheduler status
POST   /api/scheduler/start          Start scheduler
POST   /api/scheduler/stop           Stop scheduler
POST   /api/scheduler/configure      Update config
```

### Hooks
```
GET    /api/hooks/status             Get hooks config
POST   /api/hooks/configure          Configure hooks
POST   /api/hooks/test               Test hook
```

### Stats & Health
```
GET    /api/stats                    Task statistics
GET    /api/health                   Health check
GET    /api/quality-report           Quality report
GET    /api/events                   SSE stream
```

### Export
```
GET    /api/export/tasks             Export tasks as CSV/JSON
```

---

## Architecture

### Unified Backend

Single Bun process combining:
- **Hono server** - HTTP API on port 8000
- **Scheduler** - Async cycles for all system agents
- **Telegram Poller** - Long-polling for signals and messages

### Database Schema

```sql
-- Core task tracking
tasks (
  id, title, prompt, status,
  agent, model, repo_path,
  branch_name, github_url,        -- Git tracking
  spec_context,                   -- Orchestrator metadata
  depends_on,                     -- JSON array of task IDs
  sequenced,                      -- Has gone through Sequencer?
  result, error, parsed_result, error_details,
  retry_context,                  -- Previous error for retries
  cost_usd, duration_seconds,
  created_at, started_at, completed_at,
  shepherd_evaluated_at, armory_reviewed_at
)

-- Network registry
repos (id, path, name, description, language, mode, created_at, last_scanned_at)

-- Alignment signals
signals (id, question, options, status, response, task_id, repo_path, created_at, responded_at)

-- Memory
memory_patterns (id, content, source, task_id, repo_path, tags, created_at)
memory_warnings (id, content, severity, task_id, repo_path, created_at)

-- Agent stats
agent_stats (agent_id, total_tasks, successful, failed, success_rate, total_cost, best_for, avoid_for)

-- System agent runs
system_agent_runs (id, agent_type, status, repo_path, context, output, error, started_at, completed_at)

-- Shepherd evaluations
shepherd_evaluations (id, repo_path, evaluated_at, tasks_evaluated, health, headline, concerns, wins, recommendation, global_patterns, global_warnings, branch_evaluations, raw_response)

-- Fruiting sessions
fruiting_sessions (id, task_id, repo_path, agent, model, context_trace, full_prompt, created_at)
```

---

## Scheduler Cycles

All cycles run **independently and non-blocking**. Database state coordinates.

| Cycle | Interval | Purpose |
|-------|----------|---------|
| Dispatcher | 60 sec | Run sequenced tasks with resolved deps |
| Discovery | 10 min | Scan repos, create tasks |
| Sequencer | 15 min | Wire task dependencies |
| Shepherd | On batch | Evaluate 5+ completed tasks per repo |
| Armory | On batch | Skill/MCP inventory (10+ tasks network-wide) |
| Blocked Check | 15 min | Detect stuck tasks |
| Digest | 6 hours | Health summary |
| Compaction | Weekly Mon 11am | Memory cleanup |

### Task Flow

```
Discovery creates task (sequenced=false)
    |
Sequencer analyzes + wires deps (sequenced=true)
    |
Dispatcher runs ONLY sequenced tasks
    |
Shepherd evaluates (on completion batch)
```

### Agent Timeouts

| Agent | Timeout | Max Turns |
|-------|---------|-----------|
| Claude | 30 min | 50 |
| Codex | 30 min | 50 |
| Gemini | 15 min | 30 |
| Cline | 10 min | 30 |
| Cursor | 10 min | 30 |

---

## System Agents

| Agent | Model | Purpose | Can --wait? |
|-------|-------|---------|-------------|
| Discovery | opus/sonnet | Find work, create tasks | No |
| Sequencer | sonnet | Wire dependencies | No |
| Shepherd | opus | Evaluate yields, merge/reject | Yes (rare) |
| Armory | opus | Skill/MCP inventory | No |
| Genesis | opus | Create new repos | No |
| Digest | haiku | Interval stats | No |
| Compaction | opus | Memory cleanup | No |

### Prompt Locations

Prompts ported EXACTLY from v1:
- `packages/server/src/prompts/discovery.ts`
- `packages/server/src/prompts/sequencer.ts`
- `packages/server/src/prompts/shepherd.ts`
- `packages/server/src/prompts/genesis.ts`
- `packages/server/src/prompts/armory.ts`

### Context Injection

Dynamic context built per-agent:
- `buildMycelContext()` - CLI instructions, identity prefix
- `buildAgentsSection()` - Available agents and models
- `buildSkillsSection()` - Skills from ~/.claude/skills/
- `buildMcpSection()` - MCP servers from ~/.claude/mcp.json

---

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Backend | Hono |
| Database | SQLite (bun:sqlite) |
| ORM | Drizzle |
| Frontend | React 19 + Vite |
| Node Editor | React Flow (@xyflow/react) |
| State | Zustand + TanStack Query |
| Styling | Tailwind v4 |
| Validation | Zod |
| Real-time | SSE |

---

## File Locations

```
~/.config/mycelium-v2/
├── mycelium.db         # SQLite database
├── scheduler.json      # Scheduler config
├── genesis.json        # Genesis config
├── hooks.json          # Hooks config
├── global_memory.json  # Network-wide learning
├── telegram.json       # Telegram config
└── logs/               # Runtime logs

<repo>/.mycel/
├── memory.json         # Repo-specific memory
└── fruiting/           # Session traces
    └── <session_id>/
        ├── context.json
        ├── context.md
        └── layers/

~/.claude/skills/       # Skill libraries
~/.claude/mcp.json      # MCP server config
```

---

## Conventions

- No emojis unless requested
- Conventional commits
- Agent-agnostic dispatch
- Prompts unchanged from v1
- Database as coordination mechanism
- Test before commit
- Use mycel CLI, not curl
