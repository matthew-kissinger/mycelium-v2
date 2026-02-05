# Mycelium v2 Implementation Plan

> **Parallel Agent Execution**: Phases marked with same number can run simultaneously.
> **Shared Workspace**: Update PROGRESS.md when completing tasks.
> **Validation**: Each phase has validation checkpoints before proceeding.

---

## Phase 0: Foundation (COMPLETE)

**Status**: DONE
**Agent**: Initial scaffolding complete

- [x] Monorepo structure (packages/shared, server, client)
- [x] Package.json with workspaces
- [x] Bun + TypeScript configuration
- [x] Basic Zod schemas (task, repo, agent, signal, memory)
- [x] Drizzle schema
- [x] Hono server skeleton
- [x] React Flow client skeleton
- [x] Agent dispatch module

---

## Phase 1: Core Infrastructure (PARALLEL)

Three agents can work simultaneously on 1A, 1B, 1C.

### Phase 1A: Complete Database Layer
**Assignable to**: Any agent
**Depends on**: Phase 0
**Files**: `packages/server/src/db/`

Tasks:
- [ ] Add missing tables (signals, memory_patterns, memory_warnings, system_agent_runs, shepherd_evaluations)
- [ ] Create database query functions (CRUD for each table)
- [ ] Add migration system
- [ ] Implement connection pooling pattern

**Validation**:
```bash
bun run dev:server  # Should start without errors
# Test: curl http://localhost:8000/api/health
```

### Phase 1B: Complete Shared Schemas
**Assignable to**: Any agent
**Depends on**: Phase 0
**Files**: `packages/shared/src/schemas/`

Tasks:
- [ ] Add ShepherdEvaluation schema
- [ ] Add SystemAgentRun schema
- [ ] Add SchedulerConfig schema
- [ ] Add all API request/response schemas
- [ ] Add SSE event schemas

**Validation**:
```bash
cd packages/shared && bun run build  # Should compile without errors
```

### Phase 1C: SSE Infrastructure
**Assignable to**: Any agent
**Depends on**: Phase 0
**Files**: `packages/server/src/sse.ts`

Tasks:
- [ ] Implement proper SSE with heartbeat
- [ ] Add topic-based subscriptions (task:*, repo:*, signal:*)
- [ ] Add client reconnection handling
- [ ] Add backpressure handling

**Validation**:
```bash
# Start server, connect via curl:
curl -N http://localhost:8000/api/events
# Should receive heartbeat events
```

---

## Phase 2: API Routes (PARALLEL)

Six agents can work simultaneously - one per route group.

### Phase 2A: Task Routes
**Assignable to**: Any agent
**Depends on**: Phase 1A
**Files**: `packages/server/src/routes/tasks.ts`

Endpoints to implement:
- [ ] GET /api/tasks - List with filters (status, repo, limit)
- [ ] POST /api/tasks - Create task (with dependency resolution)
- [ ] GET /api/tasks/:id - Get single task
- [ ] PATCH /api/tasks/:id - Update task
- [ ] DELETE /api/tasks/:id - Delete task
- [ ] POST /api/tasks/:id/run - Execute task
- [ ] POST /api/tasks/:id/cancel - Cancel running task
- [ ] GET /api/tasks/:id/context - Get assembled context
- [ ] GET /api/tasks/graph - Dependency graph

**Validation**: Test each endpoint with curl

### Phase 2B: Signal Routes
**Assignable to**: Any agent
**Depends on**: Phase 1A
**Files**: `packages/server/src/routes/signals.ts`

Endpoints:
- [ ] GET /api/signals - List signals
- [ ] POST /api/signals - Create signal (alignment request)
- [ ] GET /api/signals/:id - Get signal
- [ ] POST /api/signals/:id/respond - Record response
- [ ] GET /api/signals/pending - Get pending signals

**Validation**: Create signal, respond, verify status change

### Phase 2C: Memory Routes
**Assignable to**: Any agent
**Depends on**: Phase 1A
**Files**: `packages/server/src/routes/memory.ts`

Endpoints:
- [ ] GET /api/memory/global - Get global memory
- [ ] POST /api/memory/global - Add to global memory
- [ ] GET /api/memory/repo/:path - Get repo memory
- [ ] POST /api/memory/repo/:path - Add to repo memory
- [ ] POST /api/memory/compact - Trigger compaction

**Validation**: Add pattern, read back, verify persistence

### Phase 2D: Repo Routes
**Assignable to**: Any agent
**Depends on**: Phase 1A
**Files**: `packages/server/src/routes/repos.ts`

