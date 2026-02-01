# Mycelium v2 - Agent Orchestration System

> **Read IMPLEMENTATION_PLAN.md** for phases and task assignments.
> **Read PROGRESS.md** for current status and validation checkpoints.

## Philosophy: Smart Agents, Dumb Pipes

Infrastructure collects data. Agents do thinking AND acting.

```
[Raw Data Collection]     <- TypeScript (dumb) - gather stats, run scanners
        |
        v
[Agent Prompt + Firehose] <- raw JSON data passed to agent
        |
        v
[Agent Reasoning]         <- SMART - decides what matters
        |
        v
[Agent Uses mycel]        <- SMART - sends own messages via CLI
        |
        v
[Exit]                    <- Agent done. Scheduler handles next cycle.
```

**Key Principles:**
- Agent-agnostic CLI dispatch (claude, codex, gemini, cline, cursor)
- Database state coordinates between cycles (no inter-cycle waiting)
- Agents USE mycel tools to coordinate (notify, align, task create)
- Prompts unchanged from v1 - they work

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Backend | Hono |
| Database | SQLite (bun:sqlite) + Drizzle ORM |
| Frontend | React 19 + Vite |
| Node Editor | React Flow (@xyflow/react) |
| State | Zustand + TanStack Query |
| Styling | Tailwind v4 |
| Validation | Zod |
| Real-time | SSE (Server-Sent Events) |

## Monorepo Structure

```
packages/
  shared/       # @mycelium/shared - Zod schemas, TypeScript types
  server/       # @mycelium/server - Hono API, scheduler, dispatch
  client/       # @mycelium/client - React Flow frontend
  cli/          # @mycelium/cli - Bun CLI (mycel command)
  mcp/          # @mycelium/mcp - MCP server tools
```

## Unified API Pattern

Every mycel command exposed THREE ways:

```
┌─────────────────────────────────────────────────────────────┐
│                     mycel notify "message"                   │
├─────────────────────────────────────────────────────────────┤
│  CLI        │  mycel notify "message"                       │
│  API        │  POST /api/notify { message: "..." }          │
│  MCP Tool   │  mycel_notify({ message: "..." })             │
│  Frontend   │  useMutation({ mutationFn: notify })          │
└─────────────────────────────────────────────────────────────┘
```

## Development

```bash
bun install                    # Install all deps
bun run dev                    # Run server + client
bun run dev:server             # Server only (port 8000)
bun run dev:client             # Client only (port 5173)
bun run db:studio              # Drizzle Studio

# CLI (after building)
bun run --filter cli build
./packages/cli/dist/mycel stats
```

## Database Schema

```sql
-- Core task tracking
tasks (
  id, title, prompt, status,
  agent, model, repo_path,
  depends_on,              -- JSON array of task IDs
  sequenced,               -- bool: has gone through Sequencer?
  result, error, parsed_result, error_details,
  cost_usd, duration_seconds,
  created_at, started_at, completed_at,
  shepherd_evaluated_at, armory_reviewed_at
)

-- Network registry
repos (id, path, name, description, language, mode, created_at, last_scanned_at)

-- Alignment signals
signals (id, question, options, status, response, task_id, repo_path, created_at, responded_at)

-- Memory patterns
memory_patterns (id, content, source, task_id, repo_path, tags, created_at)
memory_warnings (id, content, severity, task_id, repo_path, created_at)

-- System agent runs
system_agent_runs (id, agent_type, status, repo_path, context, output, error, started_at, completed_at)
```

## Scheduler Cycles

All cycles fire independently. Database state coordinates.

| Cycle | Interval | Purpose |
|-------|----------|---------|
| Dispatcher | 15 min | Run sequenced tasks with resolved deps |
| Discovery | 10 min | Scan repos, create tasks |
| Sequencer | On-demand | Wire task dependencies |
| Shepherd | On batch | Evaluate completed tasks, merge/reject |
| Armory | On batch | Skill/MCP inventory |
| Blocked Check | 15 min | Detect stuck tasks |
| Digest | 6 hours | Health summary |
| Compaction | Weekly | Memory cleanup |

## Agent Dispatch

```typescript
// Dumb pipe - just spawn and stream
const result = await dispatch({
  agent: 'claude',
  prompt: task.prompt,
  cwd: task.repo_path,
  model: 'sonnet',
  onOutput: (chunk) => broadcast('task:output', { id, chunk })
})
```

Agent CLI patterns (from v1, unchanged):
- Claude: `claude -p "prompt" --model sonnet --dangerously-skip-permissions`
- Codex: `codex -q "prompt" --model gpt-5.2-codex --full-auto`
- Gemini: `gemini -p "prompt" --model gemini-3-flash-preview`
- Cline: `cline --task "prompt"`
- Cursor: `cursor --prompt "prompt"`

## CLI Commands (All 50+)

See IMPLEMENTATION_PLAN.md for full list with implementation status.

**Categories:**
- Alignment: align, signals, check, notify, show, inbox, download, status
- Tasks: stats, tasks, task create/run/info/cancel/delete/update/prune
- Memory: memory global/repo read/add, compact
- Sessions: sessions, session, trace
- Discovery: discover, sequence
- Network: repos, repos discover/add/remove/health/paths/describe
- Config: config show/set, auto-create
- Runner: runner start/stop/config
- Genesis: genesis create/auto/config
- MCP: mcp

## System Agent Prompts

Prompts ported EXACTLY from v1. Locations:
- Discovery: `packages/server/src/prompts/discovery.ts`
- Sequencer: `packages/server/src/prompts/sequencer.ts`
- Shepherd: `packages/server/src/prompts/shepherd.ts`
- Genesis: `packages/server/src/prompts/genesis.ts`
- Armory: `packages/server/src/prompts/armory.ts`

## Config Files

Location: `~/.config/mycelium-v2/`

```
scheduler.json      # Cycle intervals, concurrency limits
network.json        # Registered repos
genesis.json        # Genesis agent config
global_memory.json  # Network-wide learning
mycelium.db         # SQLite database
logs/               # Runtime logs
```

## Frontend Node Types

```typescript
// Agent orchestration nodes
AgentNode       // System agents (Discovery, Sequencer, Shepherd)
TaskNode        # Individual tasks with status
RepoNode        # Network repos
SignalNode      # Alignment signals (pending/responded)
MemoryNode      # Memory patterns display

// Edges represent data flow / dependencies
```

## Conventions

- No emojis unless requested
- Conventional commits
- Agent-agnostic dispatch
- Type-safe with Zod schemas
- SSE for real-time (not WebSocket)
- Prompts unchanged from v1
- Database as coordination mechanism
