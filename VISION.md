# Mycelium Vision

## What It Is

Mycelium is an **autonomous agent orchestration system** that coordinates multiple AI coding agents to work on your codebase continuously.

Like the underground fungal networks that connect trees in a forest, Mycelium connects your repositories to a network of AI agents that discover work, execute tasks, and learn from results.

## Core Loop

```
     Discovery (claude/opus)
         |
    finds work in repos, wires deps
         |
         v
    +---------+
    |  Tasks  |  pending -----> running -----> done
    +---------+        \           |
         |           --depends-on  retry (fallback chain)
    Dispatcher assigns to agents
         |
    +----+----+----+----+----+----+----+----+----+----+
    |    |    |    |    |    |    |    |    |    |    |
 Claude Codex Gemini Cline Cursor Kiro Vibe Pi OpenCode Copilot
    |    |    |    |    |    |    |    |    |    |    |
    +----+----+----+----+----+----+----+----+----+----+
         |
    Shepherd evaluates results
         |
    Max Alignment audits repo health
         |
    Memory captures patterns
         |
         v
    (loop continues)
```

## Design Principles

1. **Agent-Agnostic Dispatch**
   - Any task can run on any agent
   - Discovery chooses agent based on task type
   - Fallback chains retry with different models

2. **Database as Coordination**
   - All state in SQLite
   - No distributed consensus needed
   - Cycles poll DB, act on what they find

3. **Human-in-the-Loop via Telegram**
   - Alignment signals for decisions
   - Notifications for completions
   - Remote control when needed

4. **Self-Improving Memory**
   - Patterns extracted from successes
   - Warnings from failures
   - Memory informs future prompts

## What's Working

- Autonomous discovery and task creation
- Multi-agent parallel execution with worktree isolation
- Dependency chain management with result injection into downstream prompts
- Cost tracking (per-use vs subscription)
- Health monitoring and quota backoff
- Real-time streaming to frontend
- GitHub integration (PR creation, webhooks, security scanning, rulesets, merge queue)
- Dynamic agent/provider registry (DB-backed, CLI auto-detection, provider API model fetching)
- Health state persistence (survives restarts via DB-backed agent_stats)
- Startup safety (orphaned tasks/worktrees cleaned, no token burn on restart)
- Unified execution pipeline (manual runs get same context enrichment as scheduler)
- Max Alignment agent (repo-level health audit, runtime verification, doc rewriting, cruft cleanup)
- Agent adapter architecture (10 per-agent adapters behind common interface)
- Query domain split (11 files under db/queries/)
- Drizzle migrations (replacing raw SQL initDb)
- Memory patterns and warnings injected into task context
- Registry UI panel (matrix view, status indicators, 14 API endpoints wired)
- Structured output parsing for 7/10 agents (exact tokens, cache stats, cost, session IDs - replaces character-count estimation)
- Max-turns safety cap on agents that support it (default 50)
- Complete fallback chains for all 10 agents (in-agent model escalation + cross-agent)

## Current Focus

- **Discovery loop optimization** - Better task quality, reduced noise
- **Agent success rates** - Fallback tuning, model selection
- **Memory utilization** - Patterns informing prompts
- **GitHub workflow** - PR-based merge, security automation

## Not Yet Built

- Agent performance benchmarking (success rates by agent/model/task-type)
- Automated testing of generated code
- Multi-user access control
- Cursor pagination for large task lists (replace LIMIT/OFFSET)