Endpoints (extend existing):
- [ ] GET /api/repos - List repos (done)
- [ ] POST /api/repos - Add repo (done)
- [ ] DELETE /api/repos/:id - Remove repo
- [ ] PATCH /api/repos/:id - Update repo
- [ ] GET /api/repos/health - Network health
- [ ] POST /api/repos/discover - Scan paths for repos

**Validation**: Add repo, verify in list, remove, verify gone

### Phase 2E: System Agent Routes
**Assignable to**: Any agent
**Depends on**: Phase 1A
**Files**: `packages/server/src/routes/system-agents.ts`

Endpoints:
- [ ] GET /api/system-agents/runs - List system agent runs
- [ ] GET /api/system-agents/runs/:id - Get run details
- [ ] POST /api/discovery/trigger - Manually trigger discovery
- [ ] POST /api/sequencer/trigger - Manually trigger sequencer
- [ ] POST /api/shepherd/trigger - Manually trigger shepherd
- [ ] GET /api/scheduler/status - Scheduler status

**Validation**: Trigger discovery, verify run record created

### Phase 2F: Notification Routes
**Assignable to**: Any agent
**Depends on**: Phase 1A
**Files**: `packages/server/src/routes/notify.ts`

Endpoints:
- [ ] POST /api/notify - Send notification (Telegram placeholder)
- [ ] POST /api/align - Create alignment signal
- [ ] GET /api/inbox - Get user messages (Telegram placeholder)

**Validation**: Send notification, verify logged

---

## Phase 3: CLI Package (PARALLEL with Phase 2)

### Phase 3A: CLI Scaffold
**Assignable to**: Any agent
**Depends on**: Phase 1B
**Files**: `packages/cli/`

Tasks:
- [ ] Create package.json for @mycelium/cli
- [ ] Set up commander.js or yargs for CLI parsing
- [ ] Create API client wrapper (fetch to server)
- [ ] Add binary entry point (mycel)

**Validation**:
```bash
cd packages/cli && bun run build
./dist/mycel --help  # Should show help
```

### Phase 3B: Task Commands
**Assignable to**: Any agent
**Depends on**: Phase 3A, Phase 2A
**Files**: `packages/cli/src/commands/tasks.ts`

Commands:
- [ ] mycel stats
- [ ] mycel tasks [--status] [--limit]
- [ ] mycel task create <title> [--repo] [--agent] [--model] [--prompt] [--depends-on]
- [ ] mycel task run <id>
- [ ] mycel task info <id>
- [ ] mycel task cancel <id>
- [ ] mycel task delete <id>
- [ ] mycel task update <id> [--depends-on] [--clear-deps]
- [ ] mycel task prune [--keep] [--dry-run]

**Validation**: Run each command, verify output

### Phase 3C: Signal Commands
**Assignable to**: Any agent
**Depends on**: Phase 3A, Phase 2B
**Files**: `packages/cli/src/commands/signals.ts`

Commands:
- [ ] mycel align <question> [--options] [--wait] [--timeout]
- [ ] mycel signals [--pending] [--limit]
- [ ] mycel check [--once]
- [ ] mycel notify <message>
- [ ] mycel inbox [--limit]
- [ ] mycel status

**Validation**: Create signal via CLI, verify in API

### Phase 3D: Memory Commands
**Assignable to**: Any agent
**Depends on**: Phase 3A, Phase 2C
**Files**: `packages/cli/src/commands/memory.ts`

Commands:
- [ ] mycel memory global read
- [ ] mycel memory global add <content> [--type]
- [ ] mycel memory repo read [--repo]
- [ ] mycel memory repo add <content> [--repo] [--type] [--severity]
- [ ] mycel compact [--repo]

**Validation**: Add memory via CLI, read back via API

### Phase 3E: Network Commands
**Assignable to**: Any agent
**Depends on**: Phase 3A, Phase 2D
**Files**: `packages/cli/src/commands/repos.ts`

Commands:
- [ ] mycel repos
- [ ] mycel repos add <path> [--auto-create] [--description]
- [ ] mycel repos remove <path>
- [ ] mycel repos health
- [ ] mycel repos discover [path]
- [ ] mycel repos describe <path> [--description]
- [ ] mycel repos paths [add|remove] <path>

**Validation**: Add repo via CLI, list via API

### Phase 3F: Runner Commands
**Assignable to**: Any agent
**Depends on**: Phase 3A
**Files**: `packages/cli/src/commands/runner.ts`

