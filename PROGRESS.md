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
| 2A | COMPLETE | initial | Task routes (done in Phase 0) |
| 2B | COMPLETE | claude/opus | Signal routes |
| 2C | COMPLETE | claude/opus | Memory routes |
| 2D | COMPLETE | claude/opus | Repo routes |
| 2E | IN PROGRESS | claude/opus | System agent routes |
| 2F | IN PROGRESS | claude/opus | Notification routes |
| 3A-F | PENDING | - | CLI package |
| 4A-E | PENDING | - | System prompts |
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

