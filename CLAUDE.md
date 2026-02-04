# Mycelium v2 - Agent Orchestration

> TypeScript rewrite of the Mycelium agent orchestration system.
> **Read IMPLEMENTATION_PLAN.md** for phases. Check PROGRESS.md for status.

## Current State

**Core loop operational.** Scheduler cycles running, agents dispatching, SSE streaming.

### What's Working

| Component | Status |
|-----------|--------|
| Monorepo Structure | packages/{shared,server,client,cli,mcp} |
| Backend API | Hono + Bun, 70+ endpoints |
| Scheduler | 9 cycles (dispatcher, discovery, sequencer, shepherd, health, etc.) |
| Agent Dispatch | Claude, Codex, Gemini, Cline, Cursor |
| Context Injection | Skills, MCP servers, MYCEL_CONTEXT, AGENTS_SECTION |
| SSE Streaming | Real-time task output |
| CLI | Core commands working |
| Frontend | Three-column layout (sidebar, React Flow canvas, detail panel) |
| Cost Tracking | Per-use (Cline/OpenRouter) vs subscription billing split |
| Config Storage | DB-first with file fallback, history tracking |
| Prompt Management | DB overrides, template variable preview, resolved variable inspection |

### Network

```
mycelium-v2          [auto] [TypeScript]
  Agent orchestration system - TypeScript rewrite
```

---

## Running Mycelium v2

### NixOS (Recommended)

```bash
cd ~/repos/mycelium-v2

# Enter Nix development shell (auto-activates with direnv)
nix develop

# Or use direnv
direnv allow

# Development runs automatically with correct environment
bun run dev
```

With home-manager, the server runs as a systemd user service:

```nix
# In home.nix
services.mycelium = {
  enable = true;
  server.enable = true;
  scheduler.enable = true;  # Auto-starts scheduler
};
```

See `nix/README.md` for full NixOS/home-manager integration.

### NixOS Start/Stop (Laptop Hub)

```bash
# Start/stop the systemd user service
systemctl --user start mycelium
systemctl --user stop mycelium
systemctl --user restart mycelium
systemctl --user status mycelium

# View logs
journalctl --user -u mycelium -f

# For development (not the service):
cd ~/repos/mycelium-v2
bun run dev              # Backend on :8765 (foreground)
bun run dev:client       # Frontend on :5765 (separate terminal)

# Stop dev servers: Ctrl+C in each terminal
# The service and dev mode are independent - don't run both simultaneously
```

### Manual Development

```bash
cd /home/mkagent/repos/mycelium-v2

# Install dependencies
bun install

# Run backend + frontend
bun run dev

# Backend only (port 8765)
bun run dev:server

# Frontend only (port 5765)
bun run dev:client

# Build all packages
bun run build

# Run tests
bun test

# Dev management (build-restart, scheduler, check)
bun run dev:manage check              # System summary
bun run dev:manage build-restart      # Build + restart
bun run dev:manage scheduler start    # Start scheduler via API
```

### Configuration

Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Key environment variables:
```bash
# Telegram
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

# Server
PORT=8765
HOST=0.0.0.0

# Scheduler auto-start on server boot
SCHEDULER_AUTO_START=true

# Database (auto-detected per platform)
DATABASE_PATH=~/.config/mycelium-v2/mycelium.db
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

# Devices
mycel devices                                  # List all devices
mycel device add <name> --type roku --host 192.168.1.103
mycel device remove <name>                     # Remove device
mycel device status <name>                     # Device status
mycel device ping <name>                       # Health check device
mycel device cmd <name> <command> [args]        # Execute device command
mycel tv <command> [args]                      # Roku TV shortcuts
mycel vol <level|up|down|mute|status>          # Yamaha volume shortcuts

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
GET    /api/tasks/:id/logs           Get task output logs
GET    /api/tasks/graph              Get dependency graph
GET    /api/tasks/logs/stats         Get log buffer statistics
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
GET    /api/repos/browse             Browse directories
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
GET    /api/memory/all               Get all memory grouped by global/repo
GET    /api/memory/global            Get global patterns/warnings
POST   /api/memory/global            Add to global memory
GET    /api/memory/repo/:path        Get repo memory
POST   /api/memory/repo/:path        Add to repo memory
POST   /api/memory/compact           Trigger compaction
DELETE /api/memory/patterns/:id      Delete a pattern
DELETE /api/memory/warnings/:id      Delete a warning
GET    /api/memory/agent-stats       Get agent performance stats
GET    /api/memory/agent-stats/:agent Get stats for agent
POST   /api/memory/agent-stats/backfill Rebuild from tasks
```

