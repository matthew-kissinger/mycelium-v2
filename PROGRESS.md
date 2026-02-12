# Mycelium v2 Progress

> All initial phases complete. System is operational.
> Full work log archived at `docs/archive/WORK_LOG.md`.

## Status Summary

**Core System**: Complete
- Backend API (100+ endpoints)
- Scheduler (11 cycles: dispatcher, discovery, shepherd, max_alignment, armory, digest, compaction, blocked_check, health_check, github_sync, registry_refresh)
- Agent dispatch (10 agents: Claude, Codex, Gemini, Cline, Cursor, Kiro, Vibe, Pi, OpenCode, Copilot)
- Provider support (12 providers: anthropic, openai, google, cursor, aws, github, openrouter, cline, mistral, groq, cerebras, opencode-zen)
- Dynamic registry (DB-backed agents/providers/models with auto-detection and API model fetching)
- Frontend (three-column layout, React Flow, Registry/GitHub/Max panels)
- CLI, MCP server
- GitHub integration (PRs, webhooks, security scanning, rulesets, merge queue)

**Recent Work** (2026-02-12):
- Skills & Armory Reorganization
  - Relocated skills from `~/.claude/skills/` to `~/.mycelium/skills/` (stops Claude Code auto-loading 86 skills in every session)
  - `getSkillsDir()` in platform/index.ts is now single source of truth for skills path
  - Fixed `listInstalledSkills()` dedup bug (was returning duplicates when skill existed both standalone and nested)
  - Fixed `listInstalledSkills()` to handle symlinks (matching inventory.ts behavior)
  - Removed 22 broken symlinks, 2 empty parent repos (claude-skills-threejs-ecs-ts, webgpu-claude-skill)
  - 62 skill entries remaining (was 86), 0 duplicate names
  - Armory prompt rewritten: installs skills to `~/.mycelium/skills/`, MCPs to canonical `~/.cursor/mcp.json`
  - Armory now documents how skills flow (TECH_SKILL_MAPPING -> auto-detect -> keyword select -> inject)
  - Armory now triggers `syncToAllAgents()` after MCP installation
  - New `suggested_mappings` field in Armory output for recommending new TECH_SKILL_MAPPING entries

- Unified MCP Server Pipeline: Canonical MCP registry + agent config sync + per-task MCP dispatch
  - `config/mcp-sync.ts`: Reads canonical config from `~/.cursor/mcp.json`, syncs to all 8 agent config files at startup
  - Per-agent write targets: Codex/Vibe (TOML), Cursor/Cline/Copilot/Kiro/Gemini/OpenCode (JSON)
  - Runtime MCP injection: Claude (`--mcp-config`), Copilot (`--additional-mcp-config`), Gemini (`--allowed-mcp-server-names`), Cursor (`--approve-mcps`)
  - `mcp_servers` field on tasks (schema, DB, CLI `--mcp-servers`), passed through pipeline to dispatch
  - `buildMcpInventorySection()` added to discovery context so it can specify `--mcp-servers` on task creation
  - Output parser extracts `mcp_servers` attribute from discovery XML
  - `writeTempMcpConfig()` creates per-invocation temp files, cleaned up after dispatch

- Agent Autonomy Audit: Verified all 10 agents run in unattended mode
  - Cursor adapter: added `--force` flag for auto-approving tool use (was missing)
  - Verified: Claude (`--dangerously-skip-permissions`), Codex (`--full-auto`), Gemini (`--yolo`), Cline (`--yolo --act`), Kiro (`--no-interactive --trust-all-tools`), Copilot (`--allow-all-tools --no-ask-user`), Vibe (`-p` auto-approve), Pi/OpenCode (no approval UX in headless)

- Tests: 383 pass, 1 skip, 0 fail, 0 regressions

- Structured Output Parsing (2026-02-11): Exact token/cost tracking from 7/10 agent CLIs
  - `ParsedUsage` interface + `parseUsage()` method on `AgentAdapter`
  - Claude: `--output-format json` flag, JSON envelope parser (tokens, cost, session_id, num_turns)
  - OpenCode: NDJSON `step_finish` parser (tokens, reasoning, cache, cost, session_id)
  - Pi: NDJSON `message_end` parser (tokens, cache, cost, session_id, model_used)
  - Gemini: JSON `stats.models` parser (tokens by category, latency, session_id, model_used)
  - Codex: JSONL `turn.completed` parser (tokens, cache, session_id)
  - Cline: NDJSON `api_req_finished` double-parse (tokens, cache, cost)
  - Copilot: stderr parser (premium requests, kilotoken approximations, API time)
  - dispatch.ts: `parseUsage()` wired in, replaces `estimateTokens()` when structured data available
  - `AgentExecuteResult` extended with cache_read/write_tokens, thinking_tokens, session_id, model_used, num_turns, api_duration_ms, premium_requests
  - Cost waterfall: parsed usage > OpenRouter balance diff > regex fallback
  - Agent data surface reference doc: `docs/cli/agent-data-surface.md`
