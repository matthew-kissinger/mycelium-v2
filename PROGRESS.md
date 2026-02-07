# Mycelium v2 Progress

> All initial phases complete. System is operational.
> Full work log archived at `docs/archive/WORK_LOG.md`.

## Status Summary

**Core System**: Complete
- Backend API (70+ endpoints)
- Scheduler (8 cycles: dispatcher, discovery, shepherd, armory, digest, compaction, blocked_check, health_check)
- Agent dispatch (10 agents: Claude, Codex, Gemini, Cline, Cursor, Kiro, Vibe, Pi, OpenCode, Copilot)
- Provider support (12 providers: anthropic, openai, google, cursor, aws, github, openrouter, cline, mistral, groq, cerebras, opencode-zen)
- Frontend (three-column layout, React Flow)
- CLI, MCP server

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

## What's Next

Focus areas for continued development:
- Implement merge endpoint (currently placeholder - `routes/tasks.ts:684`)
- Add global unhandled rejection handler to server startup
- Route-level integration tests (0 of 16 route files tested)
- Fix context.test.ts timeout (buildMcpSection takes 5s+)
- Pin dependency versions (all using `latest`)
- Agent success rate analytics (per-agent/model/task-type metrics)
- Memory compaction tuning
- Cursor pagination for large task lists (replace LIMIT/OFFSET)
