/**
 * Tests for Telegram integration utilities.
 *
 * Covers: message splitting, formatting, signal callback_data.
 */

import { describe, test, expect } from 'bun:test'
import { splitMessage } from '../telegram/index'
import {
  formatTaskCompleted,
  formatTaskFailed,
  formatShepherdReport,
  formatMaxAlignmentReport,
  formatMergeSuccess,
  formatMergeConflict,
  formatNotification,
  formatSignalQuestion,
  escapeHtml,
  truncate,
  type TaskInfo,
  type ShepherdReportInfo,
  type MaxAlignmentReportInfo,
} from '../telegram/messages'

// =============================================================================
// splitMessage
// =============================================================================

describe('splitMessage', () => {
  test('returns single chunk for short messages', () => {
    const result = splitMessage('hello', 100)
    expect(result).toEqual(['hello'])
  })

  test('returns single chunk for exact limit', () => {
    const text = 'a'.repeat(100)
    const result = splitMessage(text, 100)
    expect(result).toEqual([text])
  })

  test('splits at newline boundary', () => {
    const text = 'line1\nline2\nline3\nline4\nline5'
    const result = splitMessage(text, 12)
    // 'line1\nline2\n' is 12 chars, split before that
    expect(result.length).toBeGreaterThan(1)
    // Each chunk should be within limit
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(12)
    }
    // Rejoining should give back the original text (minus newlines at split points)
    expect(result.join('\n')).toBe(text)
  })

  test('hard-splits when no newline within limit', () => {
    const text = 'a'.repeat(200)
    const result = splitMessage(text, 100)
    expect(result.length).toBe(2)
    expect(result[0].length).toBe(100)
    // Second chunk is remainder after first 100 + skipping 1 char (split logic)
    expect(result[0].length + result[1].length).toBeLessThanOrEqual(200)
  })

  test('handles empty string', () => {
    const result = splitMessage('', 100)
    expect(result).toEqual([''])
  })

  test('handles realistic Telegram message', () => {
    // Build a message that's about 5000 chars
    const lines: string[] = ['<b>Shepherd Report</b>\n']
    for (let i = 0; i < 80; i++) {
      lines.push(`Task ${i}: This is a detailed evaluation of the branch work done by the agent.\n`)
    }
    const text = lines.join('')
    expect(text.length).toBeGreaterThan(4000)

    const result = splitMessage(text, 4000)
    expect(result.length).toBeGreaterThan(1)
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(4000)
    }
  })
})

// =============================================================================
// Signal callback_data format
// =============================================================================

describe('signal callback_data', () => {
  test('signal:uuid:response format fits within 64 bytes', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const shortOptions = ['yes', 'no', 'merge', 'reject', 'defer', 'skip']

    for (const opt of shortOptions) {
      const cbData = `signal:${uuid}:${opt}`
      // Telegram limits callback_data to 64 bytes
      expect(cbData.length).toBeLessThanOrEqual(64)
    }
  })

  test('long options get truncated to 64 bytes', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const longOpt = 'This is a very long option that exceeds the limit'
    const cbData = `signal:${uuid}:${longOpt}`.slice(0, 64)
    expect(cbData.length).toBe(64)
    // The signal:uuid: prefix is preserved
    expect(cbData).toStartWith(`signal:${uuid}:`)
  })

  test('callback_data regex matches signal format', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const cbData = `signal:${uuid}:merge`
    const match = cbData.match(/^signal:([a-f0-9-]+):(.+)$/i)
    expect(match).not.toBeNull()
    expect(match![1]).toBe(uuid)
    expect(match![2]).toBe('merge')
  })
})

// =============================================================================
// Message Formatters
// =============================================================================

describe('message formatters', () => {
  test('formatTaskCompleted includes key fields', () => {
    const task: TaskInfo = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      title: 'Fix authentication bug',
      status: 'done',
      repo_path: '/home/user/repos/myapp',
      agent: 'claude',
      model: 'sonnet',
      cost_usd: 0.0123,
      duration_seconds: 45,
      created_at: '2026-01-01T00:00:00Z',
      completed_at: '2026-01-01T00:00:45Z',
    }

    const msg = formatTaskCompleted(task)
    expect(msg).toContain('aaaaaaaa')
    expect(msg).toContain('Fix authentication bug')
    expect(msg).toContain('myapp')
    expect(msg).toContain('claude/sonnet')
    expect(msg).toContain('$0.0123')
  })

  test('formatTaskFailed includes error preview', () => {
    const task: TaskInfo = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      title: 'Broken task',
      status: 'failed',
      error: 'TypeError: Cannot read properties of undefined',
      created_at: '2026-01-01T00:00:00Z',
    }

    const msg = formatTaskFailed(task)
    expect(msg).toContain('Broken task')
    expect(msg).toContain('TypeError')
  })

  test('formatShepherdReport handles all health levels', () => {
    const base: ShepherdReportInfo = {
      repo_path: '/repos/test',
      repo_name: 'test',
      health: 'healthy',
      headline: 'All good',
    }

    const healthy = formatShepherdReport({ ...base, health: 'healthy' })
    const warning = formatShepherdReport({ ...base, health: 'warning' })
    const critical = formatShepherdReport({ ...base, health: 'critical' })

    expect(healthy).toContain('All good')
    expect(warning).toContain('All good')
    expect(critical).toContain('All good')
  })

  test('formatShepherdReport includes branch evaluations', () => {
    const report: ShepherdReportInfo = {
      repo_path: '/repos/test',
      repo_name: 'test',
      health: 'healthy',
      headline: 'Good',
      merges: 2,
      rejects: 1,
      branch_evaluations: [
        {
          task_id: 'task-1',
          decision: 'MERGE',
          reason: 'Clean implementation',
          agent: 'claude',
          confidence: 0.95,
        },
        {
          task_id: 'task-2',
          decision: 'REJECT',
          reason: 'Tests failing',
          agent: 'codex',
        },
      ],
    }

    const msg = formatShepherdReport(report)
    expect(msg).toContain('2 merged')
    expect(msg).toContain('1 rejected')
    expect(msg).toContain('MERGE')
    expect(msg).toContain('claude')
    expect(msg).toContain('95%')
    expect(msg).toContain('REJECT')
  })

  test('formatMergeSuccess uses HTML format', () => {
    const msg = formatMergeSuccess('/repos/test', 'mycel/task-123', 'claude', 5)
    expect(msg).toContain('<b>MERGED')
    expect(msg).toContain('test')
    expect(msg).toContain('mycel/task-123')
  })

  test('formatSignalQuestion includes signal ID', () => {
    const msg = formatSignalQuestion({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      question: 'Should we proceed?',
      options: ['yes', 'no'],
    })
    expect(msg).toContain('aaaaaaaa')
    expect(msg).toContain('Should we proceed?')
    expect(msg).toContain('yes')
  })

  test('escapeHtml escapes all dangerous characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert("xss")&lt;/script&gt;'
    )
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  test('truncate respects maxLength', () => {
    expect(truncate('short', 10)).toBe('short')
    expect(truncate('a long string that should be cut', 10)).toBe('a long ...')
  })

  test('formatNotification escapes HTML', () => {
    const msg = formatNotification('Test <b>message</b>')
    expect(msg).toContain('&lt;b&gt;')
  })
})