- CLI Research Alignment: Fixed all 10 agent adapters against CLI research docs
  - Cline adapter rewritten for v2.2.0 (task new -> task, --mode act -> --act, --json output, instance pool removed)
  - Vibe, OpenCode, Pi adapters: centralized credentials, JSON structured output
  - OpenCode env var security: strips paid-provider keys for free-tier models
  - Claude, Cursor: --max-turns 50 safety cap
  - dispatch.ts: require() hack removed, max-turns default wired
  - Fallback chains completed for all 10 agents (was missing Pi, Copilot, Vibe, OpenCode, Kiro)
  - Health error patterns added: Cursor resource_exhausted, Kiro SSO expiry, Copilot premium tracking, Vibe credential errors
- Tests: 383 pass, 1 skip, 0 fail, 0 regressions

**Recent Work** (2026-02-12):
- Model Audit & Matrix Update: Verified all model IDs against live CLIs and provider APIs
  - agent-matrix.ts: Verified 108 models across 10 agents, 12 providers against live CLI outputs
  - Codex: Real models from models_cache.json (272K context, removed fake Cursor quality tiers)
  - Copilot: All 17 models from `--help`, 128K context (gpt-5.2-codex at 272K)
  - Gemini: 3.x only (removed all 2.5 models), default gemini-3-flash-preview
  - Cline/OpenRouter: Added GLM-5 (z-ai/glm-5, 744B MoE, released today), updated pricing from API
  - Groq: Reorganized models (gpt-oss-120b, qwen3-32b, llama-3.3-70b + K2 for compat)
  - Cerebras: Removed old GLM-4.7, kept gpt-oss-120b + qwen-3-235b
  - Cursor: Confirmed Composer 1.5, 33 models via `agent models`
  - Fallback chains: Updated all chains for correct model IDs, added Composer 1.5 to cursor chain
  - Context/seed-registry: Updated all stale model references (flash -> gemini-3-flash-preview, etc.)
  - Cline adapter: Added glm-5 alias, updated model map
- Model Audit Script: `scripts/model-audit.ts` - automated validation process
  - Collects from 9 CLI agents + OpenRouter API in parallel
  - Pi `--list-models` is richest source (364 models from 8 providers)
  - Cross-references against AGENT_MATRIX, reports discrepancies
  - Usage: `bun run scripts/model-audit.ts [--diff|--json|--agent X|--provider X]`
- Agent Performance Analytics: New query + context injection for discovery
  - `getAgentPerformanceStats()`: Success rate, avg cost/duration/tokens by agent+model
  - Injected into discovery's AGENTS_SECTION as performance table
  - Discovery can now route tasks to high-success-rate agent+model combos
- Frontend Integration: Registry, GitHub, and Max Alignment panels (39 files, 2400+ lines)
  - Registry Panel: Matrix view (4 tabs), status indicators, 14 API endpoints wired
  - GitHub Panel: PR lifecycle, security rulesets, repo management
  - Max Alignment Panel: Findings explorer, trigger controls, history
  - React Flow: 3 new node types (Registry, GitHub, MaxAlignment), connection store, custom edges
  - Architecture: Lazy loading, route-based panels, unified store pattern
- System Agents: XML output standardization (Armory, Digest, Compaction)
  - Replaced YAML prompts with XML for robust parsing
  - Telegram: Message splitting (4k limit), inline keyboards, improved formatting
  - Agent Matrix: Added Composer 1.5, GPT-5.3-Codex variants
- Dependency Management: Pinned all package.json versions (removed "latest")
- Documentation: Aligned all markdown docs (CLAUDE.md, README.md, etc.) with current architecture

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
| CLI Alignment | Adapter fixes, JSON output, fallback chains, health patterns, safety caps | Complete |
| Usage Parsing | ParsedUsage interface, 7 adapter parsers, dispatch wiring, 42 tests | Complete |
| MCP Pipeline | Canonical registry, agent config sync, per-task dispatch, discovery integration | Complete |
| Skills Reorg | Relocate to ~/.mycelium/skills/, dedup fix, armory alignment, suggested_mappings | Complete |
| Autonomy Audit | All 10 agents verified for unattended execution, Cursor --force fix | Complete |

## What's Next

Focus areas for continued development:
- Add global unhandled rejection handler to server startup
- Route-level integration tests (0 of 16 route files tested)
- Fix context.test.ts timeout (buildMcpSection takes 5s+)
- Agent success rate analytics (per-agent/model/task-type metrics)
- Memory compaction tuning
- Cursor pagination for large task lists (replace LIMIT/OFFSET)
