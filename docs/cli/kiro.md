# Kiro CLI - Agent Decomposition

**CLI:** `kiro-cli` (formerly `q` / Amazon Q Developer CLI)
**Version:** 1.25.1
**Vendor:** AWS / Kiro (rebranded from Amazon Q Developer CLI)
**Install:** Native binary at `~/.local/bin/kiro-cli` (~113MB standalone Rust binary)
**Config dir:** `~/.kiro/` (agents, settings) + `~/.local/share/kiro-cli/` (sessions DB, shell integrations)
**Docs:** https://kiro.dev/docs/cli/

---

## Relationship: kiro-cli vs q

`kiro-cli` is the current name. `q` is a legacy compatibility wrapper:

```sh
# ~/.local/bin/q (65-byte shell script):
#!/bin/sh
"$HOME/.local/bin/kiro-cli" --show-legacy-warning "$@"
```

Running `q` prints `Warning! Q CLI is now Kiro CLI and should be invoked as kiro-cli rather than q` to stderr, then delegates to `kiro-cli`. They are **not the same binary** (different sha256), but `q` is just a thin wrapper.

The lineage: **CodeWhisperer CLI -> Amazon Q Developer CLI -> Kiro CLI**. The underlying service is AWS CodeWhisperer / Amazon Q, accessed via IAM Identity Center (SSO).

---

## Authentication

### Auth Methods

| Method | License Flag | How |
|--------|-------------|-----|
| **IAM Identity Center (SSO)** | `--license pro` | Browser-based SSO via `kiro-cli login --license pro` |
| **Builder ID** | `--license free` | AWS Builder ID (free tier) |
| **Google OAuth** | `--license free` | Social login |
| **GitHub OAuth** | `--license free` | Social login |

### Login Commands

```bash
kiro-cli login                                    # Interactive (picks method)
kiro-cli login --license pro                      # IAM Identity Center
kiro-cli login --license free                     # Builder ID / social
kiro-cli login --license pro --identity-provider https://d-XXXXX.awsapps.com/start --region us-east-1
kiro-cli login --use-device-flow                  # Device flow (no browser redirect)
```

### Current Auth State

```bash
kiro-cli whoami     # Shows login method, profile ARN
kiro-cli profile    # Shows profile details (requires TTY - fails in non-interactive)
```

Current system is logged in via IAM Identity Center:
```
Logged in with IAM Identity Center (https://d-90661e8fb7.awsapps.com/start)
Profile: KiroProfile-us-east-1
arn:aws:codewhisperer:us-east-1:577478169384:profile/GWCN7PGH4N9W
```

### Token Storage

Auth tokens are stored in `~/.local/share/kiro-cli/data.sqlite3` (SQLite, 14MB). This database also stores sessions, settings state, and other CLI data.

### SSO Session Expiry

The SSO session expires periodically (typically after several hours). When expired:
- Chat requests fail with an SSO/IAM Identity error
- Must re-run `kiro-cli login` to refresh
- The `health.ts` error extractor catches: `SSO session`, `IAM Identity`, or `expired` (for agent=kiro)

---

## Models

### Available Models (from error output)

| Model ID | Notes |
|----------|-------|
| `auto` | Default - Kiro selects automatically |
| `claude-opus-4.6` | Best reasoning |
| `claude-opus-4.5` | Previous generation opus |
| `claude-sonnet-4.5` | Balanced workhorse |
| `claude-sonnet-4` | Previous generation sonnet |
| `claude-haiku-4.5` | Fast/cheap |

### Model Selection

```bash
kiro-cli chat --model claude-sonnet-4.5 "prompt"
kiro-cli settings chat.defaultModel claude-sonnet-4.5   # Persistent default
```

**Important:** Model IDs use dot notation (`claude-sonnet-4.5`), NOT Anthropic's full version IDs (`claude-sonnet-4-5-20250929`). Using Anthropic-style IDs produces:
```
error: Model 'claude-sonnet-4-5-20250929' does not exist.
```

### Model Billing