### Notifications & Telegram
```
POST   /api/notify                   Send notification
GET    /api/inbox                    Get user messages
GET    /api/inbox/:message_id/download Download file
GET    /api/status                   Check Telegram connection
```

### System Agents
```
GET    /api/system-agents/runs       List agent runs
GET    /api/system-agents/runs/:id   Get run details
GET    /api/system-agents/active     Get currently running agents
POST   /api/discovery/trigger        Trigger Discovery
POST   /api/sequencer/trigger        Trigger Sequencer
POST   /api/shepherd/trigger         Trigger Shepherd (requires repo_path)
GET    /api/shepherd/status          Get Shepherd batch status
GET    /api/shepherd/evaluations     List evaluations
POST   /api/shepherd/reset-counter   Reset evaluation counter
```

### Scheduler
```
GET    /api/scheduler/status         Get scheduler status
GET    /api/scheduler/config         Get scheduler config
POST   /api/scheduler/config         Update scheduler config
POST   /api/scheduler/start          Start scheduler
POST   /api/scheduler/stop           Stop scheduler
```

### Configuration
```
GET    /api/config                   Get overview of all config
GET    /api/config/scheduler         Get scheduler config (with path)
PATCH  /api/config/scheduler         Update scheduler config
GET    /api/config/genesis           Get genesis config
PATCH  /api/config/genesis           Update genesis config
GET    /api/config/hooks             Get hooks config
PATCH  /api/config/hooks             Update hooks config
GET    /api/config/agents            Get all agents config
GET    /api/config/agents/:name      Get specific agent config
PATCH  /api/config/agents/:name      Update specific agent config
GET    /api/config/history           Get config change history (key, limit, offset)
```

### Prompts
```
GET    /api/prompts                  List all system agent prompts
GET    /api/prompts/:id              Get prompt with full content
PATCH  /api/prompts/:id              Update prompt with custom content
POST   /api/prompts/:id/reset        Reset prompt to default
GET    /api/prompts/:id/variables    Get resolved template variable values
GET    /api/prompts/:id/preview      Get prompt with variables resolved (repo_path query)
```

### Inventory (Skills & MCPs)
```
GET    /api/inventory                Get full inventory
GET    /api/inventory/skills         Get skills only
GET    /api/inventory/mcps           Get MCP servers only
POST   /api/inventory/armory         Trigger armory cycle manually
GET    /api/inventory/armory/status  Get armory readiness status
```

### Devices
```
GET    /api/devices                  List devices (filter by type, status)
GET    /api/devices/status           Get device status summary
GET    /api/devices/:id              Get single device (by ID or name)
POST   /api/devices                  Add device
PATCH  /api/devices/:id              Update device
DELETE /api/devices/:id              Remove device
POST   /api/devices/health-check     Health check all devices
POST   /api/devices/:id/health       Health check single device
POST   /api/devices/:id/command      Execute command on device
```

### Hooks
```
GET    /api/hooks/status             Get hooks config
POST   /api/hooks/configure          Configure hooks
POST   /api/hooks/test               Test a webhook
```

### Stats & Health
```
GET    /api/stats                    Task statistics
GET    /api/health                   Health check (scheduler, telegram, agents)
GET    /api/events                   SSE stream
GET    /api/events/clients           SSE connected clients (debug)
```

