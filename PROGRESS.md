# Mycelium v2 Progress Tracker

> Agents update this file when claiming/completing phases.
> This is the coordination mechanism for parallel work.

---

## Current Status

| Phase | Status | Agent | Notes |
|-------|--------|-------|-------|
| 0 | COMPLETE | initial | Scaffolding done |
| 1A | COMPLETE | claude/opus | Database layer |
| 1B | COMPLETE | claude/opus | Shared schemas |
| 1C | COMPLETE | claude/opus | SSE infrastructure |
| 2A | COMPLETE | claude/opus | Task routes (extended with full functionality) |
| 2B | COMPLETE | claude/opus | Signal routes |
| 2C | COMPLETE | claude/opus | Memory routes |
| 2D | COMPLETE | claude/opus | Repo routes |
| 2E | COMPLETE | claude/opus | System agent routes |
| 2F | COMPLETE | claude/opus | Notification routes |
| 3A | COMPLETE | claude/opus | CLI scaffold |
| 3B-F | PENDING | - | CLI commands |
| 4A | COMPLETE | claude/opus | Discovery prompt |
| 4B | COMPLETE | claude/opus | Sequencer prompt |
| 4C | COMPLETE | claude/opus | Shepherd prompt |
| 4D | COMPLETE | claude/opus | Genesis prompt |
| 4E | COMPLETE | claude/opus | Armory prompt |
| 5A-B | PENDING | - | Scheduler |
| 6A-E | PENDING | - | Frontend |
| 7A-B | PENDING | - | MCP package |
| 8A-C | PENDING | - | Integration |

---

## Phase Details

### Phase 0: Foundation
**Status**: COMPLETE
**Completed**: 2026-01-31
**Notes**: Initial scaffold with Bun + Hono + React Flow

### Phase 1A: Complete Database Layer
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-01-31T12:00:00Z
**Completed**: 2026-01-31T20:00:00Z
**Validation**: Database tables created and CRUD functions working

### Phase 1B: Complete Shared Schemas
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-01-31T20:30:00Z
**Completed**: 2026-01-31T21:00:00Z
**Validation**:
- TypeScript compiles without errors (bun run tsc --noEmit)
- All schemas export correctly from packages/shared

**Files Created**:
- `packages/shared/src/schemas/shepherd.ts` - Shepherd evaluation schemas
- `packages/shared/src/schemas/system-agent.ts` - System agent run tracking
- `packages/shared/src/schemas/scheduler.ts` - Scheduler configuration
- `packages/shared/src/schemas/api.ts` - All API request/response schemas
- `packages/shared/src/schemas/events.ts` - SSE event schemas

**Notes**:
- ShepherdEvaluation with BranchEvaluation, HumanReport, MergeDecision enum
- SystemAgentRun with SystemAgentType, SystemAgentStatus enums
- SchedulerConfig with all cycle intervals and thresholds
- Complete API schemas for tasks, signals, memory, repos, system agents, notifications
- Discriminated union types for all SSE events (TaskEvent, SignalEvent, SystemAgentEvent, etc.)

### Phase 1C: SSE Infrastructure
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-01-31T18:00:00Z
**Completed**: 2026-01-31T18:30:00Z
**Validation**:
- Server starts without errors
- SSE endpoint accepts topics query param: `/api/events?topics=task:*,signal:*`
- Clients receive `connected` event with clientId and subscribed topics
- Heartbeat sends every 30 seconds to all clients
- Topic filtering works (task:*, signal:*, system:*, repo:*, specific IDs)
- Backpressure handling removes disconnected clients
- `/api/events/clients` endpoint shows connected clients
- Graceful shutdown cleans up SSE connections

**Notes**:
- Added SSETopic types to shared package
- Topic patterns: `*` (all), `task:*` (category), `task:123` (specific)
- Client management: subscribe/unsubscribe/disconnect functions
- Heartbeat starts on first client, stops when no clients

### Phase 2A: Task Routes
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T01:30:00Z
**Completed**: 2026-02-01T01:45:00Z
**Validation**:
- TypeScript compiles without errors (server package)
- GET /api/tasks returns all tasks with filters (status, repo_path, limit, offset, sequenced)
- POST /api/tasks creates task with dependency resolution
- GET /api/tasks/:id returns single task with parsed JSON fields
- PATCH /api/tasks/:id updates task (status, depends_on, agent, model, etc.)
- DELETE /api/tasks/:id deletes task (checks for running state and dependents)
- POST /api/tasks/:id/run executes task via dispatch with optional agent/model overrides
- POST /api/tasks/:id/cancel cancels running task
- GET /api/tasks/:id/context returns assembled context (task, repo, patterns, warnings, evaluations, dependencies)
- GET /api/tasks/graph returns dependency graph with nodes and edges