All models are included in the AWS subscription (Pro license via Identity Center) or Builder ID free tier. No per-token billing - this is a subscription/free-tier service, not a pay-per-use API.

---

## Output Format

### stdout vs stderr Split

Kiro properly separates output:
- **stderr:** ASCII art banner (~30 lines), "Did you know?" tips, model info, trust mode notice
- **stdout:** Agent response with ANSI color codes (prefix `> ` with color escapes)

### Raw stdout Format

```
\x1b[38;5;141m> \x1b[0mPONG
```

The response is prefixed with a colored `> ` marker. ANSI escape codes are always present (even with `--wrap never`). The response text follows the `> ` prefix on the same line.

### Output Cleaning for Mycelium

The current adapter does `lines.slice(30)` to skip banner lines. This was designed when all output went to a combined stream. With proper stderr/stdout separation:

1. **stderr** contains the ~33-line banner/startup output
2. **stdout** contains only the `> response_text` with ANSI codes

A better approach would be:
1. Read only stdout (dispatch.ts already captures stdout separately)
2. Strip ANSI codes
3. Strip the `> ` prefix

### No JSON Output Mode

Unlike Claude Code, Kiro CLI has **no `--output-format json` flag**. There is no way to get structured output with token counts. All output is plain text with ANSI formatting.

### No Token/Cost Reporting

Kiro does not report token usage, cost, or timing in its output. The only timing info is `Time: Xs` shown in the terminal (stderr), which would need regex parsing.

---

## Non-Interactive Mode

### Flags for Headless Operation

```bash
kiro-cli chat --no-interactive --trust-all-tools "prompt here"
```

| Flag | Required | Purpose |
|------|----------|---------|
| `--no-interactive` | **Yes** | Disables user input prompts, runs to completion |
| `--trust-all-tools` / `-a` | **Yes** | Auto-approves all tool use (file writes, shell commands) |
| `--trust-tools <list>` | Alternative | Trust specific tools only: `--trust-tools=fs_read,fs_write` |
| `--wrap never` | Optional | Disables line wrapping (output still has ANSI codes) |

### Input Methods

Both work:
1. **Stdin pipe:** `echo "prompt" | kiro-cli chat --no-interactive -a` (Bun stdin gotcha applies)
2. **CLI argument:** `kiro-cli chat --no-interactive -a "prompt here"`

**Bun stdin gotcha:** When spawning from Bun, stdin must be written then closed:
```typescript
proc.stdin.write(prompt)
proc.stdin.end()  // Critical: Bun FileSink requires explicit end()
```

### Exit Codes

- `0` = success
- `3` = MCP server startup failure (with `--require-mcp-startup`)
- Non-zero = error

---

## Session Management

### Session Storage

Sessions are stored in `~/.local/share/kiro-cli/data.sqlite3` (SQLite database, not individual files like Claude Code).

### Session Commands

```bash
kiro-cli chat --list-sessions                    # List sessions for current directory
kiro-cli chat --resume                           # Resume most recent session
kiro-cli chat --resume-picker                    # Interactive session picker (requires TTY)
kiro-cli chat --delete-session <SESSION_ID>       # Delete a session
```

Sessions are scoped per-directory. The session listing shows:
```
Chat SessionId: 28ac15bd-4060-4a28-86b5-76cbcf4c614c
  6 days ago | Reply with just OK | 1 msgs
```

### Session Resume in Mycelium

The `--resume` flag resumes the most recent session for the cwd. There is no `--resume <session-id>` equivalent for targeting a specific session. This limits session resume to "most recent in directory" semantics.

---

## Tool Inventory

### Built-in Tools (from agent config example)

| Tool | Purpose |
|------|---------|
| `read` | Read files |
| `write` | Write files |
| `shell` | Execute shell commands |
| `aws` | AWS-specific operations |
| `report` | Generate reports |
| `introspect` | Self-inspection |
| `knowledge` | Knowledge retrieval |
| `thinking` | Chain-of-thought reasoning |
| `todo` | Task management |
| `delegate` | Delegate to sub-agents |
| `grep` | Search file contents |
| `glob` | Search file names |

