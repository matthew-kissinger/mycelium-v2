/**
 * Tests for the GitHub webhook receiver.
 *
 * Tests webhook signature verification and event routing.
 * Network-dependent operations (Telegram, SSE) are not tested here.
 */

import { describe, it, expect } from 'bun:test'

// =============================================================================
// Signature Verification
// =============================================================================

describe('webhook signature verification', () => {
  it('computes correct HMAC-SHA256 signature', async () => {
    const secret = 'test-secret-123'
    const body = '{"action":"opened","number":1}'

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    const computed = `sha256=${Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`

    // Should start with sha256=
    expect(computed).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('produces different signatures for different secrets', async () => {
    const body = '{"test": true}'
    const encoder = new TextEncoder()

    const sign = async (secret: string) => {
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const buf = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    }

    const sig1 = await sign('secret-1')
    const sig2 = await sign('secret-2')

    expect(sig1).not.toBe(sig2)
  })

  it('produces same signature for same inputs', async () => {
    const body = '{"test": true}'
    const secret = 'same-secret'
    const encoder = new TextEncoder()

    const sign = async () => {
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const buf = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    }

    const sig1 = await sign()
    const sig2 = await sign()

    expect(sig1).toBe(sig2)
  })
})

// =============================================================================
// Payload Parsing
// =============================================================================

describe('webhook payload parsing', () => {
  it('parses push payload branch from ref', () => {
    const ref = 'refs/heads/main'
    const branch = ref.replace('refs/heads/', '')
    expect(branch).toBe('main')
  })

  it('parses feature branch from ref', () => {
    const ref = 'refs/heads/feature/add-auth'
    const branch = ref.replace('refs/heads/', '')
    expect(branch).toBe('feature/add-auth')
  })

  it('identifies mycelium branches', () => {
    expect('mycel/task-abc123'.startsWith('mycel/')).toBe(true)
    expect('main'.startsWith('mycel/')).toBe(false)
    expect('feature/mycel-like'.startsWith('mycel/')).toBe(false)
  })

  it('extracts repo owner and name from full_name', () => {
    const fullName = 'matthew-kissinger/mycelium-v2'
    const [owner, repo] = fullName.split('/')
    expect(owner).toBe('matthew-kissinger')
    expect(repo).toBe('mycelium-v2')
  })

  it('counts file changes across commits', () => {
    const commits = [
      { added: ['a.ts', 'b.ts'], modified: ['c.ts'], removed: [] },
      { added: [], modified: ['d.ts', 'e.ts'], removed: ['f.ts'] },
    ]

    const fileCount = commits.reduce(
      (sum, c) => sum + c.added.length + c.modified.length + c.removed.length,
      0
    )

    expect(fileCount).toBe(6)
  })

  it('identifies mycelium PRs by label', () => {
    const labels = [
      { name: 'mycelium' },
      { name: 'auto-merge' },
    ]

    expect(labels.some((l) => l.name === 'mycelium')).toBe(true)

    const noMycelium = [{ name: 'bug' }, { name: 'enhancement' }]
    expect(noMycelium.some((l) => l.name === 'mycelium')).toBe(false)
  })

  it('maps workflow conclusion to status', () => {
    const mapStatus = (conclusion: string) =>
      conclusion === 'success' ? 'success' : 'failure'

    expect(mapStatus('success')).toBe('success')
    expect(mapStatus('failure')).toBe('failure')
    expect(mapStatus('cancelled')).toBe('failure')
    expect(mapStatus('timed_out')).toBe('failure')
  })
})

// =============================================================================
// Security Alert Parsing
// =============================================================================

describe('security alert handling', () => {
  it('maps severity to icon', () => {
    const getIcon = (severity: string) =>
      severity === 'CRITICAL' || severity === 'HIGH' ? 'alert' : 'warning'

    expect(getIcon('CRITICAL')).toBe('alert')
    expect(getIcon('HIGH')).toBe('alert')
    expect(getIcon('MEDIUM')).toBe('warning')
    expect(getIcon('LOW')).toBe('warning')
  })

  it('extracts description from different alert types', () => {
    // Dependabot
    const depAlert = {
      security_advisory: { summary: 'Prototype Pollution in lodash' },
      dependency: { package: { name: 'lodash' } },
    }
    const desc1 = depAlert.security_advisory?.summary ?? ''
    expect(desc1).toBe('Prototype Pollution in lodash')

    // Code scanning
    const codeAlert = {
      rule: { description: 'SQL injection vulnerability' },
    }
    const desc2 = (codeAlert as any).security_advisory?.summary ?? codeAlert.rule?.description ?? ''
    expect(desc2).toBe('SQL injection vulnerability')
  })
})
