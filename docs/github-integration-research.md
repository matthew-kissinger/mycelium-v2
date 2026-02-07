# GitHub Integration Research for Mycelium v2

Research conducted: 2026-02-06

---

## 1. Current Account Status

### Account
- **User**: matthew-kissinger (GitHub ID: 125378628)
- **Plan**: Free tier (no Pro/Teams features detected)
- **Public repos**: 17 (on GitHub)
- **Local repos**: ~49 (in ~/repos/)
- **Organizations**: None
- **SSH**: Authenticated (`ssh -T git@github.com` works)

### Authentication
- **PAT (fine-grained)**: `~/.config/mk-agent/GITHUB_TOKEN` - github_pat_* format
- **Copilot PAT**: `~/.config/mk-agent/COPILOT_TOKEN` - separate fine-grained PAT
- **gh CLI**: v2.63.2 installed, authenticates via GH_TOKEN env var
- **Copilot CLI**: v0.0.405 installed

### Token Scope Limitations (Current PAT)
The current fine-grained PAT is missing several scopes:
- Cannot access: billing, installations, code-scanning, secret-scanning, vulnerability alerts, webhooks
- Cannot see: private repos (mycelium-v2 is invisible to the token)
- Can access: public repo data, Actions runs, Pages, commits, branches, issues, PRs

### Critical Finding: mycelium-v2 Is Not on GitHub
- Git remote points to `git@github.com:matthew-kissinger/mycelium-v2.git`
- But the repo does NOT exist on GitHub (404 on all API calls)
- SSH auth works, so the repo could be created and pushed
- The orchestration system itself has no GitHub presence

---

## 2. Repos on GitHub vs Local

### On GitHub (17 public repos)
| Repo | Language | Last Push | Pages | CI |
|------|----------|-----------|-------|-----|
| Asteroid-Miner | TypeScript | 2026-02-06 | Yes | Deploy + Pages |
| terror-in-the-jungle | TypeScript | 2026-02-06 | Yes | Deploy + Perf |
| Space-Laser | JavaScript | 2026-02-02 | No | No |
| the-nightman-cometh | TypeScript | 2026-02-01 | No | No |
| zoo-mcp | Python | 2026-01-20 | No | No |
| sds | JavaScript | 2025-12-11 | No | No |
| pixforge | TypeScript | 2025-11-25 | No | No |
| terror-vr-experimental | TypeScript | 2025-09-23 | No | No |
| + 9 older repos | Various | 2024-2025 | No | No |

### Local Only (32+ repos NOT on GitHub)
Notable repos missing from GitHub:
- **mycelium-v2** - The orchestration system itself
- **<private-repo>** - Asset generation (port 3000)
- **arkt, macrocosm, strukt, void-scavenger** - Likely game projects
- **agent-orchestrator-mcp-server** - MCP server
- **webhook-relay** - Could be relevant to GitHub integration
- **CourseAI-V2, attn-app, attn-site** - Various apps

---

## 3. What Agents Have Pushed

### Active Agent Contributors
- **Claude Agent**: Pushing to Asteroid-Miner (73 commits from matthew-kissinger + agent commits) - CSS migrations, test fixes, docs
- **Claude Haiku**: Pushing to terror-in-the-jungle - massive test generation (2302 tests across 60 files)
- **MK Agent**: Pushing to Space-Laser - sprite generation, asset management
- **google-labs-jules[bot]**: 1 contribution to Asteroid-Miner

### Agent Push Patterns
Agents are pushing directly to master/main branches. There are no agent-created PRs (only 1 merged PR found: a docs update on Asteroid-Miner). This means:
- No code review before merge
- No CI check gates (pushes happen even when CI fails)
- 4 recent deploy failures on Asteroid-Miner (Deploy step fails after build succeeds)
- Performance regression checks failing on terror-in-the-jungle

---

## 4. GitHub Services Assessment

