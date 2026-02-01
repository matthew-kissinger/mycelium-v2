# Agent Harness Testing Guide

> Test primitives against ALL harnesses before marking phases complete.

## Quick Auth Check

```bash
# Check which harnesses are authenticated
claude --version && echo "Claude: OK" || echo "Claude: NEEDS AUTH"
codex --version && echo "Codex: OK" || echo "Codex: NEEDS AUTH"
gemini --version && echo "Gemini: OK" || echo "Gemini: NEEDS AUTH"
cline --version && echo "Cline: OK" || echo "Cline: NEEDS AUTH"
cursor --version && echo "Cursor: OK" || echo "Cursor: NEEDS AUTH"
```

## Harness Configurations

### Claude
```typescript
{
  name: 'claude',
  command: 'claude',
  buildArgs: (prompt, model) => [
    '-p', prompt,
    ...(model ? ['--model', model] : []),
    '--dangerously-skip-permissions'
  ],
  defaultTimeout: 1800,  // 30 min
  supportsStreaming: true,
  models: ['opus', 'sonnet', 'haiku'],
  defaultModel: 'sonnet'
}
```

### Codex
```typescript
{
  name: 'codex',
  command: 'codex',
  buildArgs: (prompt, model) => [
    '-q', prompt,
    ...(model ? ['--model', model] : []),
    '--full-auto'
  ],
  defaultTimeout: 1800,  // 30 min
  supportsStreaming: true,
  models: ['gpt-5.2-codex', 'o3-mini'],
  defaultModel: 'gpt-5.2-codex',
  // CRITICAL: Must set cwd explicitly
  requiresCwd: true
}
```

### Gemini
```typescript
{
  name: 'gemini',
  command: 'gemini',
  buildArgs: (prompt, model) => [
    '-p', prompt,
    ...(model ? ['--model', model] : [])
  ],
  defaultTimeout: 900,  // 15 min
  supportsStreaming: true,
  models: ['gemini-3-flash-preview', 'gemini-3-pro'],
  defaultModel: 'gemini-3-flash-preview'
}
```

### Cline
```typescript
{
  name: 'cline',
  command: 'cline',
  buildArgs: (prompt) => ['--task', prompt],
  defaultTimeout: 600,  // 10 min
  supportsStreaming: false,
  // Zombie cleanup required
  killPattern: (cwd) => `pkill -f "cline.*${cwd}"`
}
```

### Cursor
```typescript
{
  name: 'cursor',
  command: 'cursor',
  buildArgs: (prompt) => ['--prompt', prompt],
  defaultTimeout: 600,  // 10 min - hard internal limit
  supportsStreaming: false
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
codex -q "Create a file called test.txt with 'hello world'" --full-auto
gemini -p "Create a file called test.txt with 'hello world'"

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

### 4. Cost Parsing Test

```typescript
// Run task and verify cost extraction
const result = await dispatch({
  agent: 'claude',
  prompt: 'Say hello',
  cwd: '/tmp/mycel-test'
})

console.log('Cost:', result.cost_usd)  // Should be number or undefined
```

### 5. Cline Zombie Test

```bash
# Start Cline task
cline --task "Count to 100 slowly" &
CLINE_PID=$!

# Wait a bit
sleep 5

# Kill and verify cleanup
kill $CLINE_PID

# Check for zombie processes
ps aux | grep cline  # Should be empty
```

## Log Locations

| Harness | Log Directory | Session Pattern |
|---------|---------------|-----------------|
| Claude | `~/.claude/projects/` | `<hash>/sessions/` |
| Codex | `~/.codex/logs/` | `<date>-<id>.log` |
| Gemini | `~/.gemini/sessions/` | `<session-id>/` |
| Cline | VS Code logs | Extension output |
| Cursor | IDE internal | Not accessible |

## Common Issues

### Codex Wrong Repo
**Problem**: Codex commits to current directory instead of task repo
**Solution**: Always set `cwd` explicitly in spawn options

### Cline Zombies
**Problem**: `cline-host` and `cline-core` persist after timeout
**Solution**: Use `pkill -f` with workspace path pattern

### Gemini Rate Limits
**Problem**: 429 errors on rapid requests
**Solution**: Add backoff delay between Gemini tasks

### Cursor 10-min Limit
**Problem**: Tasks always fail after 10 minutes
**Solution**: Hard limit in Cursor - split large tasks

## Validation Matrix

Before merging dispatch changes:

| Test | Claude | Codex | Gemini | Cline | Cursor |
|------|--------|-------|--------|-------|--------|
| Basic exec | [ ] | [ ] | [ ] | [ ] | [ ] |
| Streaming | [ ] | [ ] | [ ] | N/A | N/A |
| Timeout | [ ] | [ ] | [ ] | [ ] | [ ] |
| Cost parse | [ ] | [ ] | [ ] | N/A | N/A |
| Zombie clean | N/A | N/A | N/A | [ ] | N/A |
| CWD handling | [ ] | [ ] | [ ] | [ ] | [ ] |

Fill in [x] when tested and working.