### MCP Support

Full MCP (Model Context Protocol) support:

```bash
kiro-cli mcp list                                    # List configured MCP servers
kiro-cli mcp add --name myserver --command npx --args "mcp-server-name"
kiro-cli mcp add --name http-server --url https://mcp.example.com
kiro-cli mcp remove --name myserver
kiro-cli mcp status --name myserver
kiro-cli mcp import --agent my_agent                 # Import from another config
```

MCP servers can be scoped to `default`, `workspace`, or `global`, and can be attached to specific agents.

### ACP (Agent Client Protocol)

Kiro also supports ACP (Agent Client Protocol) via `kiro-cli acp`, which starts Kiro as an ACP agent. This is separate from MCP and is for agent-to-agent communication.

---

## Agent System

### Built-in Agents

| Agent | Type | Purpose |
|-------|------|---------|
| `kiro_default` | Built-in | Default chat agent (active by default) |
| `kiro_help` | Built-in | Help agent for Kiro CLI features |
| `kiro_planner` | Built-in | Planning agent for breaking down tasks |

### Custom Agents

Agents are JSON configs stored in:
- **Global:** `~/.kiro/agents/`
- **Workspace:** `.kiro/agents/` (per-project)

```bash
kiro-cli agent create --name my_agent                # Create in global dir
kiro-cli agent create --name my_agent -d .kiro/agents # Create in workspace
kiro-cli agent edit --name my_agent                   # Edit existing
kiro-cli agent validate --path .kiro/agents/my.json   # Validate config
kiro-cli agent list                                   # List available agents
kiro-cli agent set-default --name my_agent            # Set default for chat
```

### Agent Config Format

```json
{
  "name": "example",
  "description": "Agent description",
  "prompt": null,
  "mcpServers": {},
  "tools": ["read", "write", "shell", "aws", "grep", "glob", "@mcp_server/tool"],
  "toolAliases": {},
  "allowedTools": [],
  "resources": [],
  "hooks": {},
  "toolsSettings": {},
  "useLegacyMcpJson": true,
  "model": null
}
```

### Using Agents in Chat

```bash
kiro-cli chat --agent kiro_planner "plan a feature"
kiro-cli --agent kiro_help                           # Top-level flag also works
```

---

## Configuration

### Settings Storage

Settings are stored as key-value pairs. Two scopes:
- **Global:** `~/.kiro/settings/cli.json` (currently `{}`)
- **Workspace:** Per-project settings

```bash
kiro-cli settings list                               # List all settings
kiro-cli settings list -f json                       # JSON output
kiro-cli settings KEY VALUE                          # Set a key
kiro-cli settings KEY --delete                       # Delete a key
kiro-cli settings KEY VALUE --workspace              # Workspace-scoped
kiro-cli settings open                               # Open settings file in editor
```

### Known Settings Keys

| Key | Type | Purpose |
|-----|------|---------|
| `chat.defaultModel` | string | Default model for chat sessions |

### Shell Integrations

Shell integration files at `~/.local/share/kiro-cli/shell/`:
- `zshrc.pre.zsh`, `zshrc.post.zsh` (for zsh)
- `bashrc.pre.bash`, `bashrc.post.bash` (for bash)
- `profile.pre.bash`, `profile.post.bash`
- `zprofile.pre.zsh`, `zprofile.post.zsh`

### Inline Completions

```bash
kiro-cli inline enable                               # Enable inline shell completions
kiro-cli inline disable                              # Disable
kiro-cli inline status                               # Check status (currently: enabled)
```

---

## Error Patterns

### Known Error Types (from health.ts)

| Error Pattern | Output Contains | health.ts Type | Detection |
|--------------|----------------|----------------|-----------|
| SSO session expired | `SSO session`, `IAM Identity`, `expired` | `api_error` | Line 312-317 |
| Tool approval required | `Tool approval required` + `--trust-all-tools` | `api_error` | Line 303-309 |
| Timeout | `[TIMEOUT]` (synthetic from dispatch.ts) | `timeout` | Line 156 |

