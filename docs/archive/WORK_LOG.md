> **HISTORICAL** - This is the original work log from initial development. See PROGRESS.md for current status.

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
| 3B | COMPLETE | claude/opus | Task CLI commands |
| 3C | COMPLETE | claude/opus | Signal CLI commands |
| 3D | COMPLETE | claude/opus | Memory CLI commands |
| 3E | COMPLETE | claude/opus | Network (Repos) CLI commands |
| 3F | COMPLETE | claude/opus | Runner CLI commands |
| 4A | COMPLETE | claude/opus | Discovery prompt |
| 4B | COMPLETE | claude/opus | Sequencer prompt |
| 4C | COMPLETE | claude/opus | Shepherd prompt |
| 4D | COMPLETE | claude/opus | Genesis prompt |
| 4E | COMPLETE | claude/opus | Armory prompt |
| 5A-B | COMPLETE | claude/opus | Scheduler |
| 6A | COMPLETE | claude/opus | React Flow scaffold (Phase 0) |
| 6B | COMPLETE | claude/opus | Zustand workflow store |
| 6C | COMPLETE | claude/opus | LiveLogs component |
| 6D | COMPLETE | claude/opus | Task Panel Component |
| 6E | COMPLETE | claude/opus | Signal Panel Component |
| 7A-B | COMPLETE | claude/opus | MCP package |
| 8A | COMPLETE | claude/opus | End-to-end testing |
| 8B | COMPLETE | claude/opus | Telegram integration |
| 8C | COMPLETE | claude/opus | Build and publishing setup |
| Config-1 | COMPLETE | claude/opus | Scheduler Configuration UI |
| Config-2 | COMPLETE | claude/opus | Agent Configuration |
| Config-3 | COMPLETE | claude/opus | Prompt Management |
| Config-4 | COMPLETE | claude/opus | Alignment/Signals UI |
| Config-5 | COMPLETE | claude/opus | Memory Management UI |
| Config-6 | COMPLETE | claude/opus | Live Task Logs |
| Config-7 | COMPLETE | claude/opus | Task Pool UI Enhancements |
| Feature-1 | COMPLETE | claude/opus | Repos Management with Weighted Discovery |
| Feature-2 | COMPLETE | claude/opus | Armory Cycle & Inventory UI |
| Feature-3 | COMPLETE | claude/opus | Device Management (DB, API, CLI, health check cycle) |
| Feature-4 | COMPLETE | claude/opus | Platform Abstraction Layer (cross-platform paths, process mgmt) |
| Feature-5 | COMPLETE | claude/opus | NixOS Integration (flake.nix, home-manager module) |
| Fix-1 | COMPLETE | claude/opus | Shepherd batch eval fix (ASC ordering, evaluate all in one pass) |
| Fix-2 | COMPLETE | claude/opus | Fruiting session recording (dispatcher + all system agents) |
| Fix-3 | COMPLETE | claude/opus | Telegram notifications (dispatcher rich formatters, shepherd, digest) |
| Fix-4 | COMPLETE | claude/opus | Session log capture (full stdout/stderr, 24h TTL, all 5 agents) |
| Fix-5 | COMPLETE | claude/opus | Live system agent tracking (SSE output, active runs, per-repo shepherd) |
| Fix-6 | COMPLETE | claude/opus | Process registry wiring (dispatcher passes taskId to dispatch, removed pgrep heuristic) |
| Fix-7 | COMPLETE | claude/opus | Blocked check cancels pending tasks with failed/cancelled dependencies |
| Infra-1 | COMPLETE | claude/opus | Dev script commands (build-restart, scheduler, check) + test infrastructure |
| Fix-8 | COMPLETE | claude/opus | Per-agent MCP injection (buildMcpSection filters by dispatched agent, not union of all) |
| Fix-9 | COMPLETE | claude/opus | Zombie process detection (isProcessAlive checks /proc status for State: Z) |
| Refactor-0 | COMPLETE | claude/opus | Fix Cline dispatch args (task new subcommand) |
| Refactor-1 | COMPLETE | claude/opus | Dead code removal (~1930 lines, 10 files) |
| Refactor-2 | COMPLETE | claude/opus | Shared client types module |
| Refactor-3 | COMPLETE | claude/opus | Store splitting (system.ts -> 12 domain stores) |
| Refactor-4 | COMPLETE | claude/opus | Panel extraction (Panel.tsx 3717 -> 267 lines, 10 panel components) |
| Refactor-5 | COMPLETE | claude/opus | Three-column layout (sidebar, canvas, right panel) |
| Refactor-6 | COMPLETE | claude/opus | Task creation UI, toast system, URL routing |
| Refactor-7 | COMPLETE | claude/opus | Cost tracking model (billing_type, per-use vs subscription) |
| Canvas-1 | COMPLETE | claude/opus | Ring layout, sidebar groups, task pipeline sub-states, edge animations |
| Canvas-2 | COMPLETE | claude/opus | Compact nodes, hidden support nodes, reduced edges |
| Data-1 | COMPLETE | claude/opus | next_run timer computation in scheduler, cancelled count in stats |
| Data-2 | COMPLETE | claude/opus | Shepherd per-repo unevaluated breakdown in sidebar |
| Data-3 | COMPLETE | claude/opus | DB-first config storage (scheduler, agents, genesis, hooks) |
| Data-4 | COMPLETE | claude/opus | DB-first prompt overrides with file fallback |
| Data-5 | COMPLETE | claude/opus | Config history API endpoint |
| Data-6 | COMPLETE | claude/opus | Prompt preview + variable resolution endpoints |
| Data-7 | COMPLETE | claude/opus | PromptsPanel template variable inspection UI |
| Data-8 | COMPLETE | claude/opus | Memory per-repo breakdown in sidebar |
| UI-1 | COMPLETE | claude/opus | UI gap analysis + credits wiring + health display + context/sessions tabs |
| UI-2 | COMPLETE | claude/opus | React Flow edge warnings, SSE sidebar refresh, mobile responsive layout |
| UI-3 | COMPLETE | claude/opus | Shepherd N/5 threshold display, code splitting (471KB main), agent stats visualization, Playwright mobile tests |

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

### Phase 3C: Signal CLI Commands
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T06:30:00Z
**Completed**: 2026-02-01T06:45:00Z
**Validation**:
- TypeScript compiles without errors (signals.ts file)
- `bun run packages/cli/src/index.ts align "Test?" --options "Yes" "No"` creates signal
- `bun run packages/cli/src/index.ts signals` lists all signals
- `bun run packages/cli/src/index.ts signals --pending` lists pending only
- `bun run packages/cli/src/index.ts check --once` shows pending signals
- `bun run packages/cli/src/index.ts notify "Test"` sends notification
- `bun run packages/cli/src/index.ts inbox` shows inbox
- `bun run packages/cli/src/index.ts status` shows Telegram connection status

**Files Created**:
- `packages/cli/src/commands/signals.ts` - Signal and notification CLI commands

**Files Modified**:
- `packages/cli/src/index.ts` - Import and register signal commands

**Notes**:
- `align`: Create alignment signal with options, optional wait/timeout, repo/task association
- `signals`: List signals with --pending and --limit filters, table output
- `check`: Check pending signals, --once for single check or poll every 5s
- `notify`: Send notification message
- `inbox`: View user messages with --limit
- `status`: Check Telegram connection status
- All commands handle API errors gracefully
- Output uses table format with short IDs, truncation, and relative times