### GitHub Actions (Relevance: HIGH)
**Current state**: 2 repos have workflows (Asteroid-Miner, terror-in-the-jungle)
- Asteroid-Miner: `deploy.yml` (GitHub Pages) - 4 recent failures
- terror-in-the-jungle: `deploy.yml` + `perf-check.yml` - perf checks failing

**Free tier limits**:
- 2,000 minutes/month for public repos (unlimited actually - public repos are free)
- 500 MB storage for artifacts
- Concurrent jobs: 20

**Integration opportunities**:
1. **CI on agent pushes**: Add test/lint/typecheck workflows to all repos agents work on
2. **Gate merges**: Require status checks before merging (currently agents push directly)
3. **Mycelium callback**: GitHub Actions could POST to mycelium API when builds complete
4. **Custom Actions**: Create reusable workflows for agent repos (test + deploy pattern)

### GitHub Issues (Relevance: HIGH)
**Current state**: Only 1 open issue across all repos (Asteroid-Miner #2)

**Integration opportunities**:
1. **Mycelium tasks -> GitHub Issues**: When discovery creates tasks, also create GitHub Issues
2. **Issue -> Task sync**: GitHub Issues could trigger mycelium task creation via webhooks
3. **Shepherd reporting**: When shepherd evaluates a task, update the linked GitHub Issue
4. **Labels for agents**: Tag issues with which agent worked on them
5. **Project boards**: Track multi-repo progress

### GitHub Pull Requests (Relevance: HIGH)
**Current state**: Agents push directly to main branches. No PR workflow.

**Integration opportunities**:
1. **Shepherd creates PRs instead of direct merges**: This is the highest-value change
   - Agent worktree branches become PR source branches
   - Shepherd review becomes PR review comment
   - Merge/reject decisions become PR merge/close
   - Full audit trail of agent changes
2. **Require CI checks on PRs**: Prevent broken deploys
3. **PR templates**: Standard format for agent-generated PRs
4. **Auto-label**: Tag PRs with agent name, model used, cost

### GitHub Pages (Relevance: MEDIUM)
**Current state**: Asteroid-Miner and terror-in-the-jungle use Pages

**Integration opportunities**:
1. **Mycelium dashboard**: Host a static version of the React frontend on Pages
2. **Agent reports**: Publish shepherd evaluations as static pages
3. **Documentation**: Auto-deploy docs from repos

### GitHub Webhooks (Relevance: HIGH)
**Current state**: No webhooks configured (token lacks permissions to verify)

**Integration opportunities**:
1. **Push events -> Mycelium**: Notify mycelium when agents push to GitHub
2. **PR events -> Task updates**: When a PR is merged/closed, update mycelium task status
3. **Issue events -> Discovery**: New issues trigger discovery analysis
4. **Workflow events -> Health tracking**: Build failures update agent health

### GitHub Packages / Container Registry (Relevance: LOW)
- No containers in the network currently
- Mycelium runs on Bun, not containerized
- Could be useful later for deployment/distribution

### GitHub Code Scanning / Security (Relevance: MEDIUM)
**Current state**: Not enabled (Dependabot alerts disabled, code scanning not accessible)

**Integration opportunities**:
1. **Dependabot**: Enable for all repos to catch vulnerable dependencies
2. **CodeQL**: Free for public repos - static analysis on agent code
3. **Secret scanning**: Prevent agents from accidentally committing secrets
4. **Dependency review**: Block PRs that introduce vulnerable dependencies

### GitHub Copilot (Relevance: LOW-MEDIUM)
**Current state**: Copilot CLI installed (v0.0.405), used as an agent in the network

**Integration opportunities**:
- Already integrated as a dispatch target
- Copilot Extensions API could provide more structured interaction
- GitHub Copilot Workspace (preview) could be an alternative to agent dispatch

### GitHub Projects (Relevance: MEDIUM)
**Current state**: Not used (all repos have projects enabled but none created)

**Integration opportunities**:
1. **Network-wide project board**: Track all mycelium tasks as project items
2. **Automated status updates**: Move cards when tasks change status
3. **Sprint planning**: Group tasks into iterations

### GitHub Discussions (Relevance: LOW)
- Not enabled on any repo
- Could theoretically map to alignment signals but Telegram already fills this role

### GitHub API Rate Limits
- **Core**: 5,000/hour (fine-grained PAT)
- **Search**: 30/minute
- **GraphQL**: 5,000/hour
- More than sufficient for integration

---

## 5. Integration Architecture Recommendations

### Priority 1: PR-Based Agent Workflow (HIGH VALUE)

Instead of agents pushing directly to main, switch to a PR-based flow:

```
Discovery -> creates task with branch
Dispatcher -> agent works in worktree on branch
Agent completes -> pushes branch to GitHub
Shepherd -> creates PR from branch, adds review comment
Shepherd approves -> merges PR
Shepherd rejects -> closes PR with feedback
```

Benefits:
- Full audit trail of every agent change
- CI runs on PRs before merge
- Human can review/intervene before merge
- GitHub UI shows complete history of agent work
- Prevents broken deploys (gate on green CI)

Requirements:
- Token needs: `pull_requests:write`, `contents:write`
- Need to push agent branches to GitHub (currently only local worktrees)
- Shepherd needs to call GitHub API to create/merge PRs

### Priority 2: CI Workflows for All Agent Repos (HIGH VALUE)

Create a standard workflow template for agent repos:
```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup-node
      - install
      - typecheck (if TypeScript)
      - test
      - build
```

Benefits:
- Catch agent errors before they reach main
- Performance regression detection
- Automated quality gates

### Priority 3: GitHub Issues <-> Mycelium Tasks Sync (MEDIUM VALUE)

Two-way sync:
1. When mycelium creates a task for a repo on GitHub, also create a GitHub Issue
2. When someone creates a GitHub Issue, mycelium could pick it up (via webhook)
3. Task status changes update issue labels/state

Requirements:
- Token needs: `issues:write`
- Webhook endpoint on mycelium backend
- Mapping between mycelium task IDs and GitHub issue numbers

### Priority 4: Put mycelium-v2 on GitHub (MEDIUM VALUE)

The orchestration system itself should be on GitHub:
- Version control backup
- CI/CD for the system itself
- Documentation hosting
- Issue tracking for mycelium bugs
- Could be private repo (would need Pro plan or make it public)

Note: Free tier allows unlimited private repos with limited Actions minutes (2,000/month).

### Priority 5: Security Scanning (LOW-MEDIUM VALUE)

Enable across all repos:
- Dependabot for dependency updates
- Secret scanning to prevent credential leaks from agents
- CodeQL for static analysis (free for public repos)

---

## 6. Authentication Requirements

### Current Token
The existing fine-grained PAT has limited permissions. For full integration, a new token would need:

| Permission | Current | Needed | Purpose |
|------------|---------|--------|---------|
| Contents | read | read/write | Push branches, read files |
| Pull requests | none | read/write | Create/merge PRs |
| Issues | read? | read/write | Create/update issues |
| Actions | read | read | Check workflow status |
| Webhooks | none | read/write | Configure push notifications |
| Code scanning | none | read | Security alerts |
| Metadata | read | read | Repo info |

### Token Management
- Store in `~/.config/mk-agent/GITHUB_TOKEN`
- Dispatch already reads from this path for Copilot
- buildAgentEnv() sets GH_TOKEN in agent environment
- Could use separate tokens for different scopes (read-only for agents, write for shepherd)

### Webhook Security
- Webhooks require a shared secret for payload verification
- Mycelium backend would need a `/api/github/webhook` endpoint
- Must run on a publicly accessible URL (or use a tunnel like ngrok/cloudflare)

---

## 7. Cost Analysis

### Free Tier (Current)
| Feature | Limit | Notes |
|---------|-------|-------|
| Public repos | Unlimited | All 17 current repos |
| Private repos | Unlimited | Limited collaborators |
| Actions (public) | Unlimited minutes | Free for public repos |
| Actions (private) | 2,000 min/month | Linux runners |
| Packages | 500 MB storage | 1 GB transfer |
| Pages | 1 GB storage | Public repos only |
| Issues/PRs | Unlimited | Free |
| Projects | Unlimited | Free |
| Codespaces | 120 core-hours/month | 15 GB storage |
| Copilot | Separate subscription | Already active |

### What Free Tier Provides
Everything needed for the proposed integrations is available on the free tier:
- PR workflow: Free
- CI with Actions: Free for public repos
- Issues: Free
- Webhooks: Free
- Code scanning: Free for public repos
- Pages: Free

### What Pro ($4/month) Would Add
- GitHub Pages for private repos
- Required reviewers on PRs
- More Actions minutes for private repos
- Code navigation and insights
- Not necessary for the proposed integrations

### What Teams ($4/user/month) Would Add
- Organization features
- Draft PRs
- Repository rules
- Not relevant for single-user network

### Usage-Based Costs
- Actions: $0.008/min beyond free tier (Linux)
- Packages: $0.25/GB beyond 500 MB
- Large File Storage: $5/50GB pack
- Copilot: $10/month (already subscribed)

---

## 8. Immediate Action Items

### Quick Wins (No Code Changes)
1. **Enable Dependabot** on all public repos via GitHub settings
2. **Enable secret scanning** on all public repos
3. **Fix Asteroid-Miner deploy workflow** - Deploy step is failing
4. **Create mycelium-v2 repo on GitHub** - Even as private, for backup

### Token Update
1. Create a new fine-grained PAT with these permissions:
   - `contents:write` (for branch push)
   - `pull_requests:write` (for PR creation)
   - `issues:write` (for issue sync)
   - `actions:read` (for CI status)
   - `webhooks:write` (for event notifications)
2. Scope it to all repositories owned by matthew-kissinger
3. Replace `~/.config/mk-agent/GITHUB_TOKEN`

### Code Changes for Integration
1. **Shepherd PR creation**: Modify `shepherd.ts` to create GitHub PRs instead of direct merges
2. **Webhook endpoint**: Add `/api/github/webhook` route to Hono server
3. **Push agent branches**: After agent completes worktree work, push branch to GitHub
4. **Issue sync**: Add GitHub Issue creation in task creation flow
5. **CI status polling**: Check GitHub Actions status before shepherd evaluation

---

## 9. Risk Assessment

### Risks of Deeper Integration
1. **API rate limits**: 5,000/hour is generous but could be hit with aggressive polling (use webhooks instead)
2. **Token exposure**: Agents with write access could accidentally push to wrong repos
3. **Webhook reliability**: Requires mycelium to be publicly accessible or use a tunnel
4. **Complexity**: Adding GitHub as coordination layer alongside SQLite DB increases system complexity
5. **Agent behavior**: Agents might create noisy PRs/issues if not properly constrained

### Mitigations
1. Use webhooks for events, API only for writes
2. Scope tokens per-repo, use separate read-only token for agents
3. Use Cloudflare Tunnel or similar for webhook endpoint
4. GitHub as a presentation/audit layer, SQLite remains source of truth
5. Rate-limit GitHub operations per agent per repo

---

## 10. Summary

The mycelium network has a significant GitHub integration gap. 32 of 49 local repos are not on GitHub at all, agents push directly to main branches without CI or review, and the orchestration system itself has no GitHub presence.

The highest-value integration is switching from direct pushes to a PR-based workflow through the shepherd. This provides audit trails, CI gates, and human review points - all using free tier features.

The current fine-grained PAT needs expanded scopes for write operations (PRs, issues, webhooks). All proposed integrations work within the free tier limits.

Key numbers:
- 17 repos on GitHub, 32+ local only
- 2 repos with CI workflows (both have failures)
- 0 agent-created PRs (all direct pushes)
- 0 GitHub Issues tracking agent work
- 5,000 API calls/hour available
- $0 additional cost for full integration