**Files Modified**:
- `packages/server/src/routes/tasks.ts` - Extended with full functionality
- `packages/shared/src/schemas/events.ts` - Added task:deleted, notification:sent, system:agent_started, memory:pattern_deleted, memory:warning_deleted events

**Notes**:
- Uses query functions from queries.ts for database operations
- Dependency resolution: supports short IDs (prefix matching) and full UUIDs
- Run endpoint: checks dependencies are resolved before starting
- Cancel endpoint: uses AbortController to signal task cancellation
- Context endpoint: aggregates patterns, warnings, evaluations, related tasks, dependencies
- Graph endpoint: returns nodes with dependency edges for visualization
- Broadcasts SSE events for all task state changes

### Phase 2B: Signal Routes
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T01:35:00Z
**Completed**: 2026-02-01T01:45:00Z
**Validation**:
- TypeScript compiles without errors (server package)
- GET /api/signals returns all signals with filters (status, repo_path, task_id, limit)
- POST /api/signals creates alignment signal with question and optional options
- GET /api/signals/:id returns single signal
- POST /api/signals/:id/respond records response to signal
- GET /api/signals/pending returns pending signals only
- DELETE /api/signals/:id removes signal

**Files Created**:
- `packages/server/src/routes/signals.ts` - Complete signal routes

**Notes**:
- Uses SignalCreateRequest and SignalRespondRequest from @mycelium/shared
- Broadcasts signal:created, signal:responded, signal:expired events via SSE
- Signal expiration: 24 hours default, auto-expire on list/get
- Response validation: rejects responses not in options list
- Supports blocking wait mode with configurable timeout
- Cannot respond to non-pending signals (already responded or expired)

### Phase 2C: Memory Routes
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T01:30:00Z
**Completed**: 2026-02-01T01:40:00Z
**Validation**:
- TypeScript compiles without errors
- GET /api/memory/global returns patterns and warnings
- POST /api/memory/global creates pattern or warning (type discriminated)
- GET /api/memory/repo/:path returns repo-specific memory (URL-encoded path)
- POST /api/memory/repo/:path creates repo-specific pattern or warning
- POST /api/memory/compact triggers compaction (placeholder)

**Files Created**:
- `packages/server/src/routes/memory.ts` - Memory routes implementation

**Notes**:
- Uses MemoryWriteRequest from @mycelium/shared (discriminated union for pattern/warning)
- Global memory: repo_path = null in database
- Repo memory: repo_path = decoded URL path
- Broadcasts SSE events for pattern/warning creation
- Compact endpoint is a placeholder for future system agent integration

### Phase 2D: Repo Routes
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T01:30:00Z
**Completed**: 2026-02-01T01:40:00Z
**Validation**:
- TypeScript compiles without errors for repos.ts
- GET /api/repos lists all registered repos
- POST /api/repos adds new repo with validation (path exists, is git repo, not already registered)
- GET /api/repos/:id returns single repo
- PATCH /api/repos/:id updates mode and description
- DELETE /api/repos/:id removes repo
- GET /api/repos/health returns health summary with per-repo task stats and health scores
- POST /api/repos/discover scans directories for git repos (1 level deep)

**Files Modified**:
- `packages/server/src/routes/repos.ts` - Extended with health and discover endpoints
- `packages/shared/src/schemas/events.ts` - Added repo:added, repo:updated, repo:removed events

**Notes**:
- Uses RepoCreateRequest, RepoUpdateRequest, RepoDiscoverRequest from @mycelium/shared
- Discover endpoint: scans for .git directories, detects language, extracts README description
- Health endpoint: calculates per-repo health score (0-100) based on task success rate, pending tasks, activity
- Broadcasts SSE events on repo add/update/remove
- Language detection supports: TypeScript, JavaScript, Python, Rust, Go, Java, Ruby, PHP, Elixir, Clojure, C/C++