### Phase 3D: Memory CLI Commands
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T06:00:00Z
**Completed**: 2026-02-01T06:30:00Z
**Validation**:
- `bun run packages/cli/src/index.ts memory` - displays global memory (patterns and warnings)
- `bun run packages/cli/src/index.ts memory add "Test pattern"` - adds pattern
- `bun run packages/cli/src/index.ts memory add "Test warning" --type warning --severity high` - adds warning
- `bun run packages/cli/src/index.ts memory --repo /path` - displays repo-specific memory
- `bun run packages/cli/src/index.ts compact` - triggers memory compaction

**Files Created**:
- `packages/cli/src/commands/memory.ts` - Memory command module

**Notes**:
- `memory` command lists patterns and warnings (global or repo-specific with --repo)
- `memory add` subcommand adds patterns (default) or warnings (--type warning)
- Pattern options: --tags for tagging, --task for task association
- Warning options: --severity (low/medium/high), --task for task association
- `compact` is a top-level command (not subcommand of memory)
- All commands support --repo for repo-specific memory

### Phase 3E: Network (Repos) CLI Commands
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T06:00:00Z
**Completed**: 2026-02-01T06:30:00Z
**Validation**:
- TypeScript compiles without errors in repos.ts
- `mycel repos` lists all repos in table format
- `mycel repos health` shows health scores
- `mycel repos discover <path>` finds git repos
- `mycel repos add/remove/describe` work correctly
- `mycel repos paths` subcommands work

**Files Created**:
- `packages/cli/src/commands/repos.ts` - Complete repos CLI commands

**Notes**:
- registerRepoCommands registers all repo subcommands
- Default action lists repos with name, path, mode, language, description
- Health command shows per-repo health scores and overall network health
- Discover scans directories for git repos (1 level deep)
- Paths subcommand manages scheduler scan_paths config
- Add supports --auto-create and --description options
- Describe shows or sets repository description

### Phase 3F: Runner CLI Commands
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T08:00:00Z
**Completed**: 2026-02-01T08:30:00Z
**Validation**:
- TypeScript compiles without errors (bun run tsc --noEmit in packages/cli)
- `mycel runner` shows runner status with formatted cycles table
- `mycel runner start` shows "not yet implemented" (placeholder for Phase 5)
- `mycel runner stop` shows "not yet implemented" (placeholder for Phase 5)
- `mycel runner config` shows current config (empty until Phase 5)
- `mycel runner config --interval 300` shows requested changes
- `mycel runner config --allocate myrepo 75` shows allocation message
- `mycel config show` shows formatted configuration
- `mycel config set <key> <value>` shows requested changes

**Files Created**:
- `packages/cli/src/commands/runner.ts` - Runner and config commands

**Notes**:
- Runner command shows status with cycles table (name, enabled, running, last run, errors)
- Config command shows formatted scheduler configuration grouped by section
- All update operations gracefully handle missing API endpoints (Phase 5)
- Start/stop commands ready for scheduler integration
- Duration formatting (seconds to human-readable)
- Relative time formatting for last_run timestamps
- registerRunnerCommands registers both runner and config commands

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

### Phase 4C: Shepherd Prompt
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T04:00:00Z
**Completed**: 2026-02-01T04:15:00Z
**Validation**:
- TypeScript compiles without errors (no shepherd-specific errors)
- Prompt text matches v1 shepherd.py exactly (lines 139-335, 843-885)
- All prompts ported: SHEPHERD_SYSTEM_PROMPT, SHEPHERD_CONTINUATION_PROMPT
- YAML output schema documented
- Helper functions for context building included

**Files Created**:
- `packages/server/src/prompts/shepherd.ts` - Complete Shepherd agent prompt port

**Notes**:
- SHEPHERD_SYSTEM_PROMPT: Main prompt with {MYCEL_CONTEXT} placeholder for injection
- SHEPHERD_OUTPUT_SCHEMA: Expected YAML output format (human_report, branch_evaluations, global_patterns, global_warnings, agent_feedback)
- SHEPHERD_CONTINUATION_PROMPT: Human response handling after alignment questions
- ShepherdTaskContext, ShepherdSignalContext, ShepherdMemoryContext interfaces for type-safe context
- buildShepherdContext function assembles repo memory, tasks, and signals
- buildShepherdPrompt function injects mycel context and shepherd context
- buildContinuationPrompt function for signal response handling
- Memory system documentation: patterns -> .mycel/memory.json, warnings -> same
- Decision criteria: MERGE/REJECT/DEFER with specific guidelines
- Pattern extraction guidelines with good/bad examples
- Playwright MCP screenshot instructions included
- Tasks without branches handling documented
- Critical output requirements: YAML block mandatory

### Phase 6B: Zustand Workflow Store
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T12:00:00Z
**Completed**: 2026-02-01T12:30:00Z
**Validation**:
- TypeScript compiles without errors (bun run tsc --noEmit for stores/)
- Store can be used in components
- SSE connection management with reconnection logic

**Files Created**:
- `packages/client/src/stores/workflow.ts` - Complete workflow store implementation
- `packages/client/src/stores/index.ts` - Store exports

**Notes**:
- Entity state: tasks (array), repos (Map), signals (Map)
- React Flow integration: nodes, edges with task-to-node conversion
- SSE connection: connect(), disconnect(), handleEvent() with exponential backoff reconnection
- Task actions: setTasks, addTask, updateTask, removeTask, selectTask, setTaskFilter
- Repo actions: setRepos, updateRepo, removeRepo
- Signal actions: setSignals, updateSignal, removeSignal
- Layout: autoLayout() with dagre-like topological sort, syncNodesFromTasks()
- Selectors: getFilteredTasks, getTaskById, getStatusCounts, getPendingTasks, getRunningTasks, getPendingSignals
- SSE events handled: task:*, signal:*, repo:*, system:heartbeat
- ConnectionStatus tracking: connected, clientId, reconnectAttempts, lastConnected, lastError
- TaskNodeData and AgentNodeData interfaces with Record<string, unknown> extension for React Flow compatibility
- Edge generation from task dependencies with animation for running tasks

### Phase 6D: Task Panel Component
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T11:00:00Z
**Completed**: 2026-02-01T11:30:00Z
**Validation**:
- TypeScript compiles without errors (TaskPanel.tsx)
- Task list with status filtering (all, pending, running, done, failed)
- Task detail view with full metadata display
- Create task form with repo dropdown and agent selection
- Run, cancel, and delete actions with mutations
- SSE subscription for real-time updates

**Files Created**:
- `packages/client/src/components/TaskPanel.tsx` - Complete task panel component

**Files Modified**:
- `packages/client/src/stores/workflow.ts` - Extended with task state management

**Notes**:
- Uses TanStack Query for data fetching with 10s polling fallback
- SSE subscription to task:* events for real-time updates (created, updated, started, completed, failed, cancelled, deleted)
- TaskListItem component shows status indicator, title, agent, and repo
- TaskDetail component shows full metadata: ID, timestamps, duration, cost, dependencies
- TaskCreateForm modal with title, repo dropdown, agent select, model input, prompt textarea
- Mutations for run/cancel/delete with error handling
- Status colors: pending=gray, running=blue (pulsing), done=green, failed=red, cancelled=yellow
- formatRelativeTime and formatDuration helper functions
- Syncs task data to Zustand workflow store for cross-component access
- Dark theme styling consistent with existing components

