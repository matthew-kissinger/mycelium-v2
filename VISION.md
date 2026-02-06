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
- Multi-agent parallel execution
- Dependency chain management
- Cost tracking (per-use vs subscription)
- Health monitoring and quota backoff
- Real-time streaming to frontend

## Current Focus

- **Discovery loop optimization** - Better task quality, reduced noise
- **Agent success rates** - Fallback tuning, model selection
- **Memory utilization** - Patterns informing prompts

## Not Yet Built

- Agent performance benchmarking (success rates by agent/model/task-type)
- Automated testing of generated code
- Multi-user access control
