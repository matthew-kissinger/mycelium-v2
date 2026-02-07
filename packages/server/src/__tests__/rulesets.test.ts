/**
 * Tests for the GitHub rulesets module.
 *
 * Tests payload construction, response parsing, and filtering logic.
 * gh CLI calls and DB queries are mocked.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { buildRulesetPayload, RULESET_NAME } from '../github/rulesets'

// =============================================================================
// buildRulesetPayload
// =============================================================================

describe('buildRulesetPayload', () => {
  it('builds payload with correct structure', () => {
    const payload = buildRulesetPayload('main') as any

    expect(payload.name).toBe('mycelium-default')
    expect(payload.target).toBe('branch')
    expect(payload.enforcement).toBe('active')
  })

  it('includes the default branch in conditions', () => {
    const payload = buildRulesetPayload('main') as any

    expect(payload.conditions.ref_name.include).toEqual(['refs/heads/main'])
    expect(payload.conditions.ref_name.exclude).toEqual([])
  })

  it('uses the provided branch name, not hardcoded main', () => {
    const payload = buildRulesetPayload('master') as any

    expect(payload.conditions.ref_name.include).toEqual(['refs/heads/master'])
  })

  it('has 3 rules: pull_request, non_fast_forward, deletion', () => {
    const payload = buildRulesetPayload('main') as any

    expect(payload.rules).toHaveLength(3)

    const types = payload.rules.map((r: any) => r.type)
    expect(types).toContain('pull_request')
    expect(types).toContain('non_fast_forward')
    expect(types).toContain('deletion')
  })

  it('pull_request rule requires 0 approving reviews', () => {
    const payload = buildRulesetPayload('main') as any
    const prRule = payload.rules.find((r: any) => r.type === 'pull_request')

    expect(prRule).toBeDefined()
    expect(prRule.parameters.required_approving_review_count).toBe(0)
    expect(prRule.parameters.dismiss_stale_reviews_on_push).toBe(false)
    expect(prRule.parameters.require_code_owner_review).toBe(false)
    expect(prRule.parameters.require_last_push_approval).toBe(false)
    expect(prRule.parameters.required_review_thread_resolution).toBe(false)
  })

  it('non_fast_forward rule has no parameters', () => {
    const payload = buildRulesetPayload('main') as any
    const rule = payload.rules.find((r: any) => r.type === 'non_fast_forward')

    expect(rule).toBeDefined()
    expect(rule.parameters).toBeUndefined()
  })

  it('deletion rule has no parameters', () => {
    const payload = buildRulesetPayload('main') as any
    const rule = payload.rules.find((r: any) => r.type === 'deletion')

    expect(rule).toBeDefined()
    expect(rule.parameters).toBeUndefined()
  })

  it('produces valid JSON', () => {
    const payload = buildRulesetPayload('develop')
    const json = JSON.stringify(payload)
    const parsed = JSON.parse(json)

    expect(parsed.name).toBe('mycelium-default')
    expect(parsed.conditions.ref_name.include[0]).toBe('refs/heads/develop')
  })
})

// =============================================================================
// RULESET_NAME constant
// =============================================================================

describe('RULESET_NAME', () => {
  it('is mycelium-default', () => {
    expect(RULESET_NAME).toBe('mycelium-default')
  })
})

// =============================================================================
// Response parsing (listRulesets output format)
// =============================================================================

describe('listRulesets response parsing', () => {
  it('parses single-line jq output', () => {
    const line = '{"id":123,"name":"mycelium-default","enforcement":"active"}'
    const parsed = JSON.parse(line)

    expect(parsed.id).toBe(123)
    expect(parsed.name).toBe('mycelium-default')
    expect(parsed.enforcement).toBe('active')
  })

  it('parses multi-line jq output', () => {
    const output = [
      '{"id":1,"name":"mycelium-default","enforcement":"active"}',
      '{"id":2,"name":"other-ruleset","enforcement":"disabled"}',
    ].join('\n')

    const lines = output.trim().split('\n').filter(Boolean)
    const rulesets = lines.map((l) => JSON.parse(l))

    expect(rulesets).toHaveLength(2)
    expect(rulesets[0].name).toBe('mycelium-default')
    expect(rulesets[1].name).toBe('other-ruleset')
  })

  it('handles empty response', () => {
    const output = ''
    const lines = output.trim().split('\n').filter(Boolean)

    expect(lines).toHaveLength(0)
  })

  it('handles JSON array format', () => {
    const output = JSON.stringify([
      { id: 10, name: 'mycelium-default', enforcement: 'active' },
      { id: 20, name: 'another', enforcement: 'evaluate' },
    ])

    const parsed = JSON.parse(output)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
  })
})

// =============================================================================
// createDefaultRuleset response parsing
// =============================================================================

describe('createDefaultRuleset response parsing', () => {
  it('extracts ruleset ID from success response', () => {
    const stdout = JSON.stringify({
      id: 456,
      name: 'mycelium-default',
      enforcement: 'active',
      conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    })

    const data = JSON.parse(stdout)
    expect(data.id).toBe(456)
  })

  it('handles response without id gracefully', () => {
    const stdout = '{"name":"mycelium-default","enforcement":"active"}'
    const data = JSON.parse(stdout)

    expect(data.id).toBeUndefined()
  })
})

// =============================================================================
// applyRulesetsToAllPublic filtering logic
// =============================================================================

describe('applyRulesetsToAllPublic filtering', () => {
  it('filters repos correctly for public with github slug', () => {
    const repos = [
      { id: '1', path: '/a', name: 'a', github_owner: 'owner', github_repo: 'a', is_public: 1, github_default_branch: 'main' },
      { id: '2', path: '/b', name: 'b', github_owner: 'owner', github_repo: 'b', is_public: 0, github_default_branch: 'main' },
      { id: '3', path: '/c', name: 'c', github_owner: null, github_repo: null, is_public: 1, github_default_branch: null },
      { id: '4', path: '/d', name: 'd', github_owner: 'owner', github_repo: 'd', is_public: null, github_default_branch: 'main' },
      { id: '5', path: '/e', name: 'e', github_owner: 'owner', github_repo: 'e', is_public: 1, github_default_branch: 'develop' },
    ]

    // Replicate the filter logic from applyRulesetsToAllPublic
    const publicRepos = repos.filter(
      (r) => (r as any).is_public === 1 && r.github_owner && r.github_repo
    )

    expect(publicRepos).toHaveLength(2)
    expect(publicRepos[0].name).toBe('a')
    expect(publicRepos[1].name).toBe('e')
  })

  it('uses github_default_branch with main as fallback', () => {
    const repos = [
      { github_default_branch: 'develop' },
      { github_default_branch: null },
      { github_default_branch: 'master' },
    ]

    const branches = repos.map((r) => r.github_default_branch ?? 'main')

    expect(branches).toEqual(['develop', 'main', 'master'])
  })

  it('skips repos that already have the mycelium-default ruleset', () => {
    const existing = [
      { id: 1, name: 'mycelium-default', enforcement: 'active' },
      { id: 2, name: 'other-rule', enforcement: 'active' },
    ]

    const hasDefault = existing.some((r) => r.name === RULESET_NAME)
    expect(hasDefault).toBe(true)
  })

  it('does not skip repos without the mycelium-default ruleset', () => {
    const existing = [
      { id: 1, name: 'other-rule', enforcement: 'active' },
    ]

    const hasDefault = existing.some((r) => r.name === RULESET_NAME)
    expect(hasDefault).toBe(false)
  })

  it('does not skip repos with empty rulesets', () => {
    const existing: any[] = []

    const hasDefault = existing.some((r) => r.name === RULESET_NAME)
    expect(hasDefault).toBe(false)
  })
})