### Phase 6E: Signal Panel Component
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T10:00:00Z
**Completed**: 2026-02-01T10:30:00Z
**Validation**:
- TypeScript compiles without errors (SignalPanel.tsx)
- Component displays signals (pending and all)
- Quick response buttons for options
- Custom response input modal
- SSE subscription for real-time updates

**Files Created**:
- `packages/client/src/components/SignalPanel.tsx` - Complete signal panel component

**Notes**:
- Uses TanStack Query for data fetching with 10s polling fallback
- SSE subscription to signal:* events for real-time updates
- SignalItem component shows status badges, options, response history
- SignalResponseModal with option buttons and custom input
- Mutation handles response submission with error display
- formatRelativeTime helper for timestamps
- Dark theme styling matching existing components
- Status colors: pending=yellow, responded=green, expired=gray

### Phase 5A-B: Scheduler Implementation
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T10:00:00Z
**Completed**: 2026-02-01T11:00:00Z
**Validation**:
- TypeScript compiles without errors (bun run tsc --noEmit)
- Server starts without errors
- GET /api/scheduler/status returns all cycle states
- GET /api/scheduler/config returns configuration
- POST /api/scheduler/start starts the scheduler
- POST /api/scheduler/stop stops the scheduler

**Files Created**:
- `packages/server/src/scheduler/index.ts` - Main scheduler module
- `packages/server/src/scheduler/config.ts` - Config loading/saving
- `packages/server/src/scheduler/cycles/dispatcher.ts` - Task dispatch cycle
- `packages/server/src/scheduler/cycles/discovery.ts` - Discovery agent cycle
- `packages/server/src/scheduler/cycles/sequencer.ts` - Sequencer agent cycle
- `packages/server/src/scheduler/cycles/shepherd.ts` - Shepherd evaluation cycle
- `packages/server/src/scheduler/cycles/blocked.ts` - Blocked task detection
- `packages/server/src/scheduler/cycles/digest.ts` - Status summary cycle
- `packages/server/src/scheduler/cycles/compaction.ts` - Memory cleanup cycle

**Files Modified**:
- `packages/server/src/routes/system-agents.ts` - Added scheduler routes
- `packages/server/src/prompts/index.ts` - Fixed duplicate export conflicts

**Notes**:
- Scheduler manages 7 cycles: dispatcher, discovery, sequencer, shepherd, blocked_check, digest, compaction
- Config stored in ~/.config/mycelium-v2/scheduler.json
- Default config: dispatcher every 60s, discovery/sequencer every 15min, digest every 6h
- Compaction runs weekly on Monday at 11am
- Dispatcher uses soft cap concurrency with dynamic scaling (3-10 concurrent tasks)
- Shepherd triggered when 5+ unevaluated tasks per repo
- Blocked check detects stale tasks (35min), needs_attention (3h), orphaned (4h auto-cancel)
- All cycles broadcast SSE events for real-time updates
- System agent runs tracked in database

### Phase 7A-B: MCP Package
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-01-31T20:45:00Z
**Completed**: 2026-01-31T21:00:00Z
**Validation**:
- TypeScript compiles without errors (bun run tsc --noEmit)
- `bun install` succeeds
- JSON-RPC tools/list returns all 14 tools
- MCP server starts on stdio transport

**Files Created**:
- `packages/mcp/package.json` - Package config with @modelcontextprotocol/sdk
- `packages/mcp/tsconfig.json` - TypeScript config extending root
- `packages/mcp/src/index.ts` - MCP server entry point
- `packages/mcp/src/tools/index.ts` - Tool definitions and handlers

**Tools Implemented**:
1. `mycel_stats` - Get task statistics
2. `mycel_tasks` - List tasks with filtering
3. `mycel_task_create` - Create new task
4. `mycel_task_run` - Run pending task
5. `mycel_task_info` - Get task details
6. `mycel_repos` - List network repos
7. `mycel_repos_health` - Get repo health scores
8. `mycel_notify` - Send Telegram notification
9. `mycel_align` - Create alignment signal
10. `mycel_memory` - Get memory patterns/warnings
11. `mycel_memory_add` - Add pattern or warning
12. `mycel_genesis` - Create new repository
13. `mycel_sequence` - Run Sequencer agent
14. `mycel_signals` - List alignment signals

**Notes**:
- Uses @modelcontextprotocol/sdk for MCP protocol
- StdioServerTransport for Claude Code integration
- MYCEL_API_URL env var for custom backend URL
- All tools return JSON-formatted results
- Error handling wraps all API calls

### Phase 8A: End-to-End Testing
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T02:00:00Z
**Completed**: 2026-02-01T02:15:00Z
**Validation**:
- Server starts and health endpoint responds
- Task lifecycle: create, list, get, update, delete all working
- Task context and graph endpoints functional
- Discovery, Sequencer, Shepherd triggers working
- System agent runs tracked in database
- Signal flow: create, respond, list working
- Memory system: patterns, warnings, compact working
- Scheduler start/stop working with all 7 cycles
- SSE events broadcasting correctly
- CLI commands: stats, tasks, repos, memory, signals, runner all working
- Frontend renders with proper stats from API

**Issues Found and Fixed**:
1. **Task API response format mismatch**: CLI expected `{ tasks: Task[], total: number }` but API returned bare array. Fixed by wrapping response in task routes.
2. **Single task response format**: CLI expected `{ task: Task }` but API returned bare task object. Fixed by wrapping GET/POST/PATCH responses.
3. **Duration display bug**: Task info showed "Duration: nulls" for null values. Fixed conditional check.
4. **TypeScript type annotations**: Fixed useQuery return type annotations in client components for proper type inference.

**Files Modified**:
- `packages/server/src/routes/tasks.ts` - Fixed response format to match CLI expectations
- `packages/cli/src/commands/tasks.ts` - Fixed duration null check
- `packages/client/src/App.tsx` - Fixed Stats query type
- `packages/client/src/components/Sidebar.tsx` - Fixed Repo query type
- `packages/client/src/components/LiveLogs.tsx` - Fixed event handler types
- `packages/client/src/components/SignalPanel.tsx` - Fixed Signal query type
- `packages/client/src/components/TaskPanel.tsx` - Fixed Task query type

**Test Results**:
- All 7 test workflows passed
- Server health: OK
- Task CRUD: OK
- System agents: OK
- Signals: OK
- Memory: OK
- SSE: OK
- CLI: OK
- Frontend: OK (loads, displays stats, repo list)

### Phase 8C: Build and Publishing Setup
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-01-31T21:00:00Z
**Completed**: 2026-01-31T21:10:00Z
**Validation**:
- `bun run clean` removes all dist directories
- `bun run build` builds all packages in order (shared -> server -> cli -> mcp -> client)
- `bun run typecheck` runs TypeScript type checking
- CLI binary works: `./packages/cli/dist/index.js --version` outputs 0.1.0
- MCP binary works: responds to JSON-RPC tools/list with all 14 tools
- All dist directories created with correct outputs

**Files Modified**:
- `package.json` - Added build scripts (build:*, clean, typecheck), ordered build chain
- `packages/shared/package.json` - Added build script, prepublishOnly, files array, dist exports
- `packages/server/package.json` - Updated version, added start script
- `packages/cli/package.json` - Added minify flag, prepublishOnly, files array
- `packages/mcp/package.json` - Added prepublishOnly, files array
- `packages/shared/tsconfig.json` - Standalone config with declaration, declarationMap, outDir
- `packages/shared/src/types/index.ts` - Added Stats type alias for client compatibility

