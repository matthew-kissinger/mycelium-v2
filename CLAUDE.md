# Mycelium v2 - Agent Orchestration

TypeScript rewrite of mycelium. Multi-agent CLI dispatch with visual node editor.

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Backend | Hono |
| Database | SQLite + Drizzle ORM |
| Frontend | React 19 + Vite |
| Node Editor | React Flow (@xyflow/react) |
| State | Zustand + TanStack Query |
| Styling | Tailwind v4 |
| Validation | Zod |

## Architecture: Dumb Pipes

Infrastructure collects data. Agents do thinking AND acting.

```
[CLI Dispatch]           <- Dumb pipe - spawn agent, stream output
       |
       v
[claude/codex/gemini]    <- SMART - agent does all reasoning
       |
       v
[Parse Output]           <- Dumb pipe - extract metrics, store result
```

**Key principle**: Agent-agnostic. Works with any CLI agent that accepts a prompt.

## Monorepo Structure

```
packages/
  shared/     # Zod schemas, TypeScript types
  server/     # Hono API, Drizzle DB, agent dispatch
  client/     # React Flow frontend
```

## Development

```bash
bun install             # Install all deps
bun run dev             # Run server + client
bun run dev:server      # Server only
bun run dev:client      # Client only
bun run db:generate     # Generate migrations
bun run db:migrate      # Run migrations
bun run db:studio       # Drizzle Studio
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/stats | Task statistics |
| GET | /api/events | SSE stream |
| GET | /api/tasks | List tasks |
| POST | /api/tasks | Create task |
| GET | /api/tasks/:id | Get task |
| PATCH | /api/tasks/:id | Update task |
| POST | /api/tasks/:id/run | Execute task |
| DELETE | /api/tasks/:id | Delete task |
| GET | /api/repos | List repos |
| POST | /api/repos | Add repo |

## Agent Dispatch

Spawns CLI agents via subprocess. Each agent type has its own CLI pattern:

```typescript
// Claude
claude -p "prompt" --model sonnet --dangerously-skip-permissions

// Codex
codex -q "prompt" --model gpt-5.2-codex --full-auto

// Gemini
gemini -p "prompt" --model gemini-3-flash-preview
```

Timeouts and streaming handled automatically. Output parsed for cost/metrics.

## Bun Notes

- Use `bun` instead of `node`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` to run scripts
- Bun automatically loads `.env`

## Conventions

- No emojis unless requested
- Conventional commits
- Agent-agnostic dispatch
- Type-safe with Zod schemas
- SSE for real-time updates (not WebSocket)