### Phase 2E: System Agent Routes
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T01:35:00Z
**Completed**: 2026-02-01T01:40:00Z
**Validation**:
- TypeScript compiles without errors
- GET /api/system-agents/runs returns all system agent runs with filters (agent_type, status, repo_path, limit, offset)
- GET /api/system-agents/runs/:id returns single run details
- POST /api/discovery/trigger creates discovery agent run record
- POST /api/sequencer/trigger creates sequencer agent run record
- POST /api/shepherd/trigger creates shepherd agent run record (requires repo_path)
- GET /api/scheduler/status returns scheduler status placeholder

**Files Created**:
- `packages/server/src/routes/system-agents.ts` - System agent routes with multiple exports

**Notes**:
- Exports separate routers: systemAgentsRoutes, discoveryRoutes, sequencerRoutes, shepherdRoutes, schedulerRoutes
- Trigger endpoints create system_agent_run records with status='running' (actual dispatch in Phase 5)
- Scheduler status returns placeholder with all cycle types (dispatcher, discovery, sequencer, shepherd, digest, compaction, blocked_check)
- Broadcasts system:agent_started SSE events on trigger
- Shepherd trigger validates that repo_path is provided

### Phase 2F: Notification Routes
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T01:35:00Z
**Completed**: 2026-02-01T01:40:00Z
**Validation**:
- TypeScript compiles without errors
- POST /api/notify logs message and returns success (placeholder for Telegram)
- POST /api/align creates alignment signal with optional blocking wait
- GET /api/inbox returns empty array (placeholder for Telegram inbox)
- GET /api/status returns disconnected status (placeholder for Telegram connection)

**Files Created**:
- `packages/server/src/routes/notify.ts` - Notification routes implementation

**Notes**:
- Uses NotifyRequest, NotifyResponse, SignalCreateRequest from @mycelium/shared
- /api/notify is a placeholder - logs message, returns success (Telegram integration later)
- /api/align reuses signal creation logic, supports blocking wait with configurable timeout
- /api/inbox returns empty array (will return Telegram messages when integrated)
- /api/status returns connection status (will check Telegram bot when integrated)
- Broadcasts signal:created SSE event when alignment signal is created

### Phase 3A: CLI Scaffold
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T02:00:00Z
**Completed**: 2026-02-01T02:15:00Z
**Validation**:
- `bun install` succeeds in packages/cli
- `bun run packages/cli/src/index.ts --help` shows help with all options
- `bun run packages/cli/src/index.ts --version` outputs 0.1.0
- `bun run tsc --noEmit` passes in packages/cli
- `--api-url` option accepts custom URLs

**Files Created**:
- `packages/cli/package.json` - Package config with commander dependency
- `packages/cli/tsconfig.json` - TypeScript config extending root
- `packages/cli/src/index.ts` - Entry point with Commander.js, placeholder commands
- `packages/cli/src/client.ts` - API client wrapper with get/post/patch/delete methods
- `packages/cli/src/output.ts` - Output formatting helpers (table, json, success, error, info)

**Notes**:
- Global `--api-url` option defaults to http://localhost:8000 or MYCEL_API_URL env
- Client uses `setGlobalClient` / `getClient` pattern for command access
- Placeholder commands registered for stats, tasks, repos, signals, memory, notify
- ApiError class for structured error handling
- Table formatter with auto-column widths and value truncation

### Phase 4A: Discovery Prompt
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T04:00:00Z
**Completed**: 2026-02-01T04:15:00Z
**Validation**:
- TypeScript compiles without errors (bun run tsc --noEmit in packages/server)
- Prompt text matches v1 discovery.py exactly (lines 632-726, 729-908, 911-993)
- All three prompts ported: DISCOVERY_AGENT_PROMPT, AUTONOMOUS_DISCOVERY_PROMPT, TASK_CREATOR_AGENT_PROMPT
- Output markers and helper functions included
- buildDiscoveryPrompt, buildTaskCreatorPrompt helpers with context injection

**Files Created**:
- `packages/server/src/prompts/discovery.ts` - Complete Discovery agent prompt port

**Notes**:
- DISCOVERY_AGENT_PROMPT: Alignment mode (sends report, awaits human reply)
- AUTONOMOUS_DISCOVERY_PROMPT: Auto-create mode (explores, updates docs, creates tasks directly)
- TASK_CREATOR_AGENT_PROMPT: Continuation agent for transforming human response into tasks
- Template variables: {MYCEL_CONTEXT}, {AGENTS_SECTION}, {repo_path}, {repo_name}
- DiscoveryContext, TaskCreatorContext interfaces for type-safe context injection
- Success markers: DISCOVERY_SENT_MARKER, DISCOVERY_AUTO_MARKER, TASKS_CREATED_REGEX
- Helper functions: isDiscoverySignal, extractRepoFromSignal

