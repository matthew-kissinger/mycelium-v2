# Mycelium v2

**Autonomous agent orchestration system** - coordinates multiple AI coding agents (Claude, Codex, Gemini, Cline, Cursor) to work on your codebase.

```
                    Discovery Agent
                          |
                    finds work in repos
                          |
                          v
    +--------------------------------------------------+
    |                  Task Queue                       |
    |  [pending] -> [sequenced] -> [running] -> [done] |
    +--------------------------------------------------+
                          |
              Dispatcher assigns to agents
                          |
        +---------+-------+-------+---------+
        |         |       |       |         |
        v         v       v       v         v
     Claude    Codex   Gemini   Cline   Cursor
        |         |       |       |         |
        +---------+-------+-------+---------+
                          |
                          v
                   Shepherd Agent
                   evaluates results
```

## Features

- **Multi-Agent Dispatch** - Route tasks to 11 agents (Claude, Codex, Gemini, Cline, Cursor, Kiro, Groq, Vibe, Pi, OpenCode, Copilot)
- **Automatic Discovery** - Agents scan repos for TODOs, lint errors, outdated deps, test failures
- **Dependency Chains** - Wire tasks with `--depends-on` for sequential execution
- **Parallel Execution** - Independent tasks run concurrently (configurable limit)
- **Health Tracking** - Monitors agent quotas, auto-backs off when limits hit
- **Cost Tracking** - Per-task cost tracking for pay-per-use agents
- **Fallback Chains** - Automatic retry with different models on failure
- **Real-time Streaming** - SSE streaming of agent output to frontend
- **Telegram Integration** - Notifications, alignment signals, remote control

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- SQLite3
- At least one agent CLI installed:
  - `claude` - [Claude Code](https://claude.ai/code)
  - `codex` - [OpenAI Codex](https://github.com/openai/codex)
  - `gemini` - [Gemini CLI](https://github.com/google/gemini-cli)
  - `cline` - [Cline](https://github.com/cline/cline)
  - `agent` - [Cursor Agent](https://cursor.com)
  - `kiro-cli` - [Kiro CLI](https://kiro.dev) (AWS)
  - `vibe` - [Mistral Vibe](https://mistral.ai)
  - `pi` - [Pi Coding Agent](https://github.com/badlogic/pi-mono)
  - `opencode` - [OpenCode](https://github.com/sst/opencode)
  - `copilot` - [GitHub Copilot CLI](https://github.com/features/copilot)

### Installation

```bash
# Clone and install
git clone https://github.com/yourusername/mycelium-v2.git
cd mycelium-v2
bun install

# Copy environment config
cp .env.example .env.local

# Build all packages
bun run build

# Start development server
bun run dev
```

### Configuration

Edit `.env.local`:

```bash
# Server
PORT=8765
HOST=0.0.0.0

# Auto-start scheduler on boot
SCHEDULER_AUTO_START=true

# Telegram (optional)
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
```

## Architecture

### Monorepo Structure

```
packages/
  shared/     # Zod schemas, types, constants
  server/     # Hono API + scheduler + agent dispatch
  client/     # React 19 + React Flow frontend
  cli/        # mycel CLI tool
  mcp/        # MCP server for agent integration
```

### Scheduler Cycles

| Cycle | Interval | Purpose |
|-------|----------|---------|
| Dispatcher | 60s | Run tasks with resolved deps |
| Discovery | 15min | Scan repos, create tasks with deps |
| Shepherd | 15min | Evaluate completed tasks, merge/reject |
| Digest | 4h | Smart status summaries (Haiku agent) |
| Compaction | 4h | Semantic memory cleanup (Haiku agent) |
| Health Check | 60s | Monitor device connectivity |
| Blocked Check | 15min | Detect stuck/orphaned tasks |

### Task Flow

```
1. Discovery creates tasks (with --depends-on for dependencies)
2. Dispatcher runs tasks when deps resolve
3. On success: Telegram notification
4. On failure: Retry with fallback model, or cancel dependents
5. Shepherd evaluates results per repo
```

## CLI Usage

### Task Management

```bash
# Create a task
mycel task create "Fix auth bug" \
  --repo /path/to/project \
  --agent claude \
  --model sonnet \
  --prompt "Fix the authentication bug in login.ts..."

# Create with dependencies
mycel task create "Add tests" \
  --repo /path/to/project \
  --agent codex \
  --depends-on abc123 def456

# For Cline, specify billing provider
mycel task create "Implement feature" \
  --repo /path/to/project \
  --agent cline \
  --model kimi-k2.5 \
  --provider openrouter

# List tasks
mycel tasks
mycel tasks --status pending
mycel tasks --repo /path/to/project

# Task operations
mycel task info <id>
mycel task run <id>
mycel task cancel <id>
mycel task delete <id>
```

### Repository Management

```bash
# Add repos to network
mycel repos add /path/to/project
mycel repos add /path/to/project --description "My project"

# List and discover
mycel repos
mycel repos discover ~/code

# Trigger discovery
mycel discover /path/to/project --agent --auto
```

### Alignment (Human-in-the-Loop)

```bash
# Ask for human input (async via Telegram)
mycel align "Should I refactor this?" --options "Yes" "No" "Skip"

# Check responses
mycel signals
mycel check

# Send notifications
mycel notify "Task completed successfully"
```

### System Control

```bash
# Scheduler
mycel runner start
mycel runner stop
mycel runner status

# Stats
mycel stats
mycel repos health
```

## Agent Configuration

### Supported Agents

| Agent | Command | Billing | Best For |
|-------|---------|---------|----------|
| Claude | `claude` | Subscription | Architecture, complex debugging |
| Codex | `codex` | Per-use | Code generation, mechanical refactors |
| Gemini | `gemini` | Free tier + paid | Fast iteration, general tasks |
| Cline | `cline` | OpenRouter/Cline | Strong reasoning, multi-file work |
| Cursor | `agent` | Subscription | Multi-file composition |
| Kiro | `kiro-cli` | Subscription (AWS) | AWS integration, enterprise |
| Groq | API | Free | Ultra-fast inference |
| Vibe | `vibe` | Per-use (Mistral) | Mistral models |
| Pi | `pi` | Per-use | Multi-provider flexibility |
| OpenCode | `opencode` | Free | Free models (kimi, glm, gpt-5-nano) |
| Copilot | `copilot` | Subscription | GitHub integration |

### Cline Provider Selection

Cline supports two billing providers:

```bash
# Use OpenRouter credits
mycel task create "..." --agent cline --provider openrouter

# Use Cline account credits
mycel task create "..." --agent cline --provider cline
```

### Fallback Chains

When a task fails, Mycelium can retry with a more capable model:

```
Claude:  haiku -> sonnet -> opus
Gemini:  flash -> pro
Cline:   glm-4.7-flash -> glm-4.7 -> deepseek-v3.2 -> qwen3-coder -> kimi-k2.5
```

Quota errors skip retry (account-wide limit, not model-specific).

## API Endpoints

### Tasks
```
GET    /api/tasks              List tasks
POST   /api/tasks              Create task
GET    /api/tasks/:id          Get task
PATCH  /api/tasks/:id          Update task
DELETE /api/tasks/:id          Delete task
POST   /api/tasks/:id/run      Execute task
POST   /api/tasks/:id/cancel   Cancel running task
GET    /api/tasks/:id/logs     Get task output
GET    /api/tasks/graph        Get dependency graph
```

### Scheduler
```
GET    /api/scheduler/status   Scheduler status
POST   /api/scheduler/start    Start scheduler
POST   /api/scheduler/stop     Stop scheduler
GET    /api/health             Health check with agent status
```

### Real-time
```
GET    /api/events             SSE stream for live updates
```

## Frontend

The React frontend provides:

- **Three-column layout**: Sidebar | Canvas | Detail Panel
- **React Flow canvas**: Visual task/cycle graph
- **Live task output**: Streaming logs via SSE
- **Config editors**: Scheduler, agents, prompts

Access at `http://localhost:5765` when running `bun run dev:client`.

## NixOS Integration

For NixOS users, a home-manager module is provided:

```nix
# In home.nix
services.mycelium = {
  enable = true;
  server.enable = true;
  scheduler.enable = true;  # Auto-starts scheduler
};
```

See `nix/README.md` for full documentation.

## Development

```bash
# Run all (backend + frontend)
bun run dev

# Backend only (port 8765)
bun run dev:server

# Frontend only (port 5765)
bun run dev:client

# Build
bun run build

# Tests
bun test
```

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Backend | Hono |
| Database | SQLite (bun:sqlite) + Drizzle ORM |
| Frontend | React 19 + Vite |
| Node Editor | React Flow (@xyflow/react) |
| State | Zustand + TanStack Query |
| Styling | Tailwind v4 |
| Validation | Zod |
| Real-time | Server-Sent Events (SSE) |

## License

MIT