Commands:
- [ ] mycel runner
- [ ] mycel runner start
- [ ] mycel runner stop
- [ ] mycel runner config [--interval] [--max-concurrent]
- [ ] mycel config show
- [ ] mycel config set <key> <value>

**Validation**: Start/stop runner, verify status

---

## Phase 4: System Agent Prompts (PARALLEL)

Port prompts EXACTLY from v1. Five agents can work simultaneously.

### Phase 4A: Discovery Prompt
**Assignable to**: Any agent
**Depends on**: Phase 2A
**Files**: `packages/server/src/prompts/discovery.ts`

Tasks:
- [ ] Port DISCOVERY_AGENT_PROMPT from v1 discovery.py:632-726
- [ ] Port AUTONOMOUS_DISCOVERY_PROMPT from v1 discovery.py:729+
- [ ] Add template variable injection ({MYCEL_CONTEXT}, {AGENTS_SECTION})

**Validation**: Compare line-by-line with v1

### Phase 4B: Sequencer Prompt
**Assignable to**: Any agent
**Depends on**: Phase 2A
**Files**: `packages/server/src/prompts/sequencer.ts`

Tasks:
- [ ] Port SEQUENCER_SYSTEM_PROMPT from v1 sequencer.py:74-160
- [ ] Port output YAML schema

**Validation**: Compare line-by-line with v1

### Phase 4C: Shepherd Prompt
**Assignable to**: Any agent
**Depends on**: Phase 2A
**Files**: `packages/server/src/prompts/shepherd.ts`

Tasks:
- [ ] Port SHEPHERD_SYSTEM_PROMPT from v1 shepherd.py:139-335
- [ ] Port output YAML schema

**Validation**: Compare line-by-line with v1

### Phase 4D: Genesis Prompt
**Assignable to**: Any agent
**Depends on**: Phase 2A
**Files**: `packages/server/src/prompts/genesis.ts`

Tasks:
- [ ] Port GENESIS_AGENT_PROMPT from v1 genesis.py:85-200
- [ ] Add scaffold templates

**Validation**: Compare line-by-line with v1

### Phase 4E: Armory Prompt
**Assignable to**: Any agent
**Depends on**: Phase 2A
**Files**: `packages/server/src/prompts/armory.ts`

Tasks:
- [ ] Port ARMORY_AGENT_PROMPT from v1 armory.py:62-150
- [ ] Port output YAML schema

**Validation**: Compare line-by-line with v1

---

## Phase 5: Scheduler (Sequential)

### Phase 5A: Scheduler Core
**Assignable to**: Any agent
**Depends on**: Phase 2, Phase 4
**Files**: `packages/server/src/scheduler/`

Tasks:
- [ ] Create scheduler manager (start/stop cycles)
- [ ] Implement cycle abstraction
- [ ] Add config loading (scheduler.json)
- [ ] Add logging

**Validation**: Start scheduler, verify cycles fire

### Phase 5B: Individual Cycles
**Assignable to**: Any agent
**Depends on**: Phase 5A
**Files**: `packages/server/src/scheduler/cycles/`

Cycles:
- [ ] Dispatcher cycle (run ready tasks)
- [ ] Discovery cycle (scan repos)
- [ ] Sequencer cycle (wire dependencies)
- [ ] Shepherd cycle (evaluate batches)
- [ ] Armory cycle (inventory management)
- [ ] Blocked check cycle
- [ ] Digest cycle
- [ ] Compaction cycle

**Validation**: Trigger each cycle manually, verify behavior

---

## Phase 6: Frontend (PARALLEL with Phase 5)

### Phase 6A: Node Components
**Assignable to**: Any agent
**Depends on**: Phase 1C
**Files**: `packages/client/src/nodes/`

Components:
- [ ] AgentNode (system agents with status)
- [ ] TaskNode (task with status, progress)
- [ ] RepoNode (repo info)
- [ ] SignalNode (alignment with response)
- [ ] MemoryNode (patterns display)

**Validation**: Render each node type

### Phase 6B: Workflow Store
**Assignable to**: Any agent
**Depends on**: Phase 1B
**Files**: `packages/client/src/stores/`

Tasks:
- [ ] Create Zustand workflow store
- [ ] Add node/edge management
- [ ] Add SSE subscription
- [ ] Add optimistic updates

**Validation**: Add node, verify state update

### Phase 6C: Live Logs
**Assignable to**: Any agent
**Depends on**: Phase 1C
**Files**: `packages/client/src/components/LiveLogs.tsx`

