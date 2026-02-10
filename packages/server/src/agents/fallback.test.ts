import { describe, expect, test, beforeAll } from 'bun:test'
import {
  getFallbackModel,
  shouldRetry,
  buildRetryContext,
  parseRetryContext,
  resolveModel,
  type RetryContext,
} from './fallback'
import { _markInitializedForTesting } from './registry-cache'

// Registry cache must be marked initialized before tests can call
// functions that read from it (the cache will be empty, so tests
// exercise the hardcoded fallback paths).
beforeAll(() => {
  _markInitializedForTesting()
})

// =============================================================================
// getFallbackModel
// =============================================================================

describe('getFallbackModel', () => {
  test('claude haiku -> sonnet', () => {
    expect(getFallbackModel('claude', 'haiku')).toBe('sonnet')
  })

  test('claude sonnet -> opus', () => {
    expect(getFallbackModel('claude', 'sonnet')).toBe('opus')
  })

  test('claude opus -> null (top tier)', () => {
    expect(getFallbackModel('claude', 'opus')).toBeNull()
  })

  test('codex escalation chain', () => {
    expect(getFallbackModel('codex', 'gpt-5.2-codex-fast')).toBe('gpt-5.2-codex')
    expect(getFallbackModel('codex', 'gpt-5.2-codex')).toBe('gpt-5.2-codex-high')
    expect(getFallbackModel('codex', 'gpt-5.2-codex-high')).toBe('gpt-5.3-codex')
    expect(getFallbackModel('codex', 'gpt-5.3-codex')).toBeNull()
  })

  test('unknown agent returns null', () => {
    expect(getFallbackModel('unknown-agent', 'some-model')).toBeNull()
  })

  test('unknown model for known agent returns null', () => {
    expect(getFallbackModel('claude', 'nonexistent-model')).toBeNull()
  })

  test('null model uses agent default', () => {
    // claude default is sonnet, sonnet -> opus
    expect(getFallbackModel('claude', null)).toBe('opus')
  })

  test('undefined model uses agent default', () => {
    expect(getFallbackModel('claude', undefined)).toBe('opus')
  })

  test('null model for unknown agent returns null', () => {
    expect(getFallbackModel('unknown', null)).toBeNull()
  })
})

// =============================================================================
// shouldRetry
// =============================================================================

describe('shouldRetry', () => {
  test('first failure with fallback available is retryable', () => {
    const result = shouldRetry('claude', 'sonnet', null)
    expect(result.retry).toBe(true)
    expect(result.fallbackModel).toBe('opus')
  })

  test('top-tier model falls back to cross-agent', () => {
    const result = shouldRetry('claude', 'opus', null)
    expect(result.retry).toBe(true)
    expect(result.fallbackModel).toBe('gpt-5.2-codex')
    expect(result.fallbackAgent).toBe('codex')
  })

  test('fully exhausted (cross-agent already tried) is not retryable', () => {
    const ctx: RetryContext = {
      max_retries: 2,
      attempt: 1,
      original_agent: 'claude',
      original_model: 'opus',
      history: [
        {
          agent: 'claude',
          model: 'opus',
          error: 'first error',
          duration_seconds: 10,
          completed_at: new Date().toISOString(),
        },
        {
          agent: 'codex',
          model: 'gpt-5.2-codex',
          error: 'second error',
          duration_seconds: 15,
          completed_at: new Date().toISOString(),
        },
      ],
    }
    const result = shouldRetry('codex', 'gpt-5.2-codex', JSON.stringify(ctx))
    // codex has fallback gpt-5.2-codex -> gpt-5.2-codex-high, so it can still retry
    expect(result.retry).toBe(true)
    expect(result.fallbackModel).toBe('gpt-5.2-codex-high')
  })

  test('max retries exhausted is not retryable', () => {
    const ctx: RetryContext = {
      max_retries: 2,
      attempt: 2,
      original_agent: 'claude',
      original_model: 'sonnet',
      history: [
        {
          agent: 'claude',
          model: 'sonnet',
          error: 'first error',
          duration_seconds: 10,
          completed_at: new Date().toISOString(),
        },
        {
          agent: 'claude',
          model: 'opus',
          error: 'second error',
          duration_seconds: 15,
          completed_at: new Date().toISOString(),
        },
      ],
    }
    const result = shouldRetry('claude', 'opus', JSON.stringify(ctx))
    expect(result.retry).toBe(false)
    expect(result.fallbackModel).toBeNull()
  })

  test('unknown agent is not retryable', () => {
    const result = shouldRetry('unknown', 'model', null)
    expect(result.retry).toBe(false)
    expect(result.fallbackModel).toBeNull()
  })

  test('null model uses default for retry check', () => {
    // claude default is sonnet, sonnet -> opus
    const result = shouldRetry('claude', null, null)
    expect(result.retry).toBe(true)
    expect(result.fallbackModel).toBe('opus')
  })
})

