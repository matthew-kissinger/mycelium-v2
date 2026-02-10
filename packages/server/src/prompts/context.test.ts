/**
 * Unit tests for context assembly functions.
 *
 * Tests the prompt injection system that builds context for agent dispatch.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import {
  buildMycelContext,
  buildAgentsSection,
  buildSkillsSection,
  buildMcpSection,
  selectTaskSkills,
} from './context'
import { _markInitializedForTesting } from '../agents/registry-cache'

// Registry cache must be marked initialized before buildAgentsSection can
// call getCachedEnabledAgents (cache is empty so all AGENT_MATRIX entries show).
beforeAll(() => {
  _markInitializedForTesting()
})

// =============================================================================
// buildMycelContext
// =============================================================================

describe('buildMycelContext', () => {
  test('returns CLI instructions with default agent prefix', () => {
    const ctx = buildMycelContext()
    expect(ctx).toContain('## Human Communication')
    expect(ctx).toContain('mycel')
    expect(ctx).toContain('[AGENT]')
    expect(ctx).toContain('## Output Requirements')
  })

  test('includes agent identity when agentId provided', () => {
    const ctx = buildMycelContext({ agentId: 'claude' })
    expect(ctx).toContain('claude')
    expect(ctx).toContain('**You are:** claude')
  })

  test('includes model in prefix when both agentId and model provided', () => {
    const ctx = buildMycelContext({ agentId: 'claude', model: 'opus' })
    expect(ctx).toContain('claude/opus')
  })

  test('includes task title when provided', () => {
    const ctx = buildMycelContext({ taskTitle: 'Fix the login bug' })
    expect(ctx).toContain('Fix the login bug')
    expect(ctx).toContain('**Your current work:**')
  })

  test('includes task ID in prefix when provided', () => {
    const ctx = buildMycelContext({ taskId: 'abcdef12-3456-7890-abcd-ef1234567890' })
    expect(ctx).toContain('#abcdef12')
  })

  test('includes role prefix when provided', () => {
    const ctx = buildMycelContext({ role: 'task_agent' })
    expect(ctx).toContain('[TASK_AGENT]')
  })

  test('includes Kiro git safety instructions for kiro agent', () => {
    const ctx = buildMycelContext({ agentId: 'kiro' })
    expect(ctx).toContain('## Kiro Git Safety')
    expect(ctx).toContain('NEVER use `git add .`')
  })

  test('does not include Kiro instructions for other agents', () => {
    const ctx = buildMycelContext({ agentId: 'claude' })
    expect(ctx).not.toContain('## Kiro Git Safety')
  })

  test('includes Cursor test verification for cursor agent', () => {
    const ctx = buildMycelContext({ agentId: 'cursor' })
    expect(ctx).toContain('## Test Verification')
  })

  test('does not include Cursor instructions for other agents', () => {
    const ctx = buildMycelContext({ agentId: 'claude' })
    expect(ctx).not.toContain('## Test Verification')
  })

  test('includes worktree context when worktree path provided', () => {
    const ctx = buildMycelContext({
      worktreePath: '/tmp/worktrees/task-abc12345',
      branchName: 'mycel/task-abc12345',
    })
    expect(ctx).toContain('## Workspace Isolation')
    expect(ctx).toContain('/tmp/worktrees/task-abc12345')
    expect(ctx).toContain('mycel/task-abc12345')
  })

  test('does not include worktree context when not provided', () => {
    const ctx = buildMycelContext({ agentId: 'claude' })
    expect(ctx).not.toContain('## Workspace Isolation')
  })

  test('includes structured XML output section for task agents', () => {
    const ctx = buildMycelContext()
    expect(ctx).toContain('## Structured Output (REQUIRED)')
    expect(ctx).toContain('<task_result')
    expect(ctx).toContain('status="success|partial|blocked"')
    expect(ctx).toContain('<summary>')
    expect(ctx).toContain('<file action="modified">')
    expect(ctx).toContain('<tests>')
    expect(ctx).toContain('<commit hash=')
    // Old markers should NOT appear
    expect(ctx).not.toContain('[FILES_CHANGED]')
    expect(ctx).not.toContain('[TESTS_RUN]')
    expect(ctx).not.toContain('[BRANCH]')
  })

  test('excludes XML output section for system agents', () => {
    for (const sysRole of ['shepherd', 'discovery', 'digest', 'compaction', 'armory', 'genesis']) {
      const ctx = buildMycelContext({ role: sysRole })
      expect(ctx).not.toContain('## Structured Output (REQUIRED)')
      expect(ctx).not.toContain('<task_result')
    }
  })

  test('includes XML output section for task_agent role', () => {
    const ctx = buildMycelContext({ role: 'task_agent' })
    expect(ctx).toContain('## Structured Output (REQUIRED)')
    expect(ctx).toContain('<task_result')
  })

  test('combines all options correctly', () => {
    const ctx = buildMycelContext({
      role: 'task_agent',
      agentId: 'kiro',
      model: 'default',
      taskId: '12345678-1234-1234-1234-123456789abc',
      taskTitle: 'Implement feature X',
    })
    expect(ctx).toContain('[TASK_AGENT]')
    expect(ctx).toContain('kiro/default')
    expect(ctx).toContain('#12345678')
    expect(ctx).toContain('Implement feature X')
    expect(ctx).toContain('## Kiro Git Safety')
    expect(ctx).toContain('<task_result')
  })
})

// =============================================================================
// buildAgentsSection
// =============================================================================

describe('buildAgentsSection', () => {
  test('contains matrix header', () => {
    const section = buildAgentsSection()
    expect(section).toContain('## Agent-Provider-Model Matrix')
  })

  test('contains all 10 agents', () => {
    const section = buildAgentsSection()
    const agents = ['claude', 'codex', 'gemini', 'cline', 'cursor', 'kiro', 'vibe', 'pi', 'opencode', 'copilot']
    for (const agent of agents) {
      expect(section).toContain(agent)
    }
  })

  test('contains provider info', () => {
    const section = buildAgentsSection()
    expect(section).toContain('anthropic')
    expect(section).toContain('openrouter')
    expect(section).toContain('groq')
    expect(section).toContain('cerebras')
  })

  test('contains billing categories', () => {
    const section = buildAgentsSection()
    expect(section).toContain('sub')
    expect(section).toContain('FREE')
    expect(section).toContain('$/tok')
  })

  test('contains task creation format', () => {
    const section = buildAgentsSection()
    expect(section).toContain('### Task Creation Format')
    expect(section).toContain('mycel task create')
  })

  test('explains provider requirement for multi-provider agents', () => {
    const section = buildAgentsSection()
    expect(section).toContain('--provider')
    expect(section).toContain('Multi-provider agents')
  })

  test('contains task-to-agent mapping', () => {
    const section = buildAgentsSection()
    expect(section).toContain('### Task-to-Agent Mapping')
    expect(section).toContain('Simple fix')
    expect(section).toContain('Feature')
    expect(section).toContain('Complex')
  })

  test('contains free options section', () => {
    const section = buildAgentsSection()
    expect(section).toContain('### Free Options')
  })

  test('includes credits info when provided', () => {
    const section = buildAgentsSection({
      openrouter: { remaining: 5.50, limit: 10.00, freeModels: ['model-a:free'] },
    })
    expect(section).toContain('### Credits & Provider Status')
    expect(section).toContain('OpenRouter: $5.50/$10')
  })

  test('shows gemini quota exceeded when relevant', () => {
    const section = buildAgentsSection({
      gemini: { quotaStatus: 'exceeded' },
    })
    expect(section).toContain('Gemini: QUOTA EXCEEDED')
  })

  test('includes groq and cerebras status', () => {
    const section = buildAgentsSection({
      groq: { available: true, remainingRequests: 42 },
      cerebras: { available: true, remainingRequestsDay: 100, limitRequestsDay: 200 },
    })
    expect(section).toContain('Groq: OK (42 reqs left)')
    expect(section).toContain('Cerebras: OK (100/200 day)')
  })

  test('includes task distribution when provided', () => {
    const dist = {
      claude: { total: 20, done: 15, failed: 5, pending: 0, running: 0 },
      gemini: { total: 10, done: 8, failed: 2, pending: 0, running: 0 },
    }
    const section = buildAgentsSection(undefined, dist)
    expect(section).toContain('### Current Usage Distribution')
    expect(section).toContain('claude')
    expect(section).toContain('gemini')
    expect(section).toContain('Target:')
  })

  test('skips distribution section when empty', () => {
    const section = buildAgentsSection(undefined, {})
    expect(section).not.toContain('### Current Usage Distribution')
  })
})

// =============================================================================
// buildSkillsSection
// =============================================================================

describe('buildSkillsSection', () => {
  test('returns empty string when no skills match', () => {
    const section = buildSkillsSection([])
    expect(section).toBe('')
  })

  test('returns empty string for nonexistent skill names', () => {
    const section = buildSkillsSection(['nonexistent-skill-xyz'])
    expect(section).toBe('')
  })

  // The remaining tests depend on installed skills in ~/.claude/skills/
  // which may not exist in CI. We test the logic rather than file I/O.
  test('does not crash with empty repo path', () => {
    const section = buildSkillsSection([], '/nonexistent/repo')
    expect(section).toBe('')
  })
})

// =============================================================================
// buildMcpSection
// =============================================================================

describe('buildMcpSection', () => {
  // MCP servers depend on installed agent configs - test the function signature
  test('returns string (may be empty if no MCPs configured)', () => {
    const section = buildMcpSection('claude')
    expect(typeof section).toBe('string')
  })

  test('returns string for unknown agent', () => {
    const section = buildMcpSection('nonexistent-agent')
    expect(typeof section).toBe('string')
  })

  // buildMcpSection() without agent runs slow CLI commands (claude mcp list, etc.)
  // Skip in fast tests - the per-agent variant covers the logic.
  test.skip('returns string when called without agent (slow - runs CLI)', () => {
    const section = buildMcpSection()
    expect(typeof section).toBe('string')
  })
})

// =============================================================================
// selectTaskSkills
// =============================================================================

describe('selectTaskSkills', () => {
  test('returns empty array when repo has no skills', () => {
    const result = selectTaskSkills([], 'Fix bug')
    expect(result).toEqual([])
  })

  test('matches collision keyword to collision skills', () => {
    const repoSkills = ['threejs-collision', 'threejs-bvh-skill', 'react-best-practices']
    const result = selectTaskSkills(repoSkills, 'Fix collision detection')
    expect(result).toContain('threejs-collision')
    expect(result).toContain('threejs-bvh-skill')
  })

  test('matches shader keyword', () => {
    const repoSkills = ['threejs-shaders', 'webgpu-threejs-tsl', 'react-best-practices']
    const result = selectTaskSkills(repoSkills, 'Implement custom shader')
    expect(result).toContain('threejs-shaders')
  })

  test('matches test keyword', () => {
    const repoSkills = ['vitest', 'game-testing-patterns', 'react-best-practices']
    const result = selectTaskSkills(repoSkills, 'Add unit tests')
    expect(result).toContain('vitest')
    expect(result).toContain('game-testing-patterns')
  })

  test('matches database keyword', () => {
    const repoSkills = ['drizzle-orm', 'hono-framework']
    const result = selectTaskSkills(repoSkills, 'Fix database query')
    expect(result).toContain('drizzle-orm')
  })

  test('matches API keyword', () => {
    const repoSkills = ['hono-framework', 'zod-validation']
    const result = selectTaskSkills(repoSkills, 'Add new API endpoint')
    expect(result).toContain('hono-framework')
  })

  test('only returns skills that exist in repo skills', () => {
    // The keyword "collision" maps to threejs-collision and threejs-bvh-skill
    // But if repo only has threejs-collision, we should not get threejs-bvh-skill
    const repoSkills = ['threejs-collision', 'react-best-practices']
    const result = selectTaskSkills(repoSkills, 'Fix collision detection')
    expect(result).toContain('threejs-collision')
    expect(result).not.toContain('threejs-bvh-skill')
  })

  test('falls back to first N repo skills when no keyword matches', () => {
    const repoSkills = ['skill-a', 'skill-b', 'skill-c', 'skill-d']
    const result = selectTaskSkills(repoSkills, 'Do something generic')
    // No keywords match, should get first 3 (default maxSkills)
    expect(result).toEqual(['skill-a', 'skill-b', 'skill-c'])
  })

  test('respects maxSkills limit', () => {
    const repoSkills = ['skill-a', 'skill-b', 'skill-c', 'skill-d']
    const result = selectTaskSkills(repoSkills, 'Do something generic', undefined, 2)
    expect(result).toHaveLength(2)
  })

  test('uses prompt text for keyword matching', () => {
    const repoSkills = ['vitest', 'react-best-practices']
    // Title does not contain 'test', but prompt does
    const result = selectTaskSkills(repoSkills, 'Improve code quality', 'Write comprehensive test coverage')
    expect(result).toContain('vitest')
  })

  test('keyword matching is case-insensitive', () => {
    const repoSkills = ['rapier3d-physics']
    const result = selectTaskSkills(repoSkills, 'Add Physics simulation')
    expect(result).toContain('rapier3d-physics')
  })

  test('matches multiple keywords at once', () => {
    const repoSkills = ['vitest', 'react-best-practices', 'threejs-shaders']
    const result = selectTaskSkills(repoSkills, 'Test the shader component')
    expect(result).toContain('vitest')
    expect(result).toContain('threejs-shaders')
  })
})
