> **HISTORICAL** - Plan from 2026-02-06. Most phases have been implemented. See PROGRESS.md for current state.

# GitHub Network Integration Plan

Deep research completed 2026-02-06. 5 research agents, 59 repos analyzed, full API/ecosystem audit.

---

## The Big Picture

GitHub is not just a code host - it's a parallel network with its own data layer, event system, CI/CD compute, identity management, security scanning, project tracking, and now AI agent infrastructure (Copilot). Mycelium currently treats GitHub as a dumb git remote. The integration plan turns GitHub into a **first-class network peer** - not replacing mycelium's local intelligence, but extending its reach.

### What Mycelium Has That GitHub Doesn't
- Local agent orchestration (10 CLI agents, dispatch, fallback chains)
- Real-time scheduler with 8 cycles
- Telegram human-in-the-loop alignment
- Cross-repo task dependencies
- Agent health tracking and quota management
- Cost tracking per task
- Memory patterns and warnings

### What GitHub Has That Mycelium Doesn't
- Public-facing code review (PRs with inline annotations)
- CI/CD compute (2000 free min/month + unlimited on public repos)
- Security scanning (Dependabot, secret scanning, CodeQL)
- Project boards with cross-repo views
- Deployment environments with protection rules
- 40+ webhook event types for reactive automation
- Bot identity system (GitHub Apps)
- Copilot with 15 models and built-in GitHub MCP tools
- 5000 API calls/hour, GraphQL batch queries
- Release management with auto-generated notes
- 50 unread notifications (data stream you're not consuming)

### What They Create Together
- **Audited agent work**: Agents work locally (fast) -> results reviewed on GitHub (visible, gateable)
- **Security-first agent execution**: Secret scanning catches agent credential leaks before they land
- **Cross-network observability**: GitHub Actions CI validates agent work; mycelium tracks costs/health
- **Two-way task flow**: GitHub Issues -> mycelium tasks -> agent execution -> PR -> CI -> merge
- **Network dashboard on GitHub**: Projects V2 board shows all 59 repos' agent activity in one view
- **Copilot as GitHub-native agent**: Can use GitHub MCP tools during tasks (create issues, read PRs, check CI)

---

## Current State

| Dimension | Status |
|-----------|--------|
| **Repos** | 59 total (17 public, 42 private). All local repos synced to GitHub |
| **mycelium-v2** | Private repo on GitHub, in sync, CI workflow exists (failing - typecheck errors from unpushed local changes) |
| **Auth** | OAuth (`gho_*`) with `repo`, `read:org`, `gist` scopes. Fine-grained PAT (`github_pat_*`) expires Feb 18 |
| **Copilot** | CLI v0.0.405, subscription active, 15 tasks completed, 39 sessions, built-in GitHub MCP server |
| **gh CLI** | v2.63.2 (latest is v2.86.0 - has native `gh copilot`) |
| **Actions** | 5 repos with workflows. Asteroid-Miner deploy failing. terror-in-the-jungle perf checks failing. mycelium-v2 CI all 8 runs failed |
| **Pages** | 5 live sites (Asteroid-Miner, terror, Space-Laser, sds/sheepdogsim.com, the-nightman-cometh) |
| **Security** | Dependabot DISABLED everywhere. Secret scanning only on Asteroid-Miner. No CodeQL |
| **Issues/PRs** | 1 open issue, 2 open PRs (zoo-mcp), 0 agent-created PRs. All agents push directly to main |
| **Projects** | None created |
| **Notifications** | 50 unread (all CI failure alerts) |

---

## Integration Architecture

```
                     GitHub (cloud network)
                            |
         +------------------+------------------+
         |          |           |          |
     Webhooks    REST API    GraphQL    Actions CI
         |          |           |          |
         v          v           v          v
    Cloudflare   gh CLI /    Batch     Self-hosted
    Tunnel       fetch()    queries    runner (NixOS)
         |          |           |          |
         +----------+-----------+----------+
                            |
                    Mycelium Server
                    (Hono on :8765)
                            |
         +------------------+------------------+
         |          |           |          |
    Dispatcher  Shepherd    Discovery   GitHub Sync
    (push branch)(create PR) (issue sync)(notifications)
         |          |           |          |
         v          v           v          v
    10 CLI      PR review    Task <->    Telegram
    Agents      + checks     Issue       bridge
```

### Data Flow (Integrated)

```
Discovery scans repo
  -> Creates mycelium task + GitHub Issue (linked)
  -> Updates Projects V2 board item

Dispatcher runs task
  -> Agent works in git worktree (local, fast)
  -> Output parsed, tokens tracked
  -> Branch pushed to GitHub
  -> Commit status set: "mycelium/agent: in-progress"

Shepherd evaluates
  -> Creates PR from agent branch
  -> Sets commit status: "mycelium/shepherd: healthy"
  -> Check run with inline code annotations (requires App)
  -> GitHub Actions CI triggers on PR
  -> If CI green + shepherd approved -> auto-merge PR
  -> Updates linked Issue (close on merge)
  -> Updates Projects V2 board item status

GitHub -> Mycelium (events)
  -> CI failure: update agent health, notify Telegram
  -> Dependabot alert: create fix task
  -> Secret scanning alert: emergency Telegram + task
  -> PR merged: update task status, cleanup worktree
  -> New issue (manual): discovery considers it
```

---

## Overlap Analysis

### Where GitHub Could Replace Mycelium Components

| Mycelium Component | GitHub Equivalent | Verdict |
|-------------------|-------------------|---------|
| SQLite task DB | GitHub Issues | **Keep both**. SQLite for speed/local ops, Issues for visibility. Sync bidirectionally |
| SSE event stream | GitHub webhook events | **Keep both**. SSE for frontend, webhooks for GitHub -> mycelium |
| Alignment signals | GitHub Discussions polls | **Keep Telegram**. More immediate, mobile-friendly. Discussions for long-lived decisions only |
| Scheduler stats | GitHub Actions usage metrics | **Keep local**. GitHub metrics are delayed and coarse |
| Agent health tracking | GitHub commit statuses | **Keep both**. Local for real-time, statuses for public visibility |

### Where GitHub Adds New Capabilities

| Capability | What It Enables | Effort |
|-----------|-----------------|--------|
| **PR-based agent workflow** | Audit trail, CI gates, human review, visible history | Medium |
| **Checks API annotations** | Shepherd findings appear inline on code diffs | Medium (requires GitHub App) |
| **Dependabot + secret scanning** | Agents can't accidentally ship vulnerabilities or secrets | Zero (settings toggle) |
| **Projects V2 board** | Cross-repo network dashboard on GitHub | Medium |
| **Self-hosted runner** | Run CI on your NixOS box (unlimited minutes, GPU access) | Low |
| **Copilot MCP tools** | Copilot can create issues, read PRs, check CI during tasks | Low (config only) |
| **Gists for session logs** | Shareable debug artifacts from agent runs | Low |
| **Release automation** | Semantic versioning from agent PRs | Low |
| **Branch protection** | Enforce shepherd approval before merge to main | Low |
| **GitHub notifications -> Telegram** | Bridge CI failures, security alerts to your existing channel | Medium |
| **GraphQL batch dashboard** | Single API call = all 59 repos' status | Low |

### Where Combining Creates New Behavior

1. **Security loop**: Agent pushes code -> secret scanning catches leaked key -> webhook fires -> mycelium creates emergency task -> different agent rotates the credential -> PR created -> CI validates -> merge. Fully automated security response.

2. **Quality ratchet**: Agent creates PR -> CI runs tests + typecheck + CodeQL -> only merges if all pass -> shepherd tracks which agents produce CI-passing code -> health scores improve agent routing. GitHub becomes the quality gate.

3. **GitHub Issues as discovery input**: Someone files an issue on Asteroid-Miner -> webhook arrives -> discovery cycle considers it alongside repo analysis -> creates a task -> agent fixes it -> PR references the issue -> auto-closes on merge. Community-driven task creation.

4. **Copilot as GitHub-aware agent**: When dispatching to Copilot, enable `--enable-all-github-mcp-tools`. Copilot can then read other PRs, check CI status, look at issues, and read code from GitHub directly during task execution. It becomes a GitHub-native agent that understands the broader context.

5. **Projects V2 as network command center**: A single project board showing all tasks across all 59 repos, with custom fields for agent, model, cost, duration, health. Filterable, sortable, roadmap view. GitHub's UI is already built for this.

---

## Implementation Phases

### Phase 0: Quick Wins (no code changes)

1. **Push mycelium-v2 to GitHub** (fixes CI - local changes include deleted polling.ts that CI still checks)
2. **Upgrade gh CLI** to v2.86.0 (`nix profile install nixpkgs#gh` or download binary)
3. **Add OAuth scopes**: `gh auth refresh -h github.com -s admin:repo_hook -s workflow -s user -s project` (opens browser)
4. **Enable Dependabot** on all repos via GitHub settings (web UI or API)
5. **Enable secret scanning** on all repos (especially important with agents pushing code)
6. **Clear 50 notifications**: `gh api -X PUT /notifications -f last_read_at="2026-02-06T00:00:00Z"`
7. **Fix Asteroid-Miner deploy**: The Deploy step fails (build succeeds). Likely permissions issue with gh-pages branch

### Phase 1: Outbound Integration (mycelium -> GitHub)

**No webhooks needed. Works with existing auth.**

| Task | Files to Modify | What It Does |
|------|----------------|--------------|
| Push agent branches to GitHub after task completion | `dispatcher.ts`, `workspace.ts` | `git push origin mycel/task-{id}` after agent finishes |
| Shepherd creates PRs instead of direct merge | `shepherd.ts` | `gh pr create --head mycel/task-{id} --title "mycel: {title}" --body "{evaluation}"` |
| Set commit statuses on agent branches | `shepherd.ts` | `gh api repos/{owner}/{repo}/statuses/{sha}` with mycelium/shepherd context |
| Sync tasks to GitHub Issues | `routes/tasks.ts` or new `github/sync.ts` | When task created for a GitHub repo, also create Issue with `[Mycelium]` prefix |
| Branch protection on active repos | One-time API setup | Require `mycelium/shepherd` status before merge to main |
| Enable Copilot GitHub MCP tools | `dispatch.ts` | Add `--enable-all-github-mcp-tools` to Copilot dispatch args |

### Phase 2: Inbound Integration (GitHub -> mycelium)

**Requires webhook receiver. Cloudflare Tunnel recommended (free).**

| Task | Files to Create/Modify | What It Does |
|------|----------------------|--------------|
| Set up Cloudflare Tunnel | NixOS config / cloudflared | Expose `localhost:8765` as `mycelium.yourdomain.com` |
| Webhook receiver route | New: `routes/github-webhook.ts` | `POST /api/github/webhook` with HMAC signature verification |
| Handle push events | `github-webhook.ts` | Update task status when agent branch is pushed |
| Handle PR events | `github-webhook.ts` | On merge: update task, cleanup worktree. On close: mark rejected |
| Handle workflow_run events | `github-webhook.ts` | CI failure -> update agent health, notify Telegram |
| Handle security alerts | `github-webhook.ts` | Dependabot/secret scanning -> create emergency tasks |
| GitHub notification bridge | New scheduler cycle: `github-sync` (5 min) | Poll notifications, forward urgent ones to Telegram |
| New SSE events | `events.ts`, `connectionStore.ts` | `github:push`, `github:pr_opened`, `github:pr_merged`, `github:ci_failed`, `github:alert` |

### Phase 3: GitHub App + Advanced Features

**Unlocks Checks API, bot identity, automatic webhook delivery.**

| Task | What It Does |
|------|--------------|
| Create "Mycelium" GitHub App | Register at github.com/settings/apps. Permissions: contents:rw, PRs:rw, issues:rw, checks:rw, statuses:rw |
| JWT authentication module | New: `github/app-auth.ts`. Generate JWT from private key, exchange for installation token |
| Check runs with annotations | Shepherd evaluation creates check run with inline code annotations on PR diffs |
| Bot identity | Agent actions appear as `mycelium[bot]` instead of `matthew-kissinger` |
| Auto webhook delivery | App receives events for all installed repos (no per-repo webhook setup) |
| Projects V2 network board | New scheduler cycle syncs task status to project board items. Custom fields: agent, cost, health |
| Release automation | After shepherd approves batch of changes, create release with auto-generated notes |
| GitHub-sourced discovery | New issues trigger discovery analysis. Issues become task creation input |

### Phase 4: Network Growth

| Task | What It Does |
|------|--------------|
| Self-hosted Actions runner | Run CI on your NixOS box. Unlimited minutes, access to local tools, GPU. Label: `mycelium-hub` |
| Copilot MCP config | Create `~/.copilot/mcp-config.json` pointing to mycelium's own MCP server. Copilot gets access to mycelium API |
| Copilot custom agent | Create a mycelium-aware Copilot agent via `copilot init` that understands the network |
| Cross-repo task graph | GitHub Projects V2 roadmap view showing task dependencies across repos |
| Static report Pages | Digest cycle generates HTML reports, deployed to GitHub Pages |
| Gist-based session logs | Task completion creates secret gist with full session log for debugging |
| Codespace dev container | `.devcontainer/devcontainer.json` for mycelium-v2 mobile development |

---

## Copilot Deep Dive

Copilot is the most underutilized integration point. It's already running 15 tasks but as a "dumb" CLI agent.

### Available Models via Copilot
```
claude-sonnet-4.5, claude-haiku-4.5, claude-opus-4.6, claude-opus-4.5, claude-sonnet-4
gemini-3-pro-preview
gpt-5.2-codex, gpt-5.2, gpt-5.1-codex-max, gpt-5.1-codex, gpt-5.1, gpt-5, gpt-5.1-codex-mini, gpt-5-mini, gpt-4.1
```

That's **15 models** through a single subscription. Mycelium dispatch currently passes `--model` but defaults to gemini-3-pro-preview.

### Untapped Copilot Features

1. **Built-in GitHub MCP server**: When dispatched with `--enable-all-github-mcp-tools`, Copilot can:
   - Read/write files on GitHub repos
   - Create/update/close issues and PRs
   - Check CI status and workflow runs
   - Read code from other repos (cross-repo context)
   - Manage branches and releases

2. **Custom MCP servers**: Create `~/.copilot/mcp-config.json` to give Copilot access to mycelium's API during tasks:
   ```json
   {
     "mcpServers": {
       "mycelium": {
         "command": "bun",
         "args": ["run", "/home/dev/mycelium-v2/packages/mcp/src/index.ts"],
         "env": {}
       }
     }
   }
   ```

3. **Session resume**: `copilot --resume [sessionId]` or `copilot --continue`. Mycelium already stores Claude session IDs - could do the same for Copilot's 39 sessions.

4. **Gist sharing**: `copilot --share-gist` creates a gist of the full session after completion. Could auto-attach to tasks.

5. **Custom agents**: `copilot --agent <agent>` for domain-specific behavior.

6. **ACP mode**: `copilot --acp` starts as Agent Client Protocol server. Could be used for tighter integration than CLI dispatch.

### Updated Dispatch Command
```
# Current
copilot -p "prompt" --allow-all-tools

# Upgraded
copilot -p "prompt" --allow-all --enable-all-github-mcp-tools --model claude-sonnet-4.5 --no-ask-user --silent --add-dir /home/dev/repos
```

---

## Database Schema Additions

```sql
-- Tasks table (existing fields: github_url, branch_name)
ALTER TABLE tasks ADD COLUMN github_pr_number INTEGER;
ALTER TABLE tasks ADD COLUMN github_pr_url TEXT;
ALTER TABLE tasks ADD COLUMN github_issue_number INTEGER;
ALTER TABLE tasks ADD COLUMN github_check_run_id INTEGER;

-- Repos table (existing field: github_url)
ALTER TABLE repos ADD COLUMN github_owner TEXT;
ALTER TABLE repos ADD COLUMN github_repo TEXT;
ALTER TABLE repos ADD COLUMN github_default_branch TEXT DEFAULT 'master';
ALTER TABLE repos ADD COLUMN github_webhook_active INTEGER DEFAULT 0;

-- New: webhook delivery log
CREATE TABLE IF NOT EXISTS github_webhook_log (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  event TEXT NOT NULL,
  action TEXT,
  repo TEXT,
  payload_summary TEXT,
  processed INTEGER DEFAULT 0,
  received_at TEXT NOT NULL
);

-- New: GitHub sync state
CREATE TABLE IF NOT EXISTS github_sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## New SSE Events

```typescript
// GitHub integration events
'github:push'             // Agent branch pushed to GitHub
'github:pr_created'       // Shepherd created PR
'github:pr_merged'        // PR merged (task complete)
'github:pr_closed'        // PR closed without merge
'github:ci_passed'        // Actions CI passed on PR
'github:ci_failed'        // Actions CI failed
'github:check_completed'  // Check run finished (shepherd annotations)
'github:alert'            // Security alert (Dependabot, secret scanning)
'github:issue_created'    // Issue created (task sync)
'github:issue_closed'     // Issue closed
'github:notification'     // Notable notification forwarded
```

---

## Cost Analysis

| Service | Cost | Notes |
|---------|------|-------|
| GitHub Free tier | $0 | Unlimited public repos, 2000 Actions min/month for private |
| Copilot subscription | $10/month | Already active. Gives 15 models, premium requests |
| Cloudflare Tunnel | $0 | Free for personal use |
| Self-hosted runner | $0 | Runs on your NixOS box (maybe $0.002/min after March 2026, under review) |
| Additional API calls | $0 | Well within 5000/hr limit |
| **Total additional** | **$0** | Everything fits within existing subscriptions |

---

## Token / Auth Requirements

### Current
- OAuth (`gho_*`): `repo`, `read:org`, `gist` - good for Phase 1
- Fine-grained PAT (`github_pat_*`): Limited, expires Feb 18 - **needs replacement or renewal**

### Needed for Full Integration
Add scopes incrementally via `gh auth refresh`:
```bash
gh auth refresh -h github.com -s admin:repo_hook  # Webhooks
gh auth refresh -h github.com -s workflow          # Actions write
gh auth refresh -h github.com -s user              # Billing, notifications
gh auth refresh -h github.com -s project           # Projects V2
```

### Phase 3: GitHub App
Create "Mycelium" GitHub App with:
- Contents: Read & Write
- Pull requests: Read & Write
- Issues: Read & Write
- Checks: Read & Write (the key one - only Apps can do this)
- Commit statuses: Read & Write
- Deployments: Read & Write
- Metadata: Read

Store private key at `~/.config/mk-agent/mycelium-app.pem`. Installation token auto-refreshes hourly.

---

## Priority Order (Implementation)

| # | Task | Value | Effort | Dependencies |
|---|------|-------|--------|-------------|
| 0a | Push mycelium-v2 to GitHub | Critical | 1 min | None |
| 0b | Enable Dependabot + secret scanning | High | 5 min | None |
| 0c | Upgrade gh CLI to v2.86.0 | Medium | 5 min | None |
| 0d | Add OAuth scopes | Medium | 2 min | Browser auth |
| 1a | Push agent branches to GitHub | High | Low | None |
| 1b | Shepherd creates PRs | Very High | Medium | 1a |
| 1c | Set commit statuses | Medium | Low | None |
| 1d | Enable Copilot GitHub MCP tools | High | Low | None |
| 1e | Branch protection on active repos | High | Low | 1b, 1c |
| 2a | Cloudflare Tunnel setup | High | Medium | Domain |
| 2b | Webhook receiver route | High | Medium | 2a |
| 2c | GitHub notification -> Telegram bridge | Medium | Medium | None (polling, no webhook needed) |
| 2d | Security alert -> task creation | High | Medium | 2b |
| 3a | Create Mycelium GitHub App | High | Medium | None |
| 3b | Check runs with annotations | Very High | Medium | 3a |
| 3c | Projects V2 network board | High | Medium | OAuth scope |
| 3d | Issue <-> task bidirectional sync | Medium | Medium | 2b |
| 4a | Self-hosted Actions runner | Medium | Low | NixOS config |
| 4b | Copilot MCP config for mycelium | High | Low | None |
| 4c | Release automation | Low | Low | 1b |
| 4d | Static report Pages | Low | Medium | Digest cycle |

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `packages/server/src/scheduler/cycles/dispatcher.ts` | Push branch to GitHub after task completion |
| `packages/server/src/scheduler/cycles/shepherd.ts` | Create PR instead of direct merge; set commit status; create check runs |
| `packages/server/src/agents/dispatch.ts` | Add `--enable-all-github-mcp-tools` to Copilot args; Copilot session management |
| `packages/server/src/agents/workspace.ts` | `pushBranchToGithub()` function |
| `packages/server/src/db/schema.ts` | Add github_pr_number, github_issue_number, repo GitHub fields |
| `packages/server/src/index.ts` | Register webhook routes; schema migrations |
| `packages/shared/src/schemas/events.ts` | Add 11 GitHub SSE event types |
| `packages/client/src/stores/connectionStore.ts` | Handle GitHub SSE events |

### New Files
| File | Purpose |
|------|---------|
| `packages/server/src/routes/github-webhook.ts` | Webhook receiver with HMAC verification |
| `packages/server/src/github/client.ts` | GitHub API client (REST + GraphQL, token management) |
| `packages/server/src/github/checks.ts` | Check run creation and annotation builder |
| `packages/server/src/github/sync.ts` | Bidirectional task <-> issue sync |
| `packages/server/src/github/app-auth.ts` | GitHub App JWT + installation token management |
| `packages/server/src/scheduler/cycles/github-sync.ts` | New scheduler cycle for GitHub sync (5 min) |
| `~/.copilot/mcp-config.json` | Copilot MCP configuration for mycelium access |

---

## Risk Mitigations

1. **Agent credential leaks**: Enable secret scanning push protection FIRST, before expanding agent GitHub access
2. **API rate limits**: 5000/hr is generous. Use ETags for conditional requests. GraphQL batches for dashboard
3. **Webhook reliability**: Use Cloudflare Tunnel (not ngrok - rotating URLs). Add polling fallback
4. **Token exposure**: Agents should NOT have GitHub write tokens. Only dispatcher and shepherd write to GitHub
5. **Noisy PRs/Issues**: Rate-limit GitHub operations per agent per repo. Discovery deduplication already prevents duplicate tasks
6. **Complexity**: SQLite remains source of truth. GitHub is a presentation/audit/security layer, not a replacement