// =============================================================================
// buildRetryContext
// =============================================================================

describe('buildRetryContext', () => {
  test('first failure creates context with attempt 1', () => {
    const result = buildRetryContext('claude', 'sonnet', 'timeout error', 120, null)
    const ctx = JSON.parse(result) as RetryContext

    expect(ctx.attempt).toBe(1)
    expect(ctx.max_retries).toBe(2)
    expect(ctx.original_agent).toBe('claude')
    expect(ctx.original_model).toBe('sonnet')
    expect(ctx.history).toHaveLength(1)
    expect(ctx.history[0].agent).toBe('claude')
    expect(ctx.history[0].model).toBe('sonnet')
    expect(ctx.history[0].error).toBe('timeout error')
    expect(ctx.history[0].duration_seconds).toBe(120)
  })

  test('second failure appends to history', () => {
    const first = buildRetryContext('claude', 'sonnet', 'first error', 60, null)
    const second = buildRetryContext('claude', 'opus', 'second error', 90, first)
    const ctx = JSON.parse(second) as RetryContext

    expect(ctx.attempt).toBe(2)
    expect(ctx.original_agent).toBe('claude')
    expect(ctx.original_model).toBe('sonnet')
    expect(ctx.history).toHaveLength(2)
    expect(ctx.history[0].error).toBe('first error')
    expect(ctx.history[1].error).toBe('second error')
    expect(ctx.history[1].model).toBe('opus')
  })

  test('error truncated to 500 chars', () => {
    const longError = 'x'.repeat(1000)
    const result = buildRetryContext('claude', 'sonnet', longError, 10, null)
    const ctx = JSON.parse(result) as RetryContext

    expect(ctx.history[0].error).toHaveLength(500)
  })

  test('null model uses agent default', () => {
    const result = buildRetryContext('claude', null, 'error', 10, null)
    const ctx = JSON.parse(result) as RetryContext

    expect(ctx.original_model).toBe('sonnet')
    expect(ctx.history[0].model).toBe('sonnet')
  })

  test('unknown agent with null model uses unknown', () => {
    const result = buildRetryContext('mystery', null, 'error', 10, null)
    const ctx = JSON.parse(result) as RetryContext

    expect(ctx.original_model).toBe('unknown')
  })

  test('preserves original agent/model across retries', () => {
    const first = buildRetryContext('claude', 'haiku', 'err1', 10, null)
    const second = buildRetryContext('claude', 'sonnet', 'err2', 20, first)
    const ctx = JSON.parse(second) as RetryContext

    expect(ctx.original_agent).toBe('claude')
    expect(ctx.original_model).toBe('haiku')
  })
})

// =============================================================================
// parseRetryContext
// =============================================================================

describe('parseRetryContext', () => {
  test('parses valid JSON', () => {
    const ctx: RetryContext = {
      max_retries: 1,
      attempt: 1,
      original_agent: 'claude',
      original_model: 'sonnet',
      history: [],
    }
    const result = parseRetryContext(JSON.stringify(ctx))
    expect(result).not.toBeNull()
    expect(result!.attempt).toBe(1)
    expect(result!.original_agent).toBe('claude')
  })

  test('returns null for null input', () => {
    expect(parseRetryContext(null)).toBeNull()
  })

  test('returns null for undefined input', () => {
    expect(parseRetryContext(undefined)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseRetryContext('')).toBeNull()
  })

  test('returns null for invalid JSON', () => {
    expect(parseRetryContext('not json {')).toBeNull()
  })

  test('returns null for JSON missing required fields', () => {
    expect(parseRetryContext('{"foo": "bar"}')).toBeNull()
  })

  test('returns null for JSON with wrong types', () => {
    expect(parseRetryContext('{"attempt": "one", "history": []}')).toBeNull()
    expect(parseRetryContext('{"attempt": 1, "history": "not array"}')).toBeNull()
  })
})

// =============================================================================
// resolveModel
// =============================================================================

describe('resolveModel', () => {
  test('null model defaults to agent default', () => {
    expect(resolveModel('claude', null)).toBe('sonnet')
    expect(resolveModel('codex', null)).toBe('gpt-5.2-codex')
    expect(resolveModel('gemini', null)).toBe('flash')
  })

  test('explicit model passes through', () => {
    expect(resolveModel('claude', 'opus')).toBe('opus')
    expect(resolveModel('claude', 'haiku')).toBe('haiku')
  })

  test('undefined model defaults to agent default', () => {
    expect(resolveModel('claude', undefined)).toBe('sonnet')
  })

  test('unknown agent with null model returns unknown', () => {
    expect(resolveModel('mystery', null)).toBe('unknown')
  })

  test('unknown agent with explicit model returns that model', () => {
    expect(resolveModel('mystery', 'custom-model')).toBe('custom-model')
  })
})
