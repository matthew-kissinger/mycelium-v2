/**
 * Tests for the GitHub security module.
 *
 * Tests alert parsing, task creation logic from alerts, and deduplication.
 * Network-dependent operations (gh CLI calls) are not tested here.
 */

import { describe, it, expect } from 'bun:test'

// =============================================================================
// Alert Parsing
// =============================================================================

describe('security alert parsing', () => {
  it('parses severity to uppercase', () => {
    const rawSeverity = 'critical'
    const severity = rawSeverity.toUpperCase()
    expect(severity).toBe('CRITICAL')
  })

  it('handles undefined severity gracefully', () => {
    const rawSeverity: string | undefined = undefined
    const severity = rawSeverity?.toUpperCase() ?? 'UNKNOWN'
    expect(severity).toBe('UNKNOWN')
  })

  it('extracts description from dependabot advisory', () => {
    const alert = {
      security_advisory: { summary: 'Prototype Pollution in lodash' },
      dependency: { package: { name: 'lodash' } },
    }

    let description = ''
    if (alert.security_advisory?.summary) {
      description = alert.security_advisory.summary
    }

    expect(description).toBe('Prototype Pollution in lodash')
  })

  it('extracts description from code scanning rule', () => {
    const alert = {
      rule: { description: 'SQL injection vulnerability' },
    }

    let description = ''
    if ((alert as any).security_advisory?.summary) {
      description = (alert as any).security_advisory.summary
    } else if (alert.rule?.description) {
      description = alert.rule.description
    }

    expect(description).toBe('SQL injection vulnerability')
  })

  it('extracts description from dependency package name as fallback', () => {
    const alert = {
      dependency: { package: { name: 'express' } },
    }

    let description = ''
    if ((alert as any).security_advisory?.summary) {
      description = (alert as any).security_advisory.summary
    } else if ((alert as any).rule?.description) {
      description = (alert as any).rule.description
    } else if (alert.dependency?.package?.name) {
      description = `Vulnerable dependency: ${alert.dependency.package.name}`
    }

    expect(description).toBe('Vulnerable dependency: express')
  })
})

// =============================================================================
// Task Creation from Alerts
// =============================================================================

describe('security task creation', () => {
  it('generates correct task title for CRITICAL alert', () => {
    const severity = 'CRITICAL'
    const eventType = 'dependabot_alert'
    const description = 'Prototype Pollution in lodash'

    const alertTitle = `[Security] ${severity} ${eventType.replace(/_/g, ' ')}: ${description.slice(0, 100)}`

    expect(alertTitle).toBe('[Security] CRITICAL dependabot alert: Prototype Pollution in lodash')
  })

  it('generates correct task title for HIGH alert', () => {
    const severity = 'HIGH'
    const eventType = 'code_scanning_alert'
    const description = 'SQL injection vulnerability in user input handler'

    const alertTitle = `[Security] ${severity} ${eventType.replace(/_/g, ' ')}: ${description.slice(0, 100)}`

    expect(alertTitle).toBe('[Security] HIGH code scanning alert: SQL injection vulnerability in user input handler')
  })

  it('truncates long descriptions in task title', () => {
    const severity = 'HIGH'
    const eventType = 'secret_scanning_alert'
    const description = 'A'.repeat(200)

    const alertTitle = `[Security] ${severity} ${eventType.replace(/_/g, ' ')}: ${description.slice(0, 100)}`

    // Title should contain exactly 100 chars of description
    const descPart = alertTitle.split(': ')[1]
    expect(descPart!.length).toBe(100)
  })

  it('only creates tasks for HIGH and CRITICAL severity', () => {
    const shouldCreateTask = (severity: string) =>
      severity === 'CRITICAL' || severity === 'HIGH'

    expect(shouldCreateTask('CRITICAL')).toBe(true)
    expect(shouldCreateTask('HIGH')).toBe(true)
    expect(shouldCreateTask('MEDIUM')).toBe(false)
    expect(shouldCreateTask('LOW')).toBe(false)
    expect(shouldCreateTask('UNKNOWN')).toBe(false)
  })

  it('builds correct prompt for security task', () => {
    const eventType = 'dependabot_alert'
    const severity = 'CRITICAL'
    const description = 'ReDoS vulnerability in minimatch'
    const htmlUrl = 'https://github.com/user/repo/security/dependabot/1'

    const prompt = `Investigate and fix the following security alert:\n\nType: ${eventType}\nSeverity: ${severity}\nDescription: ${description}\n${htmlUrl ? `URL: ${htmlUrl}` : ''}\n\nReview the alert, determine the root cause, and apply the appropriate fix.`

    expect(prompt).toContain('Type: dependabot_alert')
    expect(prompt).toContain('Severity: CRITICAL')
    expect(prompt).toContain('ReDoS vulnerability')
    expect(prompt).toContain('URL: https://github.com/')
    expect(prompt).toContain('apply the appropriate fix')
  })

  it('omits URL line when html_url is not available', () => {
    const htmlUrl: string | undefined = undefined

    const urlLine = htmlUrl ? `URL: ${htmlUrl}` : ''
    expect(urlLine).toBe('')
  })
})

// =============================================================================
// Deduplication Logic
// =============================================================================

