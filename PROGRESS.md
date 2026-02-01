# Mycelium v2 Progress Tracker

> Agents update this file when claiming/completing phases.
> This is the coordination mechanism for parallel work.

---

## Current Status

| Phase | Status | Agent | Notes |
|-------|--------|-------|-------|
| 0 | COMPLETE | initial | Scaffolding done |
| 1A | PENDING | - | Database layer |
| 1B | PENDING | - | Shared schemas |
| 1C | PENDING | - | SSE infrastructure |
| 2A-F | PENDING | - | API routes |
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