### Export
```
GET    /api/export/tasks             Export tasks as CSV/JSON
GET    /api/export/evaluations       Export shepherd evaluations
GET    /api/export/memory            Export memory patterns/warnings
GET    /api/export/stats             Export comprehensive stats
```

---

## Architecture

### Unified Backend

Single Bun process combining:
- **Hono server** - HTTP API on port 8765
- **Scheduler** - Async cycles for all system agents (auto-starts with SCHEDULER_AUTO_START=true)
- **Telegram Poller** - Long-polling for signals and messages

### Config Storage

DB-first with file fallback. Load order: DB -> file (import to DB on first read) -> code defaults.
All saves go to DB with history tracking in `config_history` table.

| Config | DB Key | File Fallback |
|--------|--------|---------------|
| Scheduler | `scheduler` | `scheduler.json` |
| Agents | `agents` | `agents.json` |
| Genesis | `genesis` | `genesis.json` |
| Hooks | `hooks` | `hooks.json` |
| Prompts | `prompt_overrides` table | `prompts/*.md` |

First time a file config is found with no DB override, it's auto-imported to DB.
Config changes are audited in `config_history` (old_value, new_value, changed_by, changed_at).

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
  user_input,                     -- Original user request
  enrich_with_opus,               -- Flag to enrich with Opus before dispatch
  timeout_seconds,                -- Per-task timeout override
  result, error, parsed_result, error_details,
  retry_context,                  -- Previous error for retries
  cost_usd, duration_seconds,
  created_at, started_at, completed_at,
  shepherd_evaluated_at, armory_reviewed_at
)

-- Network registry
repos (id, path, name, description, language, mode,
  weight,                         -- 0-100 allocation weight for discovery selection
  created_at, last_scanned_at)

-- Alignment signals
signals (id, question, options, status, response, task_id, repo_path,
  telegram_message_id,            -- For Telegram reply matching
  created_at, responded_at)

-- Memory
memory_patterns (id, content, source, task_id, repo_path, tags, created_at)
memory_warnings (id, content, severity, task_id, repo_path, created_at)

-- Agent stats
agent_stats (agent_id, total_tasks, successful, failed, success_rate, total_cost, best_for, avoid_for, updated_at)

-- System agent runs
system_agent_runs (id, agent_type, status, repo_path, context, output, error, started_at, completed_at)

-- Shepherd evaluations
shepherd_evaluations (id, repo_path, evaluated_at, tasks_evaluated, health, headline, concerns, wins, recommendation, global_patterns, global_warnings, branch_evaluations, raw_response)

-- Fruiting sessions (full agent execution traces)
fruiting_sessions (id, task_id, repo_path, agent, model, context_trace, full_prompt,
  session_log,                    -- JSON array of {chunk, stream, timestamp} - TTL 24h
  created_at)

-- Network devices (control and monitoring)
devices (id, name, type, host, port, protocol,
  status, last_seen, last_error, response_time_ms,
  config,                         -- JSON device-specific settings
  description, created_at, updated_at)
-- Types: roku, yamaha, ssh, ollama, http, flipper
-- Protocols: http, https, upnp, ssh, serial
-- Statuses: online, offline, degraded, unknown

-- Config overrides (DB-first storage, replaces JSON files)
config_overrides (key, value, updated_at, updated_by)
-- Keys: scheduler, agents, genesis, hooks

-- Prompt overrides (DB-first storage, replaces .md files)
prompt_overrides (prompt_id, content, updated_at)

-- Config change history (audit trail)
config_history (id, config_key, field, old_value, new_value, changed_at, changed_by)
```

---

## Scheduler Cycles

All cycles run **independently and non-blocking**. Database state coordinates.

| Cycle | Interval | Purpose |
|-------|----------|---------|
| Dispatcher | 60 sec | Run sequenced tasks with resolved deps |
| Discovery | 15 min | Scan repos, create tasks |
| Sequencer | 15 min | Wire task dependencies |
| Shepherd | 15 min | Evaluate all unevaluated tasks per repo (5+ threshold, per-repo concurrency) |
| Armory | Batch (10+ tasks) | Skill/MCP inventory |
| Health Check | 60 sec | Device connectivity monitoring |
| Blocked Check | 15 min | Detect stuck tasks |
| Digest | 6 hours | Health summary (internal, no agent dispatch) |
| Compaction | Weekly Mon 11am + hourly TTL | Memory cleanup + session log TTL (internal, no agent dispatch) |

### Task Flow

```
Discovery creates task (sequenced=false)
    |                                                  + live SSE output (agent:output)