### Phase 4B: Sequencer Prompt
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-01-31T06:00:00Z
**Completed**: 2026-01-31T06:15:00Z
**Validation**:
- TypeScript compiles without errors (bun run tsc --noEmit)
- Prompt text matches v1 sequencer.py exactly (lines 74-160)
- YAML output schema documented
- Context builder function with full task/memory/evaluation support
- Response parser function for YAML extraction

**Files Created**:
- `packages/server/src/prompts/sequencer.ts` - Complete Sequencer agent prompt port
- `packages/server/src/prompts/index.ts` - Prompts module index (updated)

**Notes**:
- SEQUENCER_SYSTEM_PROMPT: Main prompt with analysis guidelines, output format, decision criteria
- SEQUENCER_OUTPUT_SCHEMA: Expected YAML structure (dependency_updates, parallel_groups, summary)
- buildSequencerPrompt: Context builder with pending tasks, running tasks, memory, Shepherd evals
- parseSequencerResponse: YAML extraction and parsing into typed structure
- SequencerTaskContext, RunningTaskContext, ShepherdEvalContext interfaces for type-safe context
- DependencyUpdate, ParallelGroup, SequencerOutput interfaces for parsed output
- SEQUENCER_CONFIG: Default agent (claude), model (sonnet), timeout (5 min)

### Phase 4D: Genesis Prompt
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T03:30:00Z
**Completed**: 2026-02-01T03:45:00Z
**Validation**:
- TypeScript compiles without errors (bun run tsc --noEmit)
- Prompt text matches v1 genesis.py exactly (lines 85-228, 316-379, 611-647)
- All three prompts ported: GENESIS_AGENT_PROMPT, AUTO_GENESIS_PROMPT, GENESIS_CONTINUATION_PROMPT
- Output markers and helper functions included
- buildGenesisPrompt, buildAutoGenesisPrompt, buildContinuationPrompt helpers

**Files Created**:
- `packages/server/src/prompts/genesis.ts` - Complete Genesis agent prompt port

**Notes**:
- GENESIS_AGENT_PROMPT: Main prompt for manual mode (create repo from request)
- AUTO_GENESIS_PROMPT: Network analysis mode (propose/create based on network state)
- GENESIS_CONTINUATION_PROMPT: Human response handling after proposals
- GENESIS_MARKERS: Output markers for parsing (complete, proposal_sent, no_proposals, continuation_complete)
- GenesisContext, AutoGenesisContext, ContinuationContext interfaces for type-safe context
- parseGenesisResult function extracts YAML result from agent output
- isGenesisSignal function detects Genesis-related alignment signals
- Scaffold templates for CLAUDE.md and README.md included

### Phase 4E: Armory Prompt
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T03:00:00Z
**Completed**: 2026-02-01T03:15:00Z
**Validation**:
- TypeScript compiles without errors (bun run tsc --noEmit)
- Prompt text matches v1 armory.py exactly (lines 67-155)
- YAML output schema included
- Inventory format template included
- buildArmoryPrompt helper function with context injection

**Files Created**:
- `packages/server/src/prompts/armory.ts` - Complete Armory agent prompt port

**Notes**:
- ARMORY_AGENT_PROMPT: Main prompt template with mission, skill acquisition, MCP installation
- ARMORY_OUTPUT_SCHEMA: Expected YAML output format (skills_added, mcps_installed, gaps_remaining)
- INVENTORY_FORMAT: Template for current skill/MCP inventory section
- ArmoryContext interface for type-safe context injection
- buildArmoryPrompt function replaces {inventory} and {tasks_analyzed} placeholders

---

## Agent Harness Compatibility Matrix

**IMPORTANT**: Test all implementations against each harness.