Tasks:
- [ ] Create log viewer component
- [ ] Add SSE subscription for task:output events
- [ ] Add toggle visibility
- [ ] Add log filtering
- [ ] Add auto-scroll

**Validation**: Run task, see live output in UI

### Phase 6D: Task Panel
**Assignable to**: Any agent
**Depends on**: Phase 2A
**Files**: `packages/client/src/components/TaskPanel.tsx`

Tasks:
- [ ] Create task list panel
- [ ] Add status filters
- [ ] Add task creation form
- [ ] Add task detail view
- [ ] Add dependency visualization

**Validation**: Create task from UI, verify in list

### Phase 6E: Signal Panel
**Assignable to**: Any agent
**Depends on**: Phase 2B
**Files**: `packages/client/src/components/SignalPanel.tsx`

Tasks:
- [ ] Create pending signals list
- [ ] Add response form
- [ ] Add signal history

**Validation**: See pending signal, respond, verify update

---

## Phase 7: MCP Package (PARALLEL with Phase 6)

### Phase 7A: MCP Server
**Assignable to**: Any agent
**Depends on**: Phase 2
**Files**: `packages/mcp/`

Tasks:
- [ ] Create package.json for @mycelium/mcp
- [ ] Set up FastMCP or MCP SDK
- [ ] Create stdio server entry point

**Validation**:
```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | bun packages/mcp/src/index.ts
```

### Phase 7B: MCP Tools
**Assignable to**: Any agent
**Depends on**: Phase 7A
**Files**: `packages/mcp/src/tools/`

Tools (wrap API endpoints):
- [ ] mycel_stats
- [ ] mycel_tasks
- [ ] mycel_task_create
- [ ] mycel_task_run
- [ ] mycel_task_info
- [ ] mycel_repos
- [ ] mycel_notify
- [ ] mycel_align
- [ ] mycel_memory
- [ ] mycel_genesis
- [ ] mycel_sequence

**Validation**: Call each tool via MCP protocol

---

## Phase 8: Integration (Sequential)

### Phase 8A: End-to-End Flow
**Assignable to**: Any agent
**Depends on**: All previous phases
**Files**: Various

Tasks:
- [ ] Test full task lifecycle (create -> run -> complete -> evaluate)
- [ ] Test discovery -> sequencer -> dispatcher flow
- [ ] Test signal flow (align -> respond -> continue)
- [ ] Test memory accumulation
- [ ] Test frontend live updates

**Validation**: Run through complete workflows

### Phase 8B: Telegram Integration
**Assignable to**: Any agent
**Depends on**: Phase 8A
**Files**: `packages/server/src/telegram/`

Tasks:
- [ ] Port telegram.py polling logic
- [ ] Integrate with signals
- [ ] Add notification sending
- [ ] Add file/image handling

**Validation**: Send notification, receive in Telegram

### Phase 8C: npm Publishing
**Assignable to**: Any agent
**Depends on**: Phase 8A
**Files**: Package configs

Tasks:
- [ ] Set up npm scopes (@mycelium/)
- [ ] Add build scripts for each package
- [ ] Add package publishing workflow
- [ ] Create global CLI install

**Validation**: npm install -g @mycelium/cli && mycel --version

---

## Agent Assignment Protocol

When claiming a phase:

1. **Update PROGRESS.md** with:
   ```markdown
   ## Phase 1A: Complete Database Layer
   **Status**: IN PROGRESS
   **Agent**: claude/sonnet
   **Started**: 2026-01-31T12:00:00Z
   ```

2. **Work on the phase**

3. **Run validation** before marking complete

4. **Update PROGRESS.md** with:
   ```markdown
   ## Phase 1A: Complete Database Layer
   **Status**: COMPLETE
   **Agent**: claude/sonnet
   **Completed**: 2026-01-31T14:00:00Z
   **Validation**: All tests pass
   **Notes**: Added connection pooling for better performance
   ```

5. **Commit with conventional commit**:
   ```
   feat(db): complete database layer for Phase 1A
   ```

---

## Dependency Graph

```
Phase 0 (DONE)
    │
    ├── Phase 1A (DB) ────┬── Phase 2A-F (Routes) ─┬── Phase 5 (Scheduler)
    ├── Phase 1B (Schemas)│                        │
    └── Phase 1C (SSE) ───┴── Phase 3 (CLI) ───────┴── Phase 8 (Integration)
                          │
                          ├── Phase 4 (Prompts)
                          │
                          ├── Phase 6 (Frontend)
                          │
                          └── Phase 7 (MCP)
```

Phases at same level can run in parallel.