### SSO Expiry (Most Common)

```
SSO session expired - run kiro-cli login
```

The SSO token in `data.sqlite3` expires after several hours. Recovery:
1. Run `kiro-cli login` interactively (requires browser)
2. Alternatively, `kiro-cli login --use-device-flow` for headless re-auth

### Doctor Diagnostics

```bash
kiro-cli doctor                                      # Run health checks
kiro-cli doctor --all                                # All checks, no fixes
kiro-cli doctor --strict                             # Error on warnings
```

Current issue: SSH integration not configured (`sshd_config` missing `AcceptEnv Q_SET_PARENT`).

### Diagnostic JSON

```bash
kiro-cli diagnostic -f json
```

Returns system info including:
- CLI version, hash, build date, variant
- OS details, CPU, memory
- Environment (cwd, shell, terminal, install method, SSH status)
- Relevant env vars (PATH, Q_SET_PARENT_CHECK, SHELL, TERM)

---

## Environment Variables

### Kiro-Specific Env Vars

| Variable | Purpose | Current Value |
|----------|---------|---------------|
| `Q_SET_PARENT_CHECK` | Internal process tracking | `1` |

### Env Var Poisoning Analysis

Kiro uses IAM Identity Center (SSO) for authentication. Unlike Claude Code, it does **not** read `ANTHROPIC_API_KEY` or any other API key from the environment. The env vars in `~/.config/mk-agent/env` are irrelevant to Kiro:

