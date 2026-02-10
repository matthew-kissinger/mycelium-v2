# Agent Harness Testing Guide

> Test primitives against ALL harnesses before marking phases complete.
> Source of truth: `packages/server/src/agents/adapters/` (10 per-agent adapter files behind `AgentAdapter` interface)
> Dispatch entry point: `packages/server/src/agents/dispatch.ts` (delegates to adapters)

## Quick Auth Check

```bash
# Check which harnesses are authenticated
claude --version && echo "Claude: OK" || echo "Claude: NEEDS AUTH"
codex --version && echo "Codex: OK" || echo "Codex: NEEDS AUTH"
gemini --version && echo "Gemini: OK" || echo "Gemini: NEEDS AUTH"
cline --version && echo "Cline: OK" || echo "Cline: NEEDS AUTH"
agent --version && echo "Cursor: OK" || echo "Cursor: NEEDS AUTH"
kiro-cli --version && echo "Kiro: OK" || echo "Kiro: NEEDS AUTH"
vibe --version && echo "Vibe: OK" || echo "Vibe: NEEDS AUTH"
pi --version && echo "Pi: OK" || echo "Pi: NEEDS AUTH"
opencode --version && echo "OpenCode: OK" || echo "OpenCode: NEEDS AUTH"
copilot --version && echo "Copilot: OK" || echo "Copilot: NEEDS AUTH"
```

## Harness Configurations

### Claude
```typescript
{
  command: 'claude',
  args: ['-p', prompt, '--model', model, '--dangerously-skip-permissions'],
  defaultTimeout: 2400,  // 40 min
  billing: 'subscription',
  models: ['opus', 'sonnet', 'haiku'],
  defaultModel: 'sonnet'
}
```

### Codex
```typescript
{
  command: 'codex',
  args: ['exec', prompt, '--model', model, '--full-auto'],
  defaultTimeout: 1800,  // 30 min
  billing: 'subscription',
  models: ['gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2-codex-high', 'gpt-5.2-codex-fast'],
  defaultModel: 'gpt-5.2-codex'
}
```

### Gemini
```typescript
{
  command: 'gemini',
  args: [prompt, '--model', model, '--yolo'],
  defaultTimeout: 1800,
  billing: 'subscription',  // Google AI Pro subscription
  // IMPORTANT: CLI requires -preview suffix. 'gemini-3-pro' and 'gemini-3-flash' are INVALID.
  models: ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  defaultModel: 'flash'
}
```

### Cline
```typescript
{
  command: 'cline',
  args: ['--address', addr, 'task', 'new', prompt, '--yolo', '--mode', 'act'],
  defaultTimeout: 1800,
  billing: 'per_use',
  // Model set via: cline config set act-mode-open-router-model-id=<model>
  // Provider set via: cline config set act-mode-api-provider=<provider>
  // Multi-instance pool: max 4 concurrent, each with unique gRPC address
}
```

### Cursor (Agent CLI)
```typescript
{
  command: 'agent',  // NOT 'cursor'
  args: ['--print', '--output-format', 'json', '--model', model, prompt],
  defaultTimeout: 1800,
  billing: 'subscription',
  models: ['opus-4.6-thinking', 'composer-1', 'sonnet-4.5', 'gpt-5.2-codex', 'gemini-3-flash'],
  defaultModel: 'opus-4.6-thinking'
}
```

### Kiro (AWS)
```typescript
{
  command: 'kiro-cli',
  args: ['chat', '--no-interactive', '--trust-all-tools'],
  // SPECIAL: Prompt piped via stdin (Bun FileSink), not as arg
  // proc.stdin.write(prompt); proc.stdin.end()
  // NOTE: No --model CLI flag. Model routed by AWS.
  defaultTimeout: 1800,
  billing: 'subscription',
  models: ['default', 'claude-opus-4.6', 'claude-sonnet-4.5', 'claude-haiku-4.5'],
}
```

### Vibe (Mistral)
```typescript
{
  command: 'vibe',
  args: ['-p', prompt, '--output', 'text'],
  // NOTE: No --model CLI flag. Model auto-selected by Mistral.
  defaultTimeout: 1800,
  billing: 'per_use',
  models: ['default', 'devstral-latest', 'devstral-small-latest', 'codestral-latest'],
  // Env: MISTRAL_API_KEY
}
```

### Pi (Multi-provider)
```typescript
{
  command: 'pi',
  args: ['-p', prompt, '--provider', provider, '--model', model],
  defaultTimeout: 1800,
  billing: 'varies',
  providers: ['openrouter', 'groq', 'cerebras', 'mistral', 'google', 'anthropic', 'openai'],
  // Env: OPENROUTER_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, MISTRAL_API_KEY, etc.
}
```