**Files Created**:
- `.github/workflows/ci.yml` - GitHub Actions CI workflow (bun install, typecheck, build)
- `packages/client/src/vite-env.d.ts` - Vite type declarations for CSS imports

**Build Outputs**:
| Package | Output | Size |
|---------|--------|------|
| @mycelium/shared | dist/ (js + d.ts) | ~1 KB |
| @mycelium/server | dist/index.js | 0.87 MB |
| @mycelium/cli | dist/index.js (minified) | 65 KB |
| @mycelium/mcp | dist/index.js | 0.48 MB |
| @mycelium/client | dist/ (HTML + assets) | 420 KB JS, 42 KB CSS |

**Notes**:
- Build order enforced: shared must build first (provides types for other packages)
- Shared package uses tsc for declaration generation, others use bun build
- CLI and MCP use --target bun for optimal runtime
- CLI uses --minify for smaller bundle size
- Client uses vite build with tsc -b for type checking
- CI workflow runs on push/PR to master branch

### Configuration Phase 7: Task Pool UI Enhancements
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-02-01T04:30:00Z
**Completed**: 2026-02-01T05:00:00Z
**Validation**:
- TypeScript compiles without errors (bun run build passes)
- TaskPoolPanel displays stats grid with clickable status filters
- List view shows all tasks with status, repo, agent, time, cost indicators
- Task detail view shows full metadata, dependencies, prompt, result/error
- Run, Cancel, Clone, Delete, Retry, View Logs actions work correctly
- Dependencies tab shows task graph with "Needs X tasks" / "Blocks X tasks"
- Refresh button updates both list and graph views
- Tested with Playwright browser automation

**Files Modified**:
- `packages/client/src/stores/system.ts` - Added Task, TaskFilters, TaskGraph types; task management actions
- `packages/client/src/components/Panel.tsx` - Expanded TaskPoolPanel with full task list, detail view, actions

**Features Implemented**:
1. **Stats Grid**: Clickable status buttons (Pending/Running/Done/Failed) that filter the list
2. **Tabs**: Switch between List view and Dependencies view
3. **Task List View**:
   - Displays all tasks with title, repo, status, agent, time, cost
   - Shows dependency count indicator
   - Click to open task detail view
4. **Task Detail View**:
   - Full task information (agent, model, cost, duration, repo, timestamps)
   - Dependencies list with short IDs
   - Prompt content display
   - Result/error display with expandable output
   - Action buttons based on status:
     - Pending: Run Task
     - Running: Cancel, View Logs
     - Done/Failed/Cancelled: Clone, Delete, Retry (for failed)
5. **Dependencies View**:
   - Shows tasks with dependencies
   - Indicates "Needs X tasks" and "Blocks X tasks"
   - Shows sequencing status

**Store Actions Added**:
- `fetchTasks(filters?)` - List tasks with status/repo/agent filters
- `setTaskFilters(filters)` - Update filter state
- `fetchTask(id)` - Get single task details
- `runTask(id, options?)` - Execute a pending task
- `cancelTask(id)` - Cancel a running task
- `deleteTask(id)` - Remove a task
- `cloneTask(id)` - Duplicate a task
- `retryTask(id)` - Clone and run a failed task
- `fetchTaskGraph(filters?)` - Get dependency graph data
- `clearSelectedTask()` - Clear selected task state

