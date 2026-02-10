# Mycelium v2 Progress

> All initial phases complete. System is operational.
> Full work log archived at `docs/archive/WORK_LOG.md`.

## Status Summary

**Core System**: Complete
- Backend API (85+ endpoints)
- Scheduler (11 cycles: dispatcher, discovery, shepherd, max_alignment, armory, digest, compaction, blocked_check, health_check, github_sync, registry_refresh)
- Agent dispatch (10 agents: Claude, Codex, Gemini, Cline, Cursor, Kiro, Vibe, Pi, OpenCode, Copilot)
- Provider support (12 providers: anthropic, openai, google, cursor, aws, github, openrouter, cline, mistral, groq, cerebras, opencode-zen)
- Dynamic registry (DB-backed agents/providers/models with auto-detection and API model fetching)
- Frontend (three-column layout, React Flow)
- CLI, MCP server
- GitHub integration (PRs, webhooks, security scanning, rulesets, merge queue)

**Recent Work** (2026-02-10):
- Major architectural refactor: Drizzle migrations, query domain split (11 files), agent adapters (10 files), registry unified (blocking init, no dual-path), execution pipeline (single task path)
- Max Alignment Agent: repo-level health audit system agent
  - Triggers after N shepherd evaluations per repo (default 2)
  - Runs claude/opus in repo working directory (not worktree) with write access
  - Runtime verification: build, tests, runtime checks, critical bug detection
  - Cleanup: deletes cruft files, prunes stale branches, rewrites CLAUDE.md
  - XML output parsing with pattern/warning extraction to memory
  - 5 new SSE events, Telegram notifications, API endpoints (`/api/max-alignment/trigger`, `/api/max-alignment/status`)
  - 16 new tests (323 total pass, 0 fail)

**Recent Work** (2026-02-09):
- Dynamic Agent/Provider Registry: replaced 440+ lines of hardcoded agent/provider/model data with DB-backed, self-healing registry
  - 3 new DB tables: `providers` (12 rows), `agents` (10 rows), `models` (80+ rows seeded, grows via API fetch)
  - Write-through in-memory cache (`registry-cache.ts`) with `isCacheReady()` guard for graceful degradation
  - CLI auto-detection (`detect.ts`): probes 10 CLIs via `which` + `--version` (5s timeout per agent)
  - Provider model fetching (`fetch-models.ts`): hits 7 provider APIs (OpenRouter, Anthropic, OpenAI, Groq, Cerebras, Mistral, Google)
  - Centralized credentials (`credentials.ts`): loads from `~/.config/mk-agent/` env file + individual key files + groq config
  - 14 new API endpoints under `/api/registry/` (agents, providers, models CRUD + detect/refresh/matrix/health/fallback/credentials)
  - 8 new CLI subcommands under `mycel registry` (agents, providers, models, detect, refresh, health, fallback)
  - Registry refresh scheduler cycle (6h interval)
  - Health state now DB-backed via `agent_stats` table (survives restarts)
  - All consumers (fallback, dispatch, dispatcher, context, config) read from cache with hardcoded fallback
  - 4 new SSE events: `registry:agent_detected`, `registry:provider_refreshed`, `registry:refreshed`, `registry:agent_status`
- Shepherd hardening: fixed 3 critical bugs (deferredTaskIds TDZ crash, worktree context ordering, unregistered process)
- Shepherd prompt: memory section, 12K char diff limit (was 2K), worktree paths, GitHub PR info, tool-use instructions
- Shared Task schema: added 11 fields (branch_name, worktree_path, spec_context, retry_context, github_pr_number, etc.)
- Type safety: removed all `(task as any)` casts in shepherd, dispatcher, routes/tasks
- E2E audit and hardening pass
- Startup safety: orphaned running tasks marked failed on server restart (prevents token burn)
- Unified task execution: manual `POST /api/tasks/:id/run` now gets full context enrichment matching dispatcher pipeline
- Merge endpoint: `POST /api/tasks/:id/merge` with GitHub PR merge and local git fallback
- Tests: 288 pass, 0 fail, 1 skip across 13 test files

**Recent Work** (2026-02-06):
- GitHub integration: client, PR, webhook, github-sync, shepherd PR workflow
- CI/CD pipeline: GitHub Actions workflow, Dependabot, CodeQL, security scanning
- Repository rulesets, merge queue support, self-hosted runner config
- Network hardening: dispatch timeout fix, MAX_PER_REPO atomic slots, cline pool wait queue
- Architecture: system.ts -> thin facade (1015->365 lines), SSE event standardization
- Database: 8 indexes, N+1 query fixes, SQL aggregation, proper pagination, schema migration
- Data integrity: dependency result injection, memory in task context, output markers parsed
- CLI parity: scheduler, trigger, config, logs/export, inventory commands (~55% coverage)
- Observability: worktree diffs, token tracking, 6 new SSE events, scheduler stats
- MIT license, security policy, gitignore hardening for open-source
- Tests: 284 pass, 0 fail, 1 skip across 12+ test files

**Recent Work** (2026-02-05):
- Agent health tracking with quota backoff (Gemini, Groq, Cerebras, Codex)
- Fallback chains with cross-agent retry (codex->cursor, pi->opencode, opencode->gemini, vibe->cline)
- Cline multi-instance pool (4 concurrent, per-instance gRPC)
- Agent-provider-model matrix (`agent-matrix.ts` as single source of truth)
- OpenRouter credit tracking, Cline billing provider selection

## Phase Status

| Category | Phases | Status |
|----------|--------|--------|
| Foundation | 0, 1A-C | Complete |
| API Routes | 2A-F | Complete |
| CLI | 3A-F | Complete |
| Prompts | 4A-E | Complete |
| Scheduler | 5A-B | Complete |
| Frontend | 6A-E | Complete |
| MCP | 7A-B | Complete |
| Integration | 8A-C | Complete |
| Config UI | Config-1 to 7 | Complete |
| Features | Feature-1 to 5 | Complete |
| Fixes | Fix-1 to 9 | Complete |
| Refactors | Refactor-0 to 7 | Complete |
| Canvas | Canvas-1 to 2 | Complete |
| Data | Data-1 to 8 | Complete |
| UI Polish | UI-1 to 3 | Complete |
| Agents | Expansion, Health, Fallback | Complete |
| Network | Fixes, Upgrades, GitHub | Complete |
| Open Source | License, Security Policy, CI/CD | Complete |
| Audit | E2E hardening, startup safety, unified execution | Complete |
| Registry | DB tables, cache, consumers, auto-detection, API, CLI | Complete |
| Refactor | Drizzle migrations, query split, adapters, pipeline, registry unified | Complete |
| Max Alignment | Cycle, prompt, parser, routes, tests | Complete |

## What's Next

Focus areas for continued development:
- Add global unhandled rejection handler to server startup
- Route-level integration tests (0 of 16 route files tested)
- Fix context.test.ts timeout (buildMcpSection takes 5s+)
- Pin dependency versions (all using `latest`)
- Agent success rate analytics (per-agent/model/task-type metrics)
- Registry UI panel (frontend for agent/provider/model management)
- Memory compaction tuning
- Cursor pagination for large task lists (replace LIMIT/OFFSET)