| Feature | Claude | Codex | Gemini | Cline | Cursor |
|---------|--------|-------|--------|-------|--------|
| CLI command | `claude` | `codex` | `gemini` | `cline` | `cursor` |
| Prompt flag | `-p` | `-q` | `-p` | `--task` | `--prompt` |
| Model flag | `--model` | `--model` | `--model` | N/A | N/A |
| Auto mode | `--dangerously-skip-permissions` | `--full-auto` | (default) | (default) | (default) |
| Streaming | Yes | Yes | Yes | No | No |
| Max timeout | 30 min | 30 min | 15 min | 10 min | 10 min |
| Exit codes | Standard | Standard | Standard | Custom | Custom |
| Cost in output | Yes | Yes | Yes | No | No |
| Session logs | ~/.claude/ | ~/.codex/ | ~/.gemini/ | ~/.cline/ | ~/.cursor/ |

### Harness-Specific Behaviors

**Claude**
- Logs: `~/.claude/projects/<hash>/` or check `claude --print-session-dir`
- Hooks: Supports pre/post hooks via config
- MCP: Native MCP client support
- Output: Structured with cost metrics

**Codex**
- Logs: `~/.codex/logs/`
- CWD: MUST set explicit `cwd` or commits to wrong repo
- Output: JSON metrics available with `--json-output`

**Gemini**
- Logs: `~/.gemini/sessions/`
- Timeout: Lower default (15 min)
- Output: Less structured, parse for cost

**Cline**
- Logs: VS Code extension logs
- Zombie handling: Spawns `cline-host` + `cline-core` as daemons
- Kill pattern: `pkill -f` with workspace path
- No streaming: Must poll for completion

**Cursor**
- Logs: IDE internal
- Timeout: Hard 10-min internal limit
- No streaming: Must poll for completion

---

## Abstraction Pattern

```typescript
interface AgentHarness {
  // Identity
  name: string
  command: string

  // Command building
  buildArgs(prompt: string, model?: string): string[]

  // Execution
  defaultTimeout: number
  supportsStreaming: boolean

  // Output parsing
  parseCost(output: string): number | undefined
  parseResult(output: string): ParsedResult

  // Cleanup
  killPattern?: string  // For zombie cleanup (Cline)

  // Logs
  getLogDir(): string
  getSessionLog(taskId: string): string | undefined
}
```

---

## Validation Checkpoints

Before marking a phase complete:

1. [ ] Code compiles without errors
2. [ ] Works with Claude harness
3. [ ] Works with Codex harness
4. [ ] Works with Gemini harness
5. [ ] Works with Cline harness (if applicable)
6. [ ] Works with Cursor harness (if applicable)
7. [ ] Unit tests pass (if any)
8. [ ] Integration test pass (if any)

---

## Open Questions

1. **Log aggregation**: Should we copy agent logs to central location or reference in-place?
2. **Streaming fallback**: For non-streaming harnesses, poll interval?
3. **Cost normalization**: Different harnesses report cost differently - normalize?
4. **Model mapping**: Map generic model names to harness-specific?

---

## Blocking Issues

(None currently)

---

## Completed Work Log

| Date | Phase | Agent | Summary |
|------|-------|-------|---------|
| 2026-01-31 | 0 | initial | Scaffold complete |
| 2026-01-31 | 1A | claude/opus | Database layer with all tables and CRUD |
| 2026-01-31 | 1B | claude/opus | Shared schemas (shepherd, system-agent, scheduler, api, events) |
| 2026-01-31 | 1C | claude/opus | SSE infrastructure with topics, heartbeat, client management |
| 2026-02-01 | 2C | claude/opus | Memory routes (global + repo-specific patterns/warnings) |
| 2026-02-01 | 2B | claude/opus | Signal routes (CRUD, respond, pending, expiration) |
| 2026-02-01 | 2D | claude/opus | Repo routes (CRUD, health, discover with language detection) |
| 2026-02-01 | 2E | claude/opus | System agent routes (runs, triggers, scheduler status) |
| 2026-02-01 | 2A | claude/opus | Task routes (extended: context, graph, cancel, dependency resolution) |
| 2026-02-01 | 2F | claude/opus | Notification routes (notify, align, inbox, status placeholders) |
| 2026-02-01 | 3A | claude/opus | CLI scaffold (entry point, client, output helpers) |
| 2026-02-01 | 4D | claude/opus | Genesis prompt (3 prompts: manual, auto, continuation) |
| 2026-02-01 | 4E | claude/opus | Armory prompt (exact port from v1) |
| 2026-02-01 | 4C | claude/opus | Shepherd prompt (exact port from v1) |
| 2026-02-01 | 4A | claude/opus | Discovery prompt (3 prompts: alignment, autonomous, task creator) |

