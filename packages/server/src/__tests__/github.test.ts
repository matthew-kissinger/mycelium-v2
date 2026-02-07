/**
 * Tests for the GitHub client module.
 *
 * Tests repo slug parsing, PR body building, and label constants.
 * Network-dependent operations (gh CLI calls) are not tested here.
 */

import { describe, it, expect } from 'bun:test'
import { formatSlug, type RepoSlug } from '../github/client'
import { buildPRBody, AGENT_LABELS, type PRInfo } from '../github/pr'

// =============================================================================
// formatSlug
// =============================================================================

describe('formatSlug', () => {
  it('formats owner/repo correctly', () => {
    const slug: RepoSlug = { owner: 'matthew-kissinger', repo: 'mycelium-v2' }
    expect(formatSlug(slug)).toBe('matthew-kissinger/mycelium-v2')
  })

  it('handles single-word owner and repo', () => {
    const slug: RepoSlug = { owner: 'user', repo: 'repo' }
    expect(formatSlug(slug)).toBe('user/repo')
  })
})

// =============================================================================
// buildPRBody
// =============================================================================

describe('buildPRBody', () => {
  it('builds a basic PR body with required fields', () => {
    const body = buildPRBody({
      taskId: 'abc12345-full-uuid-here',
      taskTitle: 'Fix CSS layout bug',
      agent: 'claude',
    })

    expect(body).toContain('## Task: Fix CSS layout bug')
    expect(body).toContain('`abc12345`')
    expect(body).toContain('claude')
    expect(body).toContain('mycelium')
  })

  it('includes optional fields when provided', () => {
    const body = buildPRBody({
      taskId: 'def67890-full-uuid-here',
      taskTitle: 'Add auth system',
      agent: 'codex',
      model: 'gpt-5.2-codex',
      duration: 45.5,
      cost: 0.0123,
      diffStat: ' 3 files changed, 150 insertions(+), 20 deletions(-)',
    })

    expect(body).toContain('codex/gpt-5.2-codex')
    expect(body).toContain('46s')
    expect(body).toContain('$0.0123')
    expect(body).toContain('3 files changed')
    expect(body).toContain('## Changes')
  })

  it('includes evaluation reason when provided', () => {
    const body = buildPRBody({
      taskId: 'ghi11111-full-uuid-here',
      taskTitle: 'Refactor tests',
      agent: 'gemini',
      evaluationReason: 'Code quality is excellent, all tests pass.',
    })

    expect(body).toContain('## Shepherd Evaluation')
    expect(body).toContain('Code quality is excellent')
  })
})

// =============================================================================
// AGENT_LABELS
// =============================================================================

describe('AGENT_LABELS', () => {
  it('has 4 standard labels', () => {
    expect(AGENT_LABELS.length).toBe(4)
  })

  it('includes mycelium label', () => {
    const mycelium = AGENT_LABELS.find(l => l.name === 'mycelium')
    expect(mycelium).toBeDefined()
    expect(mycelium!.color).toBe('7B61FF')
  })

  it('includes auto-merge label', () => {
    const autoMerge = AGENT_LABELS.find(l => l.name === 'auto-merge')
    expect(autoMerge).toBeDefined()
  })

  it('includes needs-review label', () => {
    const needsReview = AGENT_LABELS.find(l => l.name === 'needs-review')
    expect(needsReview).toBeDefined()
  })

  it('includes rejected label', () => {
    const rejected = AGENT_LABELS.find(l => l.name === 'rejected')
    expect(rejected).toBeDefined()
  })
})