### Phase 8B: Telegram Integration
**Status**: COMPLETE
**Agent**: claude/opus
**Started**: 2026-01-31T22:00:00Z
**Completed**: 2026-01-31T22:30:00Z
**Validation**:
- TypeScript compiles without errors (bun run tsc --noEmit in packages/server)
- Server starts with Telegram polling when configured (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
- Server starts without errors when Telegram is not configured
- GET /api/status returns connection status
- POST /api/notify sends messages via Telegram
- POST /api/align sends signals via Telegram with inline keyboard buttons
- GET /api/inbox returns messages from Telegram inbox
- GET /api/inbox/:message_id/download downloads files from messages

**Files Created**:
- `packages/server/src/telegram/index.ts` - Main Telegram service with TelegramClient class
- `packages/server/src/telegram/polling.ts` - Update handler for messages, callbacks, commands
- `packages/server/src/telegram/messages.ts` - Message formatting helpers for tasks, signals, reports

**Files Modified**:
- `packages/server/src/routes/notify.ts` - Integrated Telegram for notify, align, inbox, status endpoints
- `packages/server/src/index.ts` - Added Telegram initialization and graceful shutdown

**Features**:
- TelegramService interface with send methods (message, photo, document, buttons)
- Long-polling for updates with automatic reconnection
- Callback query handling for inline keyboard button presses
- Command handling (/start, /ping, /status, /pending, /tasks)
- Signal response routing (button press or text reply)
- In-memory inbox for received messages
- File download from Telegram messages
- Message formatting with HTML parse mode
- Task update formatters (created, started, completed, failed)
- Discovery report, Shepherd report, and Digest summary formatters

**Configuration**:
- Environment variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
- Config file: ~/.config/mycelium-v2/telegram.json

### Fix-1: Shepherd Batch Evaluation Fix
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-03
**Validation**: Build passes, shepherd evaluates all unevaluated tasks in one pass

**Files Modified**:
- `packages/server/src/db/queries.ts` - Changed `getUnevaluatedTasks` ordering from DESC to ASC (oldest first), added `asc` import
- `packages/server/src/scheduler/cycles/shepherd.ts` - Two-phase query: check threshold with batchSize, then fetch up to 200 when threshold met

**Notes**:
- Previously limited to 5 tasks per cycle (batchSize), requiring 9 cycles to clear 41 tasks
- Now evaluates ALL unevaluated tasks in one Shepherd agent call once threshold is met
- ASC ordering ensures oldest tasks are processed first instead of newest

### Fix-2: Fruiting Session Recording
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-03
**Validation**: Build passes, fruiting sessions created for tasks and system agent runs

**Files Modified**:
- `packages/server/src/db/queries.ts` - Added `createFruitingSession()`, `getFruitingSessionsByTask()`, `FruitingSessionCreateInput` interface
- `packages/server/src/scheduler/cycles/dispatcher.ts` - Records fruiting session with context trace (prompt layer sizes) after task dispatch
- `packages/server/src/scheduler/cycles/discovery.ts` - Records fruiting session after discovery agent dispatch
- `packages/server/src/scheduler/cycles/sequencer.ts` - Records fruiting session after sequencer agent dispatch
- `packages/server/src/scheduler/cycles/shepherd.ts` - Records fruiting session after shepherd agent dispatch
- `packages/server/src/scheduler/cycles/armory.ts` - Records fruiting session after armory agent dispatch
- `packages/server/src/routes/tasks.ts` - Updated `GET /:id/sessions` to return actual fruiting_sessions from DB

**Notes**:
- Context trace includes prompt layer breakdown (basePrompt, mycelContext, agentsSection, etc.) with sizes
- Sessions route now returns parsed fruiting_sessions with session_log and context_trace JSON

### Fix-3: Telegram Notification Integration
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-03
**Validation**: Build passes, rich notifications sent for task completion/failure, shepherd reports, digest summaries

**Files Modified**:
- `packages/server/src/scheduler/cycles/dispatcher.ts` - Replaced inline `notifyTaskComplete`/`notifyTaskFailed` with `formatTaskCompleted`/`formatTaskFailed` from telegram/messages.ts; removed duplicate `escapeHtml`, `formatDuration`, `repoName` helpers
- `packages/server/src/scheduler/cycles/shepherd.ts` - Added Telegram notification after evaluation using `formatShepherdReport`
- `packages/server/src/scheduler/cycles/digest.ts` - Replaced TODO/console.log with actual Telegram send using `formatDigestSummary`
- `packages/server/src/telegram/messages.ts` - Added agent/model line to `formatTaskCompleted` and `formatTaskFailed`

**Notes**:
- Dispatcher now uses rich formatters that include task ID, agent/model, duration, cost
- Shepherd sends evaluation reports with health, headline, concerns, wins, merge/reject/defer counts
- Digest sends periodic summaries with task counts, costs, active repos, pending signals

### Fix-4: Session Log Capture
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-03
**Validation**: Build passes, tested with all 5 agent types (claude, codex, gemini, cline, cursor), stderr captured

**Files Created**:
- `packages/server/drizzle/0002_session_logs.sql` - Migration adding session_log column

**Files Modified**:
- `packages/server/src/db/schema.ts` - Added `session_log` text column to `fruiting_sessions` table
- `packages/server/src/db/queries.ts` - Added `cleanExpiredSessionLogs()` for 24h TTL cleanup; `createFruitingSession` accepts `session_log` field
- `packages/server/src/logs/buffer.ts` - Added `getTaskLogEntries()` to expose raw log entries for DB persistence
- `packages/server/src/logs/index.ts` - Re-exported `getTaskLogEntries`
- `packages/server/src/scheduler/cycles/dispatcher.ts` - Grabs log buffer entries and persists to fruiting session on task completion (success or failure)
- `packages/server/src/scheduler/cycles/discovery.ts` - Added `onOutput` session log collection and fruiting session recording
- `packages/server/src/scheduler/cycles/sequencer.ts` - Added `onOutput` session log collection and fruiting session recording
- `packages/server/src/scheduler/cycles/shepherd.ts` - Added `onOutput` session log collection and fruiting session recording
- `packages/server/src/scheduler/cycles/armory.ts` - Added session log collection to existing `onOutput` and fruiting session recording
- `packages/server/src/scheduler/cycles/compaction.ts` - Added `cleanExpiredSessionLogs()` call before weekly gate (runs every compaction interval, hourly)

**Notes**:
- Session logs stored as JSON array of `{chunk, stream, timestamp}` entries in `session_log` column
- No max size limit - full agent stdout and stderr captured
- 24h TTL: `cleanExpiredSessionLogs()` nullifies session_log data older than 24h but keeps the session record
- TTL cleanup runs every compaction cycle (hourly), independent of the weekly memory compaction gate
- Dispatch `onOutput` callback captures both stdout and stderr via stream parameter
- All 5 agent types use the same dispatch path, so all produce session logs

### Fix-5: Live System Agent Tracking
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, active runs tracked during shepherd execution, SSE output events wired

**Files Created**:
- `packages/server/src/scheduler/active-runs.ts` - Active run registry (separated to avoid circular imports)

**Files Modified**:
- `packages/shared/src/schemas/events.ts` - Added `agent:output` SSE event type and `AgentOutputEvent` schema
- `packages/shared/src/schemas/scheduler.ts` - Added `ActiveRunInfo` schema, `active_runs` field to `SchedulerStatus`
- `packages/server/src/scheduler/index.ts` - Re-exports active run functions, per-repo shepherd concurrency in `triggerShepherdForRepo`
- `packages/server/src/scheduler/cycles/shepherd.ts` - Register/unregister active runs, broadcast `agent:output` SSE, skip repos already being evaluated
- `packages/server/src/scheduler/cycles/discovery.ts` - Register/unregister active runs, broadcast `agent:output` SSE
- `packages/server/src/scheduler/cycles/sequencer.ts` - Register/unregister active runs, broadcast `agent:output` SSE
- `packages/server/src/scheduler/cycles/armory.ts` - Register/unregister active runs, broadcast `agent:output` SSE
- `packages/server/src/routes/system-agents.ts` - Added `GET /api/system-agents/active` endpoint

**Features**:
1. **SSE output streaming for system agents**: All 4 agent-dispatched cycles (shepherd, discovery, sequencer, armory) broadcast `agent:output` events with run_id, agent_type, chunk, and stream. Clients subscribe to `agent:*` or `agent:<run_id>`.
2. **Active run tracking**: In-memory registry tracks which system agents are currently running, with run_id, agent_type, repo_path, and started_at. Visible via `GET /api/system-agents/active` and `GET /api/scheduler/status` (active_runs field). Runs are registered on start and unregistered in `finally` blocks.
3. **Per-repo shepherd concurrency**: Shepherd runs no longer use the global cycle lock. Multiple repos can be evaluated simultaneously. Same repo won't run twice (checked via `isShepherdRunningForRepo`). Triggered shepherds skip repos already being evaluated.

### Fix-6: Process Registry Wiring
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, dispatched tasks now register in in-memory process registry

**Files Modified**:
- `packages/server/src/scheduler/cycles/dispatcher.ts` - Added `taskId` field to `dispatch()` call
- `packages/server/src/scheduler/cycles/blocked.ts` - Removed `isAgentProcessRunning` pgrep/proc heuristic (50 lines), updated header comment

**Root Cause**:
- `dispatch()` already had registry wiring (`registerProcess`/`unregisterProcess` calls gated by `if (taskId)`)
- The dispatcher never passed `taskId` in the options, so the registry was always empty for task agents
- Blocked check fell back to pgrep heuristic which couldn't distinguish between tasks in the same repo
- One missing field caused the entire process tracking system to be dead code

**Notes**:
- Registry is now authoritative for process tracking
- Stored PID in `spec_context` remains as post-restart fallback (registry is in-memory, lost on restart)
- pgrep/proc heuristic removed entirely - was unreliable on NixOS and couldn't distinguish tasks per repo

### Fix-7: Blocked Check Failed Dependency Cancellation
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, blocked check cancels tasks with failed/cancelled dependencies

**Files Modified**:
- `packages/server/src/scheduler/cycles/blocked.ts` - Added `cancelTasksWithFailedDeps()` and `cancelDependentsOfTask()` functions

**Notes**:
- Second pass after running-task scan queries pending tasks with `depends_on`
- For each dependency, checks if it's failed or cancelled via `getTask(depId)`
- Cancels task with descriptive error, broadcasts SSE event, sends Telegram notification
- `cancelDependentsOfTask()` recursively cascades cancellations downstream
- Catches tasks missed by dispatcher's `cancelDependents` (e.g. tasks created after dep failed)

### Fix-9: Zombie Process Detection
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes

**Files Modified**:
- `packages/server/src/scheduler/cycles/blocked.ts` - `isProcessAlive()` now checks `/proc/<pid>/status` for zombie state

**Root Cause**:
- `process.kill(pid, 0)` returns true for zombie processes since the PID still exists in the process table
- Zombie (`<defunct>`) processes have exited but haven't been reaped by their parent
- Blocked check was skipping zombie tasks thinking they were still alive
- e.g. Gemini task 9edc9114 ran as PID 370341, became zombie with zero log entries, blocked check kept skipping it

**Notes**:
- Reads `/proc/<pid>/status` and checks for `State: Z` (zombie)
- Falls back to signal 0 result on non-Linux (no /proc)
- Linux-specific but that's our target (NixOS)

### Refactor-0: Fix Cline Dispatch Args
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes

**Files Modified**:
- `packages/server/src/agents/dispatch.ts` - Changed Cline args from `[prompt, '--yolo', '--mode', 'act']` to `['task', 'new', prompt, '--yolo', '--mode', 'act']`

**Notes**:
- Top-level `cline` command does not support `--yolo` flag (caused 88% failure rate)
- `cline task new` subcommand supports `--yolo` and `--mode act`
- Enables future multi-step dispatch via `task send`

### Refactor-1: Dead Code Removal
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, ~1930 lines removed

**Files Deleted**:
- `packages/client/src/stores/workflow.ts` (762 lines)
- `packages/client/src/stores/index.ts` (7 lines)
- `packages/client/src/components/LiveLogs.tsx` (138 lines)
- `packages/client/src/components/Sidebar.tsx` (75 lines)
- `packages/client/src/components/TaskPanel.tsx` (644 lines)
- `packages/client/src/components/SignalPanel.tsx` (313 lines)
- `packages/client/src/nodes/AgentNode.tsx`, `TaskNode.tsx`, `RepoNode.tsx`, `SignalNode.tsx`

**Files Modified**:
- `packages/client/src/nodes/index.ts` - Removed legacy node registrations
- `packages/client/src/App.tsx` - Removed duplicate QueryClient, mushroom emoji
- `packages/client/src/nodes/CycleNode.tsx` - Replaced emojis with 3-letter monospace labels (DSC, SEQ, DIS, etc.)
- `packages/client/src/nodes/AlignmentNode.tsx`, `TaskPoolNode.tsx`, `MemoryNode.tsx`, `AgentSlotsNode.tsx` - Same emoji replacement
- `packages/client/src/components/Panel.tsx` - Replaced folder emojis with `[git]`/`[dir]` text

### Refactor-2: Shared Client Types Module
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04

**Files Created**:
- `packages/client/src/types/index.ts` - Re-exports from `@mycelium/shared` plus client-specific types (Stats, SchedulerStatus, AgentConfigData, GroupedMemory, PromptInfo, LogEntry, TaskLogs, Task, etc.)

### Refactor-3: Store Splitting
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, all panels load data correctly

**Files Created**:
- `packages/client/src/stores/api.ts` - Shared `fetchAPI<T>()` helper
- `packages/client/src/stores/uiStore.ts` - Panel state, sidebar collapsed, toast system with auto-dismiss
- `packages/client/src/stores/schedulerStore.ts` - Scheduler status, config, running system agents
- `packages/client/src/stores/taskStore.ts` - Tasks, logs, graph, filters, stats, running tasks, createTask
- `packages/client/src/stores/signalStore.ts` - Signals, pending count
- `packages/client/src/stores/memoryStore.ts` - Patterns, warnings, grouped memory
- `packages/client/src/stores/promptStore.ts` - Prompts, selected prompt
- `packages/client/src/stores/repoStore.ts` - Repos, browse
- `packages/client/src/stores/inventoryStore.ts` - Skills, MCPs
- `packages/client/src/stores/agentStore.ts` - Agent configurations
- `packages/client/src/stores/connectionStore.ts` - SSE EventSource management
- `packages/client/src/stores/flowStore.ts` - React Flow nodes/edges

**Files Modified**:
- `packages/client/src/stores/system.ts` - Rewritten as thin facade re-exporting domain stores

### Refactor-4: Panel Extraction
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, all panels work via imports

**Files Created**:
- `packages/client/src/panels/SchedulerPanel.tsx`
- `packages/client/src/panels/CyclePanel.tsx`
- `packages/client/src/panels/TaskPoolPanel.tsx`
- `packages/client/src/panels/AgentPanel.tsx`
- `packages/client/src/panels/AlignmentPanel.tsx`
- `packages/client/src/panels/MemoryPanel.tsx`
- `packages/client/src/panels/PromptsPanel.tsx`
- `packages/client/src/panels/LogsPanel.tsx`
- `packages/client/src/panels/ReposPanel.tsx`
- `packages/client/src/panels/InventoryPanel.tsx`
- `packages/client/src/panels/index.ts` - Barrel file
- `packages/client/src/panels/components/ConfigControls.tsx` - Shared ConfigInput, ConfigToggle
- `packages/client/src/lib/formatters.ts` - formatTimeAgo, formatDuration, formatCost, formatInterval
- `packages/client/src/lib/status.ts` - statusColor, statusBadge, truncate

**Files Modified**:
- `packages/client/src/components/Panel.tsx` - Rewritten from 3717 to 267 lines (imports from panels/)

### Refactor-5: Three-Column Layout
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes

**Files Created**:
- `packages/client/src/layout/AppLayout.tsx` - CSS flex: sidebar | canvas | detail panel
- `packages/client/src/layout/LeftSidebar.tsx` - Collapsible nav (240px/48px) with live data summaries
- `packages/client/src/layout/RightPanel.tsx` - 400px non-overlay panel using uiStore

**Files Modified**:
- `packages/client/src/App.tsx` - Uses AppLayout with LeftSidebar and RightPanel
- `packages/client/src/components/SystemView.tsx` - Removed Panel overlay rendering
- `packages/client/src/stores/system.ts` - openPanel/closePanel now delegate to uiStore

### Refactor-6: New Features
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes

**Files Created**:
- `packages/client/src/panels/task/TaskCreateForm.tsx` - Task creation form (title, repo, agent, model, prompt, timeout)
- `packages/client/src/components/ToastContainer.tsx` - Fixed bottom-right stacked toasts (auto-dismiss 5s info, manual dismiss errors)
- `packages/client/src/hooks/usePanelRouter.ts` - URL query param sync for panels (?panel=taskPool&taskId=abc)

**Files Modified**:
- `packages/client/src/panels/TaskPoolPanel.tsx` - Added "New Task" button and TaskCreateForm integration
- `packages/client/src/stores/taskStore.ts` - Toast notifications on run/cancel/delete/clone
- `packages/client/src/stores/schedulerStore.ts` - Toast notifications on start/stop
- `packages/client/src/stores/signalStore.ts` - Toast notifications on respond

### Refactor-7: Cost Tracking Model
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, 32/32 tests pass

**Files Modified**:
- `packages/shared/src/schemas/agent.ts` - Added `BillingType` enum (`per_use` | `subscription`) and `billing_type` field to `AgentConfig`; Cline = `per_use`, rest = `subscription`
- `packages/shared/src/schemas/api.ts` - Added `per_use_cost_usd` and `subscription_task_count` optional fields to `StatsResponse`
- `packages/shared/src/types/index.ts` - Re-exported `BillingType`
- `packages/server/src/agents/dispatch.ts` - Subscription agents get `cost_usd: 0`, per-use agents parse cost from output
- `packages/server/src/routes/stats.ts` - Calculates and returns per_use_cost_usd and subscription_task_count
- `packages/client/src/components/Header.tsx` - Shows "Cline: $X.XX" and "Sub: N tasks" when cost data available

### Fix-8: Per-Agent MCP Injection
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, dispatcher and discovery inject only the dispatched agent's MCPs

**Files Modified**:
- `packages/server/src/config/inventory.ts` - Added `getMcpServersForAgent(agent)` that queries only that agent's CLI/config
- `packages/server/src/prompts/context.ts` - `buildMcpSection(agent?)` accepts optional agent param, filters when provided
- `packages/server/src/scheduler/cycles/dispatcher.ts` - Passes task agent to `buildMcpSection(agent)`
- `packages/server/src/scheduler/cycles/discovery.ts` - Passes `'claude'` to `buildMcpSection('claude')`

**Root Cause**:
- `buildMcpSection()` aggregated MCPs from all 5 agent configs into one union list
- This list was injected into every agent's prompt regardless of which agent was running the task
- Non-Claude agents (cline, codex, etc.) were told they had MCPs they couldn't actually access
- e.g. Cline was told it had Playwright MCP (configured in Claude), tried to use it, and failed

**Notes**:
- `getMcpServersForAgent(agent)` switches on agent name, queries only that agent's source
- Claude/Codex/Gemini: queried via CLI (`<agent> mcp list`)
- Cursor/Cline: read from their config files
- `getMcpServers()` (union of all) kept for inventory display and armory cycle
- Each agent CLI spawns its own MCP server processes (STDIO) - they cannot be shared

### Infra-1: Dev Script + Test Infrastructure
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: `bun test` passes 32/32 tests, build clean

**Files Modified**:
- `scripts/dev.ts` - Added `build-restart`, `scheduler start|stop`, `check` commands
- `package.json` - Added `dev:manage` and `test` scripts

**Files Created**:
- `packages/server/src/agents/fallback.test.ts` - 32 unit tests for fallback module (bun:test)

**Notes**:
- `build-restart`: builds all packages, restarts servers only if build succeeds
- `scheduler start|stop`: hits POST /api/scheduler/start or /stop
- `check`: fetches /api/stats + /api/scheduler/status in parallel, prints tasks by status, cycle timings, active agents
- Test coverage: getFallbackModel, shouldRetry, buildRetryContext, parseRetryContext, resolveModel
- All pure functions, no DB/IO mocking needed

### Canvas-1: Ring Layout and Sidebar Overhaul
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, ring layout visible, sidebar grouped

**Files Modified/Created**:
- `packages/client/src/flow/architecture.ts` - Ring layout coordinates, feedback loop edge (Memory->Discovery)
- `packages/client/src/flow/types.ts` - health_check cycleType, task pipeline sub-state counts
- `packages/client/src/nodes/CycleNode.tsx` - Added health_check label/color
- `packages/client/src/nodes/TaskPoolNode.tsx` - Pipeline sub-state bars (unsequenced/waiting/ready)
- `packages/client/src/stores/flowStore.ts` - Edge animations when cycles running
- `packages/client/src/layout/LeftSidebar.tsx` - Grouped sections (Pipeline/Tasks/Support/Data)
- `packages/client/src/components/SystemView.tsx` - fitView padding, draggable nodes
- `packages/client/src/types/index.ts` - Stats sub-state fields
- `packages/server/src/routes/stats.ts` - Added unsequenced/waiting/ready/cancelled counts
- `packages/shared/src/schemas/api.ts` - Added optional fields to StatsResponse

### Data-1 through Data-2: Scheduler and Shepherd Data Wiring
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, next_run timers visible, shepherd per-repo breakdown works

**Files Modified**:
- `packages/server/src/scheduler/index.ts` - computeNextRun() function, sets next_run on cycle start and after runs
- `packages/client/src/stores/system.ts` - Added ShepherdStatus, fetchShepherdStatus(), added to refreshAll
- `packages/client/src/types/index.ts` - Added ShepherdStatus interface
- `packages/client/src/layout/LeftSidebar.tsx` - Removed AGENTS section, added shepherd per-repo sub-items

### Data-3 through Data-4: DB-First Config and Prompt Storage
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, 32/32 tests pass

**Files Created**:
- `packages/server/src/db/config-store.ts` - Core DB config store with getConfigOverride/saveConfigOverride, getPromptOverride/savePromptOverride, importFileConfig/importFilePrompt, getConfigHistory

**Files Modified**:
- `packages/server/src/db/schema.ts` - Added config_overrides, prompt_overrides, config_history tables
- `packages/server/src/index.ts` - Added CREATE TABLE statements for 3 new tables
- `packages/server/src/scheduler/config.ts` - Rewritten for DB-first (DB -> file import -> defaults)
- `packages/server/src/config/agents.ts` - Rewritten for DB-first with mergeAgentsConfig helper
- `packages/server/src/config/index.ts` - Genesis and hooks configs rewritten for DB-first
- `packages/server/src/config/prompts.ts` - Custom prompt load/save/delete now use DB with file fallback

**Notes**:
- One-time file import: if DB has no override but file exists, imports file content to DB
- All saves record history in config_history table (old_value, new_value, changed_by, changed_at)
- File paths kept for display/info only (getConfigPath functions)

### Data-5 through Data-8: API Endpoints and Frontend Updates
**Status**: COMPLETE
**Agent**: claude/opus
**Completed**: 2026-02-04
**Validation**: Build passes, 32/32 tests pass

**Files Modified**:
- `packages/server/src/routes/config.ts` - Added GET /api/config/history endpoint with key/limit/offset
- `packages/server/src/routes/prompts.ts` - Added GET /:id/variables (resolved values) and GET /:id/preview (full substitution)
- `packages/client/src/panels/PromptsPanel.tsx` - Template variable chips with expandable resolved values
- `packages/client/src/stores/system.ts` - fetchMemory now fetches /memory/all (grouped) for per-repo data
- `packages/client/src/layout/LeftSidebar.tsx` - Memory item shows per-repo sub-items with pattern/warning counts

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
| MCP config | `~/.claude.json` (JSON) | `~/.codex/config.toml` (TOML) | `~/.gemini/settings.json` (JSON) | VS Code globalStorage (JSON) | `~/.cursor/mcp.json` (JSON) |
| MCP query | `claude mcp list` | `codex mcp list` | `gemini mcp list` | File read | File read |
| MCP transport | stdio, HTTP, SSE | stdio, HTTP | stdio, SSE, HTTP | stdio, SSE | stdio, SSE, HTTP |

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

1. ~~**Log aggregation**: Should we copy agent logs to central location or reference in-place?~~ **RESOLVED**: Session logs stored in DB (fruiting_sessions.session_log) with 24h TTL
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
| 2026-02-01 | 3E | claude/opus | Network (Repos) CLI commands (list, add, remove, health, discover, describe, paths) |
| 2026-02-01 | 3D | claude/opus | Memory CLI commands (memory, memory add, compact) |
| 2026-02-01 | 3C | claude/opus | Signal CLI commands (align, signals, check, notify, inbox, status) |
| 2026-02-01 | 3F | claude/opus | Runner CLI commands (runner, runner start/stop/config, config show/set) |
| 2026-02-01 | 6E | claude/opus | Signal Panel Component (pending/responded signals, quick response, SSE updates) |
| 2026-01-31 | 6C | claude/opus | LiveLogs component (real-time task output, filter, auto-scroll, toggle) |
| 2026-01-31 | 7A-B | claude/opus | MCP package (14 tools: stats, tasks, repos, notify, align, memory, genesis, sequence, signals) |
| 2026-02-01 | 6D | claude/opus | Task Panel Component (task list, filters, detail view, create form, run/cancel/delete) |
| 2026-02-01 | 6B | claude/opus | Zustand workflow store (SSE, tasks, repos, signals, auto-layout) |
| 2026-02-01 | 5A-B | claude/opus | Scheduler implementation (7 cycles, config, API routes) |
| 2026-01-31 | 8C | claude/opus | Build and publishing setup (package.json, tsconfig, CI workflow) |
| 2026-01-31 | 8B | claude/opus | Telegram integration (service, polling, messages, routes) |
| 2026-02-01 | 8A | claude/opus | End-to-end testing (7 workflows, API fixes, type corrections) |
| 2026-02-01 | Config-1 | claude/opus | Scheduler Configuration UI (expand SchedulerPanel, intervals, toggles, save) |
| 2026-02-01 | Config-2 | claude/opus | Agent Configuration (agents.json, GET/PATCH routes, AgentPanel edit mode) |
| 2026-02-01 | Config-3 | claude/opus | Prompt Management (prompts.ts config, API routes, PromptsPanel with editor) |
| 2026-02-01 | Config-4 | claude/opus | Alignment/Signals UI (AlignmentPanel filters, response buttons, delete) |
| 2026-02-01 | Config-5 | claude/opus | Memory Management UI (MemoryPanel with delete endpoints, pattern/warning lists) |
| 2026-02-01 | Config-6 | claude/opus | Live Task Logs (in-memory buffer, task:output SSE, LiveLogViewer component) |
| 2026-02-01 | Config-7 | claude/opus | Task Pool UI (full task list, filters, detail view, actions, dependencies) |
| 2026-02-01 | Feature-1 | claude/opus | Repos Management with weighted discovery selection |
| 2026-02-01 | Feature-2 | claude/opus | Armory Cycle, Inventory API, and UI panels |
| 2026-02-03 | Fix-1 | claude/opus | Shepherd batch eval: ASC ordering, evaluate all unevaluated in one pass |
| 2026-02-03 | Fix-2 | claude/opus | Fruiting sessions: query functions + recording in dispatcher and all 4 system agent cycles |
| 2026-02-03 | Fix-3 | claude/opus | Telegram: dispatcher uses rich formatters, shepherd sends reports, digest sends summaries |
| 2026-02-03 | Fix-4 | claude/opus | Session logs: full agent output capture in DB, 24h TTL, hourly cleanup in compaction |
| 2026-02-04 | Fix-5 | claude/opus | Live agent tracking: SSE output streaming, active runs API, per-repo shepherd concurrency |
| 2026-02-04 | Fix-6 | claude/opus | Process registry: dispatcher passes taskId to dispatch(), removed pgrep/proc heuristic from blocked check |
| 2026-02-04 | Fix-7 | claude/opus | Blocked check: cancel pending tasks whose dependencies are failed/cancelled, recursive cascade |
| 2026-02-04 | Infra-1 | claude/opus | Dev script: build-restart, scheduler start/stop, check commands; bun:test infrastructure + fallback module tests |
| 2026-02-04 | Fix-8 | claude/opus | Per-agent MCP injection: buildMcpSection(agent) queries only that agent's config, prevents cross-agent MCP pollution |
| 2026-02-04 | Fix-9 | claude/opus | Zombie detection: isProcessAlive checks /proc/<pid>/status for State: Z, prevents blocked check from skipping dead processes |
| 2026-02-04 | Refactor-0 | claude/opus | Cline dispatch: changed args from `--yolo` (invalid for top-level) to `task new ... --yolo --mode act` |
| 2026-02-04 | Refactor-1 | claude/opus | Dead code: deleted workflow.ts, stores/index.ts, LiveLogs, Sidebar, TaskPanel, SignalPanel, 4 legacy nodes; replaced emojis with monospace labels |
| 2026-02-04 | Refactor-2 | claude/opus | Types: created packages/client/src/types/index.ts re-exporting shared + client-specific types |
| 2026-02-04 | Refactor-3 | claude/opus | Stores: split 1340-line system.ts into api, uiStore, schedulerStore, taskStore, signalStore, memoryStore, promptStore, repoStore, inventoryStore, agentStore, connectionStore, flowStore; system.ts kept as facade |
| 2026-02-04 | Refactor-4 | claude/opus | Panels: extracted 10 components from Panel.tsx (3717->267 lines) into panels/ dir; created lib/formatters.ts and lib/status.ts |
| 2026-02-04 | Refactor-5 | claude/opus | Layout: AppLayout (3-col), LeftSidebar (collapsible nav with live data), RightPanel (non-overlay); updated App.tsx and SystemView.tsx |
| 2026-02-04 | Refactor-6 | claude/opus | Features: TaskCreateForm (panels/task/), ToastContainer with auto-dismiss, usePanelRouter URL sync; toast notifications in taskStore, schedulerStore, signalStore |
| 2026-02-04 | Refactor-7 | claude/opus | Costs: billing_type field in AgentConfig (per_use for cline, subscription for rest); stats API returns per_use_cost_usd and subscription_task_count; Header shows split |
| 2026-02-04 | Canvas-1 | claude/opus | Ring layout for React Flow canvas (loop topology), sidebar grouped sections (Pipeline/Tasks/Support/Data), task pipeline sub-states (unsequenced/waiting/ready), edge animations |
| 2026-02-04 | Canvas-2 | claude/opus | Compact nodes with minimal height, support nodes hidden (armory/blocked/digest/compaction/health), reduced edges for cleaner graph |
| 2026-02-04 | Data-1 | claude/opus | computeNextRun() in scheduler index.ts sets next_run on cycle start and after runs; cancelled count added to stats API |
| 2026-02-04 | Data-2 | claude/opus | Sidebar shepherd item shows per-repo sub-items with unevaluated/batch_size counts; repos at threshold in amber |
| 2026-02-04 | Data-3 | claude/opus | DB-first config: config_overrides table, config-store.ts module, scheduler/agents/genesis/hooks loaders rewritten for DB->file->defaults; one-time file import; saves to DB with history |
| 2026-02-04 | Data-4 | claude/opus | Prompt overrides in prompt_overrides table; prompts.ts loadCustomPrompt reads DB first, falls back to .md files with import; save/delete go to DB |
| 2026-02-04 | Data-5 | claude/opus | GET /api/config/history endpoint with key/limit/offset query params; returns config_history rows (audit trail of all config and prompt changes) |
| 2026-02-04 | Data-6 | claude/opus | GET /api/prompts/:id/variables returns resolved template variable values with char lengths; GET /api/prompts/:id/preview returns full prompt with variables substituted |
| 2026-02-04 | Data-7 | claude/opus | PromptsPanel shows template variables as clickable chips; clicking expands resolved value in scrollable pane; fetches from /api/prompts/:id/variables |
| 2026-02-04 | Data-8 | claude/opus | fetchMemory now fetches /memory/all (grouped); sidebar Memory item shows per-repo sub-items with pattern/warning counts; warnings highlighted |
| 2026-02-04 | UI-1 | claude/opus | UI gap analysis: wired buildAgentsSectionWithCredits to dispatcher/discovery; AgentPanel shows health/credits with auto-refresh; TaskPoolPanel added provider, Context tab (JSON view), Sessions tab (context layers); Playwright verified all features working |
| 2026-02-04 | UI-2 | claude/opus | React Flow edge warnings: removed armory from edgeMap (node hidden); SSE sidebar: added repo/memory/shepherd/inventory event listeners in connectionStore; Mobile layout: responsive classes in AppLayout/RightPanel/Header, hamburger menu, sidebar overlay |
| 2026-02-04 | UI-3 | claude/opus | Shepherd threshold: "N/5" progress display in sidebar; Code splitting: React.lazy() for panels (471KB main, ~88KB split); Agent stats: success rate bars with color coding in AgentPanel; Playwright: 19 responsive layout tests for mobile/tablet/desktop; Sidebar default: collapsed on load for better mobile UX |

