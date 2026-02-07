/**
 * Health tracking and error extraction tests.
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  extractError,
  recordSuccess,
  recordFailure,
  isAgentAvailable,
  resetHealth,
  getAllHealth,
  getHealthSummary,
} from './health'

// =============================================================================
// extractError
// =============================================================================

describe('extractError', () => {
  // Gemini quota
  test('parses Gemini quota reset time', () => {
    const output = 'Error: Your quota will reset after 2h15m30s. Please wait.'
    const result = extractError('gemini', output)
    expect(result.errorType).toBe('quota')
    expect(result.error).toContain('Quota exceeded')
    expect(result.quotaResetMs).toBeDefined()
    // 2h 15m 30s = (2*3600 + 15*60 + 30) * 1000
    expect(result.quotaResetMs).toBe((2 * 3600 + 15 * 60 + 30) * 1000)
  })

  test('detects Gemini 429 / TerminalQuotaError', () => {
    const result = extractError('gemini', 'TerminalQuotaError: resource exhausted')
    expect(result.errorType).toBe('quota')
    expect(result.error).toContain('quota')
  })

  test('detects Gemini code 429', () => {
    const result = extractError('gemini', 'Request failed with code: 429')
    expect(result.errorType).toBe('quota')
  })

  // Timeout
  test('detects [TIMEOUT] marker', () => {
    const result = extractError('claude', 'Some output...\n[TIMEOUT] Task exceeded limit')
    expect(result.errorType).toBe('timeout')
    expect(result.error).toContain('timed out')
  })

  test('does not false-positive on generic timeout word', () => {
    const result = extractError('claude', 'Set --timeout 300 for the process')
    expect(result.errorType).not.toBe('timeout')
  })

  // Claude API error
  test('parses Claude API error with JSON', () => {
    const output = 'API Error: 529 {"error":{"message":"Server overloaded"}}'
    const result = extractError('claude', output)
    expect(result.errorType).toBe('api_error')
    expect(result.error).toContain('529')
    expect(result.error).toContain('Server overloaded')
  })

  test('parses Claude API error without valid JSON', () => {
    const output = 'API Error: 500 {invalid json}'
    const result = extractError('claude', output)
    expect(result.errorType).toBe('api_error')
    expect(result.error).toContain('500')
  })

  // Cline errors
  test('detects Cline process crash', () => {
    const output = 'Starting...\nCleaning up core process\nCleaning up host process'
    const result = extractError('cline', output)
    expect(result.errorType).toBe('crash')
    expect(result.error).toContain('crashed')
  })

  test('detects Cline conversation error', () => {
    const output = 'Conversation session had an error.'
    const result = extractError('cline', output)
    expect(result.errorType).toBe('api_error')
    expect(result.error).toContain('Conversation')
  })

  // Zombie/orphan detection
  test('detects zombie process', () => {
    const result = extractError('claude', 'Zombie process detected')
    expect(result.errorType).toBe('crash')
  })

  test('detects orphaned process', () => {
    const result = extractError('claude', 'Orphaned run cleanup')
    expect(result.errorType).toBe('crash')
  })

  // Codex
  test('detects Codex usage limit (429)', () => {
    const output = 'Error: usage_limit_reached, resets_at: 2026-02-06T00:00:00Z'
    const result = extractError('codex', output)
    expect(result.errorType).toBe('quota')
    expect(result.error).toContain('usage limit')
  })

  test('parses Codex quota reset time', () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString()
    const output = `Error: usage_limit_reached, resets_at: ${futureDate}`
    const result = extractError('codex', output)
    expect(result.errorType).toBe('quota')
    expect(result.quotaResetMs).toBeDefined()
    expect(result.quotaResetMs).toBeGreaterThan(0)
  })

  test('detects Codex model not supported', () => {
    const output = "Error: model is not supported for this request"
    const result = extractError('codex', output)
    expect(result.errorType).toBe('api_error')
    expect(result.error).toContain('not supported')
  })

  // Rate limiting (generic)
  test('detects generic rate limit', () => {
    const result = extractError('cline', 'rate limit exceeded, retry later')
    expect(result.errorType).toBe('quota')
  })

  // Groq
  test('detects Groq rate limit with wait time', () => {
    const output = 'Rate limit reached. Please try again in 42.5s'
    const result = extractError('groq', output)
    expect(result.errorType).toBe('quota')
    expect(result.quotaResetMs).toBe(42500)
  })

  // Copilot
  test('detects Copilot GH_TOKEN error', () => {
    const result = extractError('copilot', 'Error: GH_TOKEN is not set')
    expect(result.errorType).toBe('api_error')
    expect(result.error).toContain('GH_TOKEN')
  })

  // Pi / OpenRouter
  test('detects missing API key', () => {
    const result = extractError('pi', 'OPENROUTER_API_KEY is not configured')
    expect(result.errorType).toBe('api_error')
    expect(result.error).toContain('API key')
  })

  // Vibe / Mistral
  test('detects Mistral auth failure', () => {
    const result = extractError('vibe', 'Unauthorized access')
    expect(result.errorType).toBe('api_error')
    expect(result.error).toContain('Mistral')
  })

  test('detects MISTRAL_API_KEY error', () => {
    const result = extractError('vibe', 'MISTRAL_API_KEY not found')
    expect(result.errorType).toBe('api_error')
  })

  // Kiro
  test('detects Kiro tool approval error', () => {
    const output = 'Tool approval required. Use --trust-all-tools to skip.'
    const result = extractError('kiro', output)
    expect(result.errorType).toBe('api_error')
    expect(result.error).toContain('--trust-all-tools')
  })

  test('detects Kiro SSO session expiry', () => {
    const result = extractError('kiro', 'SSO session expired. Please re-authenticate.')
    expect(result.errorType).toBe('api_error')
    expect(result.error).toContain('SSO')
  })

  // OpenCode
  test('detects OpenCode model not found', () => {
    const result = extractError('opencode', 'Error: model not found')
    expect(result.errorType).toBe('api_error')
    expect(result.error).toContain('model not available')
  })

  // Cerebras - uses pi agent with 'Too Many Requests' to reach cerebras-specific handler
  test('detects Cerebras rate limit via pi agent', () => {
    // Must not include generic '429' or 'rate limit' to reach the cerebras-specific handler
    const output = 'cerebras provider: Too Many Requests'
    const result = extractError('pi', output)
    expect(result.errorType).toBe('quota')
    expect(result.quotaResetMs).toBe(60000)
  })

  // Generic / fallback
  test('extracts first error-like line for unknown errors', () => {
    const output = 'Starting...\nConnecting...\nFatal error: disk full\nCleaning up...'
    const result = extractError('claude', output)
    expect(result.errorType).toBe('unknown')
    expect(result.error).toContain('disk full')
  })

  test('uses short output directly when under 300 chars', () => {
    const output = 'Segfault'
    const result = extractError('claude', output)
    expect(result.error).toBe('Segfault')
    expect(result.errorType).toBe('unknown')
  })

  test('uses last 200 chars when no error line found in long output', () => {
    const output = 'line 1\n'.repeat(100) + 'final output here'
    const result = extractError('claude', output)
    expect(result.errorType).toBe('unknown')
    // Should contain something from the tail
    expect(result.error.length).toBeLessThanOrEqual(200)
  })

  test('handles empty output', () => {
    const result = extractError('claude', '')
    expect(result.error).toBeDefined()
    expect(result.errorType).toBe('unknown')
  })
})

// =============================================================================
// recordSuccess
// =============================================================================

describe('recordSuccess', () => {
  beforeEach(() => {
    resetHealth()
  })

  test('increments success count', () => {
    recordSuccess('claude', 'sonnet')
    recordSuccess('claude', 'sonnet')

    const health = getAllHealth()
    const entry = health.find(h => h.agent === 'claude' && h.model === 'sonnet')
    expect(entry).toBeDefined()
    expect(entry!.successCount).toBe(2)
  })

  test('resets degraded status to healthy', () => {
    // First cause degraded state by recording failures
    recordFailure('claude', 'sonnet', 'error 1')
    recordFailure('claude', 'sonnet', 'error 2')
    recordFailure('claude', 'sonnet', 'error 3')
    recordFailure('claude', 'sonnet', 'error 4')

    const beforeHealth = getAllHealth().find(h => h.agent === 'claude' && h.model === 'sonnet')
    expect(beforeHealth!.status).toBe('degraded')

    // Success should reset
    recordSuccess('claude', 'sonnet')
    const afterHealth = getAllHealth().find(h => h.agent === 'claude' && h.model === 'sonnet')
    expect(afterHealth!.status).toBe('healthy')
  })

  test('clears quota exceeded on success', () => {
    // Force quota exceeded state
    recordFailure('gemini', 'flash', 'Your quota will reset after 1h0m0s')

    const before = getAllHealth().find(h => h.agent === 'gemini' && h.model === 'flash')
    expect(before!.status).toBe('quota_exceeded')

    recordSuccess('gemini', 'flash')
    const after = getAllHealth().find(h => h.agent === 'gemini' && h.model === 'flash')
    expect(after!.status).toBe('healthy')
  })

  test('tracks lastSuccessAt', () => {
    recordSuccess('claude', 'haiku')
    const entry = getAllHealth().find(h => h.agent === 'claude' && h.model === 'haiku')
    expect(entry!.lastSuccessAt).toBeDefined()
  })
})

// =============================================================================
// recordFailure
// =============================================================================

describe('recordFailure', () => {
  beforeEach(() => {
    resetHealth()
  })

  test('increments error count', () => {
    recordFailure('claude', 'sonnet', 'error')
    recordFailure('claude', 'sonnet', 'another error')

    const health = getAllHealth().find(h => h.agent === 'claude' && h.model === 'sonnet')
    expect(health!.errorCount).toBe(2)
  })

  test('sets quota_exceeded for quota errors', () => {
    const result = recordFailure('gemini', 'flash', 'Your quota will reset after 2h0m0s')
    expect(result.shouldBackoff).toBe(true)
    expect(result.backoffMs).toBeDefined()

    const health = getAllHealth().find(h => h.agent === 'gemini' && h.model === 'flash')
    expect(health!.status).toBe('quota_exceeded')
  })

  test('returns extracted error message', () => {
    const result = recordFailure('claude', 'sonnet', '[TIMEOUT] Task exceeded time limit')
    expect(result.error).toContain('timed out')
    expect(result.shouldBackoff).toBe(false)
  })

  test('sets degraded after 4+ failures', () => {
    for (let i = 0; i < 4; i++) {
      recordFailure('cursor', 'composer-1', `error ${i}`)
    }

    const health = getAllHealth().find(h => h.agent === 'cursor' && h.model === 'composer-1')
    expect(health!.status).toBe('degraded')
  })

  test('does not set degraded with 3 or fewer failures', () => {
    for (let i = 0; i < 3; i++) {
      recordFailure('cursor', 'composer-1', `error ${i}`)
    }

    const health = getAllHealth().find(h => h.agent === 'cursor' && h.model === 'composer-1')
    expect(health!.status).toBe('healthy')
  })
})

// =============================================================================
// isAgentAvailable
// =============================================================================

describe('isAgentAvailable', () => {
  beforeEach(() => {
    resetHealth()
  })

  test('returns available for healthy agent', () => {
    const result = isAgentAvailable('claude', 'sonnet')
    expect(result.available).toBe(true)
  })

  test('returns available for unknown agent (no health data)', () => {
    const result = isAgentAvailable('totally-new-agent')
    expect(result.available).toBe(true)
  })

  test('returns unavailable during quota backoff', () => {
    // Set quota exceeded with future reset time
    recordFailure('gemini', 'flash', 'Your quota will reset after 1h0m0s')

    const result = isAgentAvailable('gemini', 'flash')
    expect(result.available).toBe(false)
    expect(result.reason).toContain('Quota exceeded')
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  test('returns available after quota reset time passes', () => {
    // Manually set quota with past reset time
    recordFailure('gemini', 'flash', 'Your quota will reset after 0h0m0s')

    // The resetMs would be 0, so it should be available already
    // This is a tricky case because 0s means it's already reset
    const result = isAgentAvailable('gemini', 'flash')
    // With 0 reset time, the quota should have reset
    expect(result.available).toBe(true)
  })

  test('returns available for degraded agent (degraded != unavailable)', () => {
    // Degrade the agent
    for (let i = 0; i < 5; i++) {
      recordFailure('codex', 'gpt-5.2-codex', `error ${i}`)
    }

    const health = getAllHealth().find(h => h.agent === 'codex' && h.model === 'gpt-5.2-codex')
    expect(health!.status).toBe('degraded')

    // Degraded agents are still available
    const result = isAgentAvailable('codex', 'gpt-5.2-codex')
    expect(result.available).toBe(true)
  })
})

// =============================================================================
// getHealthSummary
// =============================================================================

describe('getHealthSummary', () => {
  beforeEach(() => {
    resetHealth()
  })

  test('returns empty object when no health data', () => {
    const summary = getHealthSummary()
    expect(Object.keys(summary)).toHaveLength(0)
  })

  test('includes agent health state after recording', () => {
    recordSuccess('claude', 'sonnet')
    recordFailure('gemini', 'flash', 'some error')

    const summary = getHealthSummary()
    expect(summary['claude/sonnet']).toBeDefined()
    expect(summary['claude/sonnet'].status).toBe('healthy')
    expect(summary['claude/sonnet'].successCount).toBe(1)

    expect(summary['gemini/flash']).toBeDefined()
    expect(summary['gemini/flash'].errorCount).toBe(1)
    expect(summary['gemini/flash'].lastError).toBeDefined()
  })
})

// =============================================================================
// resetHealth
// =============================================================================

describe('resetHealth', () => {
  test('resets specific agent', () => {
    recordSuccess('claude', 'sonnet')
    recordSuccess('gemini', 'flash')

    resetHealth('claude', 'sonnet')

    const health = getAllHealth()
    expect(health.find(h => h.agent === 'claude' && h.model === 'sonnet')).toBeUndefined()
    expect(health.find(h => h.agent === 'gemini' && h.model === 'flash')).toBeDefined()
  })

  test('resets all when no agent specified', () => {
    recordSuccess('claude', 'sonnet')
    recordSuccess('gemini', 'flash')

    resetHealth()

    const health = getAllHealth()
    expect(health).toHaveLength(0)
  })
})