| Env Var | Risk | Notes |
|---------|------|-------|
| `ANTHROPIC_API_KEY` | **None** | Kiro ignores this |
| `OPENAI_API_KEY` | **None** | Kiro ignores this |
| `GOOGLE_API_KEY` | **None** | Kiro ignores this |
| `OPENROUTER_API_KEY` | **None** | Kiro ignores this |
| `AWS_*` | **Potential** | No AWS vars currently set, but if `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, or `AWS_SESSION_TOKEN` were set, they could interfere with SSO auth |

**No env var stripping needed** for the Kiro adapter (unlike Claude). The IAM Identity Center auth is browser/token-based and stored in the SQLite database.

---

## Other Subcommands

### translate (Natural Language to Shell)

```bash
kiro-cli translate "list all files modified today"
```

Translates natural language to shell commands. Not useful for Mycelium dispatch.

### issue (GitHub Issue Creation)

```bash
kiro-cli issue "description of the problem"
kiro-cli issue --force "description"
```

Creates GitHub issues for the Kiro CLI itself (bug reports).

### integrations

```bash
kiro-cli integrations status all                     # All integration statuses
kiro-cli integrations install dotfiles               # Install shell integrations
kiro-cli integrations install ssh                    # Install SSH integration
```

Supported integrations: dotfiles, ssh, input-method, vscode, intellij-plugin, autostart-entry, gnome-shell-extension.

### debug

```bash
kiro-cli debug logs                                  # Show debug logs
kiro-cli debug refresh-auth-token                    # Refresh auth token
kiro-cli debug diagnostics                           # Watch diagnostics
```

### update

```bash
kiro-cli update                                      # Interactive update
kiro-cli update -y                                   # Non-interactive update
```

---

## Mycelium Adapter Analysis

### Current Adapter (`packages/server/src/agents/adapters/kiro.ts`)

```typescript
export const kiroAdapter: AgentAdapter = {
  id: 'kiro',
  buildArgs(): string[] {
    return ['chat', '--no-interactive', '--trust-all-tools']
  },
  buildEnv(): Record<string, string> {
    return {}
  },
  prepareStdin(prompt: string): string {
    return prompt
  },
  postProcessOutput(output: string): string {
    const lines = output.split('\n')
    const cleanOutput = lines.slice(30).join('\n').trim()
    return cleanOutput || output
  },
}
```

### Issues Found

| Issue | Severity | Details |
|-------|----------|---------|
| **postProcessOutput incorrect** | Medium | Skips first 30 lines, but dispatch.ts captures stdout separately from stderr. Banner goes to stderr (~33 lines). stdout has only the response (1 line typically). Slicing 30 lines from stdout discards the actual response for short outputs. |
| **No ANSI stripping** | Medium | stdout contains ANSI escape codes (`\x1b[38;5;141m> \x1b[0m...`). The `> ` prefix and color codes should be stripped. |
| **No model passthrough** | Low | `buildArgs` ignores `options.model`. Should pass `--model` when set. But Kiro model IDs differ from Mycelium's `default` alias. |
| **No --wrap never** | Low | Adding `--wrap never` doesn't help with ANSI codes but prevents wrapping artifacts. |
| **Prompt via stdin only** | Info | Could also pass as CLI argument: `kiro-cli chat --no-interactive -a "prompt"`. Both work. |
| **No session resume** | Info | `--resume` only resumes "most recent in directory", not a specific session ID. Not useful for Mycelium retry. |

### Recommended Adapter Fix

```typescript
export const kiroAdapter: AgentAdapter = {
  id: 'kiro',
  buildArgs(options: AdapterOptions): string[] {
    const args = ['chat', '--no-interactive', '--trust-all-tools', '--wrap', 'never']
    if (options.model && options.model !== 'default') {
      args.push('--model', options.model)
    }
    return args
  },
  buildEnv(): Record<string, string> {
    return {}
  },
  prepareStdin(prompt: string): string {
    return prompt
  },
  postProcessOutput(output: string): string {
    // stdout only contains the response (banner goes to stderr)
    // Strip ANSI escape codes
    const stripped = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Strip the "> " prefix Kiro adds to responses
    const cleaned = stripped.replace(/^>\s*/gm, '').trim()
    return cleaned || output
  },
}
```

### Fallback Chain (in fallback.ts)

```
kiro has no in-agent model escalation (model is "default")
```

Cross-agent fallback: `kiro -> claude (sonnet)`

### Registry Seed Data (seed-registry.ts)

- Provider: `aws` (auth_type: `sso`)
- Default model: `default`
- Default provider: `aws`
- Timeout: from AGENT_MATRIX

---

## Billing Classification

| Auth Mode | Mycelium Billing Type | Cost Tracking |
|-----------|----------------------|---------------|
| IAM Identity Center (Pro) | `subscription` | `cost_usd = 0` (AWS enterprise billing) |
| Builder ID (Free) | `free_tier` | `cost_usd = 0` |

No per-token billing exposed to Mycelium. AWS handles billing at the organization level.

---

## Validation Checklist

- [x] `kiro-cli --version` returns 1.25.1
- [x] `kiro-cli whoami` shows IAM Identity Center login
- [x] `echo "test" | kiro-cli chat --no-interactive -a` returns response on stdout
- [x] Banner/startup output goes to stderr (~33 lines)
- [x] Response on stdout has ANSI codes (`\x1b[38;5;141m> \x1b[0m`)
- [x] `--model claude-sonnet-4.5` works (dot notation, not Anthropic full ID)
- [x] `--model claude-sonnet-4-5-20250929` fails (Anthropic-style IDs rejected)
- [x] CLI argument prompt works: `kiro-cli chat --no-interactive -a "prompt"`
- [x] Stdin pipe prompt works: `echo "prompt" | kiro-cli chat --no-interactive -a`
- [x] `--wrap never` does NOT strip ANSI codes (only disables line wrapping)
- [x] MCP support confirmed (`kiro-cli mcp list`, `add`, `remove`, `status`)
- [x] Sessions stored in SQLite (`~/.local/share/kiro-cli/data.sqlite3`)
- [x] No env var poisoning risk from `~/.config/mk-agent/env`
- [ ] SSO session expiry recovery (needs long-running test)
- [ ] `kiro-cli doctor` SSH integration fix (non-blocking for dispatch)