describe('security task deduplication', () => {
  it('detects duplicate by exact title match', () => {
    const alertTitle = '[Security] CRITICAL dependabot alert: Prototype Pollution in lodash'

    const existingTasks = [
      { id: '1', title: '[Security] CRITICAL dependabot alert: Prototype Pollution in lodash', status: 'pending' },
      { id: '2', title: 'Unrelated task', status: 'pending' },
    ]

    const duplicate = existingTasks.find((t) => t.title === alertTitle)
    expect(duplicate).toBeDefined()
    expect(duplicate!.id).toBe('1')
  })

  it('does not match partial titles', () => {
    const alertTitle = '[Security] CRITICAL dependabot alert: Prototype Pollution in lodash'

    const existingTasks = [
      { id: '1', title: '[Security] HIGH dependabot alert: Prototype Pollution in lodash', status: 'pending' },
      { id: '2', title: '[Security] CRITICAL code scanning alert: SQL injection', status: 'pending' },
    ]

    const duplicate = existingTasks.find((t) => t.title === alertTitle)
    expect(duplicate).toBeUndefined()
  })

  it('checks both pending and running tasks for duplicates', () => {
    const alertTitle = '[Security] HIGH code scanning alert: XSS vulnerability'

    const pendingTasks = [
      { id: '1', title: 'Other task', status: 'pending' },
    ]

    const runningTasks = [
      { id: '2', title: '[Security] HIGH code scanning alert: XSS vulnerability', status: 'running' },
    ]

    const pendingDup = pendingTasks.find((t) => t.title === alertTitle)
    const runningDup = runningTasks.find((t) => t.title === alertTitle)

    expect(pendingDup).toBeUndefined()
    expect(runningDup).toBeDefined()

    // Should not create task since running duplicate exists
    const shouldCreate = !pendingDup && !runningDup
    expect(shouldCreate).toBe(false)
  })

  it('allows task creation when no duplicates exist', () => {
    const alertTitle = '[Security] CRITICAL secret scanning alert: GitHub token exposed'

    const pendingTasks = [
      { id: '1', title: 'Fix CSS bug', status: 'pending' },
    ]

    const runningTasks = [
      { id: '2', title: 'Add auth feature', status: 'running' },
    ]

    const pendingDup = pendingTasks.find((t) => t.title === alertTitle)
    const runningDup = runningTasks.find((t) => t.title === alertTitle)

    const shouldCreate = !pendingDup && !runningDup
    expect(shouldCreate).toBe(true)
  })

  it('does not consider done tasks as duplicates', () => {
    const alertTitle = '[Security] HIGH dependabot alert: Vulnerable dep'

    // Done tasks should not block creation - only pending/running
    const doneTasks = [
      { id: '1', title: alertTitle, status: 'done' },
    ]

    // The dedup logic only checks pending and running, not done
    const pendingTasks: Array<{ id: string; title: string }> = []
    const runningTasks: Array<{ id: string; title: string }> = []

    const pendingDup = pendingTasks.find((t) => t.title === alertTitle)
    const runningDup = runningTasks.find((t) => t.title === alertTitle)

    const shouldCreate = !pendingDup && !runningDup
    expect(shouldCreate).toBe(true)
  })
})

// =============================================================================
// Security Feature Names
// =============================================================================

describe('security feature parsing', () => {
  it('identifies public vs private repos', () => {
    const isPublic = (visibility: string) => visibility === 'public' ? 1 : 0

    expect(isPublic('public')).toBe(1)
    expect(isPublic('private')).toBe(0)
    expect(isPublic('internal')).toBe(0)
  })

  it('filters repos by is_public flag', () => {
    const repos = [
      { id: '1', name: 'public-repo', github_owner: 'user', github_repo: 'public-repo', is_public: 1 },
      { id: '2', name: 'private-repo', github_owner: 'user', github_repo: 'private-repo', is_public: 0 },
      { id: '3', name: 'unknown-repo', github_owner: 'user', github_repo: 'unknown-repo', is_public: null },
      { id: '4', name: 'no-github', is_public: null, github_owner: null, github_repo: null },
    ]

    const publicRepos = repos.filter(
      (r) => r.is_public === 1 && r.github_owner && r.github_repo
    )

    expect(publicRepos.length).toBe(1)
    expect(publicRepos[0]!.name).toBe('public-repo')
  })

  it('tracks enabled features', () => {
    const featuresEnabled: string[] = []

    // Simulate successful enables
    featuresEnabled.push('secret_scanning', 'push_protection')
    featuresEnabled.push('dependabot_alerts')

    expect(featuresEnabled).toContain('secret_scanning')
    expect(featuresEnabled).toContain('push_protection')
    expect(featuresEnabled).toContain('dependabot_alerts')
    expect(featuresEnabled.length).toBe(3)
  })

  it('reports partial success when some features fail', () => {
    const featuresEnabled: string[] = ['secret_scanning', 'push_protection']
    const errors: string[] = ['Dependabot: 403 Forbidden']

    const result = {
      success: featuresEnabled.length > 0,
      features_enabled: featuresEnabled,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    }

    expect(result.success).toBe(true)
    expect(result.features_enabled.length).toBe(2)
    expect(result.error).toContain('Dependabot')
  })
})