Sequencer analyzes + wires deps (sequenced=true)     [15 min]
    |                                                  + live SSE output + fruiting session
    |
Dispatcher runs ONLY sequenced tasks                  [60s poll]
    |                                                  + live SSE output (task:output)
    |                                                  + fruiting session + session log
    |
On success: Telegram notification (rich format with agent/model/cost)
On failure: Telegram notification + dependents cancelled
    |
Shepherd evaluates ALL unevaluated per repo           [15 min, 5+ threshold]
    |                                                  + per-repo concurrency (no global lock)
    |                                                  + live SSE output + Telegram report
    |
Discovery sees failed/cancelled tasks and can recreate chains

Active runs visible at GET /api/system-agents/active
and in GET /api/scheduler/status (active_runs field)
```

### Failure Handling

When a task fails:
1. Telegram notification sent with agent, duration, and error snippet
2. All dependent tasks are recursively **cancelled** (not unblocked)
3. Discovery sees failed + cancelled tasks and can recreate chains with different agent/model
4. Per-task `timeout_seconds` can override agent defaults for large tasks

### Agent Timeouts

| Agent | Timeout | Max Turns |
|-------|---------|-----------|
| Claude | 30 min | 50 |
| Codex | 30 min | 50 |
| Gemini | 30 min | 30 |
| Cline | 30 min | 30 |
| Cursor | 30 min | 30 |

Tasks can set `timeout_seconds` to override the agent default for large work.

---

## System Agents

### Agent-Dispatched (run via CLI agents)

| Agent | Model | Purpose | Can --wait? |
|-------|-------|---------|-------------|
| Discovery | opus/sonnet | Find work, create tasks | No |
| Sequencer | sonnet | Wire dependencies | No |
| Shepherd | opus | Evaluate yields, merge/reject | Yes (rare) |
| Armory | sonnet | Skill/MCP inventory | No |
| Genesis | opus | Create new repos (manual trigger only, no scheduler cycle) | No |

### Internal Cycles (no agent dispatch)

| Cycle | Purpose |
|-------|---------|
| Digest | Format and send interval stats via Telegram |
| Compaction | Memory dedup + session log TTL cleanup (24h) |
| Health Check | Device connectivity monitoring |
| Blocked Check | Detect stuck/orphaned tasks |

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
- `buildMcpSection(agent)` - MCP servers for the specific agent being dispatched

MCP servers are per-agent - each CLI has its own config:
| Agent | Config |
|-------|--------|
| Claude | `~/.claude.json` + `.mcp.json` (JSON) |
| Codex | `~/.codex/config.toml` (TOML) |
| Gemini | `~/.gemini/settings.json` (JSON) |
| Cline | VS Code globalStorage (JSON) |
| Cursor | `~/.cursor/mcp.json` (JSON) |

`getMcpServersForAgent(agent)` queries only that agent's config.
`getMcpServers()` aggregates all (used for inventory display only).

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
| Testing | bun:test |
| Real-time | SSE |

---

## File Locations

### Config Directory (Platform-Specific)

| Platform | Config Directory |
|----------|------------------|
| Linux/NixOS | `~/.config/mycelium-v2/` |
| macOS | `~/Library/Application Support/mycelium-v2/` |
| Windows | `%APPDATA%\mycelium-v2\` |

Override with `MYCELIUM_DATA_DIR` environment variable.

### Directory Structure

```
<config_dir>/
├── mycelium.db         # SQLite database
├── scheduler.json      # Scheduler config
├── agents.json         # Agent config overrides
├── genesis.json        # Genesis config
├── hooks.json          # Hooks config
├── telegram.json       # Telegram config
├── prompts/            # Custom prompt overrides
└── logs/               # Runtime logs