### OpenCode
```typescript
{
  command: 'opencode',
  args: ['run', '-m', model, prompt],
  defaultTimeout: 3600,  // 1hr - free models are slow
  billing: 'free',
  models: ['opencode/kimi-k2.5-free', 'opencode/glm-4.7-free', 'opencode/gpt-5-nano'],
  defaultModel: 'opencode/kimi-k2.5-free'
}
```

### Copilot (GitHub)
```typescript
{
  command: 'copilot',
  args: ['-p', prompt, '--model', model, '--allow-all-tools'],
  defaultTimeout: 1800,
  billing: 'subscription',
  models: ['claude-opus-4.6', 'claude-sonnet-4.5', 'gpt-5.2', 'gemini-3-pro-preview'],
  // Env: GH_TOKEN (PAT with Copilot Requests permission)
}
```

## Test Protocol

### 1. Basic Execution Test

```bash
# Create test directory
mkdir -p /tmp/mycel-test && cd /tmp/mycel-test
git init && echo "# Test" > README.md && git add . && git commit -m "init"

# Test each harness with simple prompt
claude -p "Create a file called test.txt with 'hello world'" --dangerously-skip-permissions
codex exec "Create a file called test.txt with 'hello world'" --full-auto
gemini "Create a file called test.txt with 'hello world'" --yolo

# Verify output
cat test.txt
```

### 2. Streaming Test

```typescript
// Test streaming callback works
const result = await dispatch({
  agent: 'claude',
  prompt: 'Count from 1 to 10, one number per line',
  cwd: '/tmp/mycel-test',
  onOutput: (chunk) => {
    console.log('[STREAM]', chunk.slice(0, 50))
  }
})
```

### 3. Timeout Test

```typescript
// Test timeout handling
const result = await dispatch({
  agent: 'claude',
  prompt: 'Sleep for 5 minutes then say done',
  cwd: '/tmp/mycel-test',
  timeout: 10  // 10 seconds - should timeout
})

console.log(result.exit_code)  // Should be 124 (timeout)
```

### 4. Cline Multi-Instance Test

```bash
# Verify multiple cline instances can run concurrently
# Each gets unique gRPC address from the pool (max 4)
mycel task create "task 1" --agent cline --provider openrouter --repo /tmp/mycel-test
mycel task create "task 2" --agent cline --provider openrouter --repo /tmp/mycel-test
# Both should dispatch to different cline instances
```

## Log Locations

| Harness | Log Directory | Session Pattern |
|---------|---------------|-----------------|
| Claude | `~/.claude/projects/` | `<hash>/sessions/` |
| Codex | `~/.codex/logs/` | `<date>-<id>.log` |
| Gemini | `~/.gemini/sessions/` | `<session-id>/` |
| Cline | VS Code logs | Extension output |
| Cursor | IDE internal | Not accessible |
| Kiro | `~/.local/share/kiro-cli/` | AWS SSO sessions |
| Pi | Varies by provider | Provider-specific |
| OpenCode | `~/.local/share/opencode/` | Session logs |

## Common Issues

### Codex Wrong Repo
**Problem**: Codex commits to current directory instead of task repo
**Solution**: Always set `cwd` explicitly in spawn options

### Cline gRPC Conflicts
**Problem**: Multiple tasks on same cline instance cause gRPC session conflicts
**Solution**: Multi-instance pool (max 4) gives each task a dedicated instance

### Gemini Rate Limits
**Problem**: 429 errors on rapid requests (daily quota)
**Solution**: Health tracking auto-backs off, parses quota reset time from error

### Kiro Stdin
**Problem**: Bun spawn stdin is FileSink, not a stream
**Solution**: `proc.stdin.write(prompt); proc.stdin.end()` (NOT getWriter)

### Copilot Auth
**Problem**: GH_TOKEN not set or missing Copilot Requests permission
**Solution**: Set GH_TOKEN env var from `~/.config/mk-agent/COPILOT_TOKEN`

## Validation Matrix

Before merging dispatch changes:

| Test | Claude | Codex | Gemini | Cline | Cursor | Kiro | Vibe | Pi | OpenCode | Copilot |
|------|--------|-------|--------|-------|--------|------|------|----|----------|---------|
| Basic exec | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Streaming | [x] | [x] | [x] | N/A | N/A | [x] | [x] | [x] | N/A | N/A |
| Timeout | [x] | [x] | [x] | [x] | [x] | [ ] | [ ] | [ ] | [ ] | [ ] |
| CWD handling | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |

Fill in [x] when tested and working.