<repo>/.mycel/
├── memory.json         # Repo-specific memory
└── fruiting/           # Session traces
    └── <session_id>/
        ├── context.json
        ├── context.md
        └── layers/

~/.claude/skills/       # Skill libraries
~/.claude/mcp.json      # MCP server config (auto-discovered from agent CLIs)
```

### Frontend Source Structure

```
packages/client/src/
├── App.tsx                 # Root: Header + AppLayout + ToastContainer
├── main.tsx                # Entry: QueryClient + RouterProvider
├── index.css               # Tailwind base styles
├── components/
│   ├── Header.tsx          # Top bar: title, connection, scheduler, stats
│   ├── SystemView.tsx      # React Flow canvas (center column)
│   ├── Panel.tsx           # Legacy panel router (used by SystemView node clicks)
│   └── ToastContainer.tsx  # Fixed bottom-right stacked notifications
├── layout/
│   ├── AppLayout.tsx       # Three-column CSS flex: sidebar | canvas | panel
│   ├── LeftSidebar.tsx     # Collapsible nav (240px/48px) with live data
│   └── RightPanel.tsx      # 400px non-overlay detail panel
├── panels/                 # Extracted panel components (from Panel.tsx)
│   ├── SchedulerPanel.tsx  # Scheduler status + config
│   ├── CyclePanel.tsx      # Cycle detail + live logs
│   ├── TaskPoolPanel.tsx   # Task list + filters + create button
│   ├── AgentPanel.tsx      # Agent config editor
│   ├── AlignmentPanel.tsx  # Signals + response UI
│   ├── MemoryPanel.tsx     # Patterns + warnings management
│   ├── PromptsPanel.tsx    # System agent prompt editor
│   ├── LogsPanel.tsx       # Live task output viewer
│   ├── ReposPanel.tsx      # Repo list + browse + add
│   ├── InventoryPanel.tsx  # Skills + MCP servers
│   ├── index.ts            # Barrel exports
│   ├── task/
│   │   └── TaskCreateForm.tsx  # Task creation form
│   └── components/
│       └── ConfigControls.tsx  # Shared ConfigInput, ConfigToggle
├── stores/                 # Zustand domain stores
│   ├── system.ts           # Facade re-exporting domain stores
│   ├── api.ts              # fetchAPI<T>() helper
│   ├── uiStore.ts          # Panel state, sidebar, toasts
│   ├── connectionStore.ts  # SSE EventSource management
│   ├── schedulerStore.ts   # Scheduler status, config, active runs
│   ├── taskStore.ts        # Tasks, logs, graph, filters, stats
│   ├── signalStore.ts      # Signals, pending count
│   ├── memoryStore.ts      # Patterns, warnings, grouped memory
│   ├── promptStore.ts      # System agent prompts
│   ├── repoStore.ts        # Repos, browse
│   ├── inventoryStore.ts   # Skills, MCPs
│   ├── agentStore.ts       # Agent configurations
│   └── flowStore.ts        # React Flow nodes/edges
├── nodes/                  # React Flow node components
│   ├── index.ts            # Node type registry
│   ├── CycleNode.tsx       # Scheduler cycle nodes (DSC, SEQ, etc.)
│   ├── AlignmentNode.tsx   # Signal/alignment node
│   ├── TaskPoolNode.tsx    # Task pool summary node
│   ├── MemoryNode.tsx      # Memory summary node
│   └── AgentSlotsNode.tsx  # Agent slots node
├── lib/                    # Shared utilities
│   ├── formatters.ts       # formatTimeAgo, formatDuration, formatCost
│   ├── status.ts           # statusColor, statusBadge, truncate
│   └── utils.ts            # General utilities
├── hooks/
│   └── usePanelRouter.ts   # URL query param sync for panels
├── types/
│   └── index.ts            # Re-exports from @mycelium/shared + client types
└── flow/                   # React Flow configuration
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
