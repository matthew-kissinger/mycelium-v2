/**
 * GitHub Security Features
 *
 * Manages security scanning configuration for public repos:
 * - Secret scanning + push protection
 * - Dependabot alerts
 * - Code scanning alert queries
 *
 * Uses the `gh` CLI for all GitHub API interactions.
 */

import { runGh, formatSlug, type RepoSlug } from './client'
import { getRepos } from '../db/queries'

// =============================================================================
// Types
// =============================================================================

export interface SecurityAlert {
  number: number
  state: string
  severity: string
  description: string
  html_url: string | null
  type: 'code_scanning' | 'secret_scanning' | 'dependabot'
}

export interface SecuritySetupResult {
  owner: string
  repo: string
  success: boolean
  error?: string
  features_enabled: string[]
}

export interface SecurityAlertsResult {
  owner: string
  repo: string
  code_scanning: SecurityAlert[]
  secret_scanning: SecurityAlert[]
  dependabot: SecurityAlert[]
  errors: string[]
}

// =============================================================================
// Enable Security Features
// =============================================================================

/**
 * Enable secret scanning, push protection, and Dependabot on a GitHub repo.
 * Uses PATCH repos/{owner}/{repo} to toggle security features.
 *
 * Note: Some features require GitHub Advanced Security (GHAS) on private repos.
 * For public repos, these features are free.
 */
export async function enableSecurityFeatures(
  owner: string,
  repo: string
): Promise<SecuritySetupResult> {
  const slug = `${owner}/${repo}`
  const featuresEnabled: string[] = []
  const errors: string[] = []

  console.log(`[Security] Enabling security features on ${slug}...`)

  // Enable secret scanning + push protection
  const secretResult = await runGh([
    'api', '-X', 'PATCH', `repos/${slug}`,
    '-f', 'security_and_analysis[secret_scanning][status]=enabled',
    '-f', 'security_and_analysis[secret_scanning_push_protection][status]=enabled',
    '--silent',
  ])

  if (secretResult.success) {
    featuresEnabled.push('secret_scanning', 'push_protection')
    console.log(`[Security] ${slug}: secret scanning + push protection enabled`)
  } else {
    errors.push(`Secret scanning: ${secretResult.stderr}`)
    console.warn(`[Security] ${slug}: failed to enable secret scanning: ${secretResult.stderr}`)
  }

  // Enable Dependabot alerts via vulnerability-alerts endpoint
  const dependabotResult = await runGh([
    'api', '-X', 'PUT', `repos/${slug}/vulnerability-alerts`,
    '--silent',
  ])

  if (dependabotResult.success || dependabotResult.exitCode === 0) {
    featuresEnabled.push('dependabot_alerts')
    console.log(`[Security] ${slug}: Dependabot alerts enabled`)
  } else {
    errors.push(`Dependabot: ${dependabotResult.stderr}`)
    console.warn(`[Security] ${slug}: failed to enable Dependabot: ${dependabotResult.stderr}`)
  }

  return {
    owner,
    repo,
    success: featuresEnabled.length > 0,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    features_enabled: featuresEnabled,
  }
}

// =============================================================================
// Get Security Alerts
// =============================================================================

/**
 * Query all security alerts (code scanning, secret scanning, Dependabot) for a repo.
 * Returns structured results with per-category alerts and any errors.
 */
export async function getSecurityAlerts(
  owner: string,
  repo: string
): Promise<SecurityAlertsResult> {
  const slug = `${owner}/${repo}`
  const result: SecurityAlertsResult = {
    owner,
    repo,
    code_scanning: [],
    secret_scanning: [],
    dependabot: [],
    errors: [],
  }

  // Code scanning alerts
  const codeScanResult = await runGh([
    'api', `repos/${slug}/code-scanning/alerts`,
    '--jq', '.[] | {number, state, rule: .rule.description, severity: .rule.severity, html_url}',
  ])

  if (codeScanResult.success && codeScanResult.stdout) {
    try {
      const lines = codeScanResult.stdout.split('\n').filter(Boolean)
      for (const line of lines) {
        const alert = JSON.parse(line)
        result.code_scanning.push({
          number: alert.number,
          state: alert.state,
          severity: alert.severity ?? 'unknown',
          description: alert.rule ?? '',
          html_url: alert.html_url ?? null,
          type: 'code_scanning',
        })
      }
    } catch {
      // Try parsing as a single JSON array
      try {
        const alerts = JSON.parse(codeScanResult.stdout)
        if (Array.isArray(alerts)) {
          for (const alert of alerts) {
            result.code_scanning.push({
              number: alert.number,
              state: alert.state,
              severity: alert.severity ?? alert.rule?.severity ?? 'unknown',
              description: alert.rule?.description ?? alert.rule ?? '',
              html_url: alert.html_url ?? null,
              type: 'code_scanning',
            })
          }
        }
      } catch {
        result.errors.push(`Failed to parse code scanning alerts`)
      }
    }
  } else if (!codeScanResult.success && !codeScanResult.stderr.includes('no analysis found')) {
    result.errors.push(`Code scanning: ${codeScanResult.stderr}`)
  }

  // Secret scanning alerts
  const secretResult = await runGh([
    'api', `repos/${slug}/secret-scanning/alerts`,
    '--jq', '.[] | {number, state, secret_type: .secret_type, html_url}',
  ])

  if (secretResult.success && secretResult.stdout) {
    try {
      const lines = secretResult.stdout.split('\n').filter(Boolean)
      for (const line of lines) {
        const alert = JSON.parse(line)
        result.secret_scanning.push({
          number: alert.number,
          state: alert.state,
          severity: 'high',
          description: `Secret detected: ${alert.secret_type}`,
          html_url: alert.html_url ?? null,
          type: 'secret_scanning',
        })
      }
    } catch {
      try {
        const alerts = JSON.parse(secretResult.stdout)
        if (Array.isArray(alerts)) {
          for (const alert of alerts) {
            result.secret_scanning.push({
              number: alert.number,
              state: alert.state,
              severity: 'high',
              description: `Secret detected: ${alert.secret_type}`,
              html_url: alert.html_url ?? null,
              type: 'secret_scanning',
            })
          }
        }
      } catch {
        result.errors.push(`Failed to parse secret scanning alerts`)
      }
    }
  } else if (!secretResult.success && !secretResult.stderr.includes('Secret scanning is disabled')) {
    result.errors.push(`Secret scanning: ${secretResult.stderr}`)
  }

  // Dependabot alerts
  const depResult = await runGh([
    'api', `repos/${slug}/dependabot/alerts`,
    '--jq', '.[] | {number, state, severity: .security_advisory.severity, summary: .security_advisory.summary, html_url, package_name: .dependency.package.name}',
  ])

  if (depResult.success && depResult.stdout) {
    try {
      const lines = depResult.stdout.split('\n').filter(Boolean)
      for (const line of lines) {
        const alert = JSON.parse(line)
        result.dependabot.push({
          number: alert.number,
          state: alert.state,
          severity: alert.severity ?? 'unknown',
          description: alert.summary ?? `Vulnerable dependency: ${alert.package_name}`,
          html_url: alert.html_url ?? null,
          type: 'dependabot',
        })
      }
    } catch {
      try {
        const alerts = JSON.parse(depResult.stdout)
        if (Array.isArray(alerts)) {
          for (const alert of alerts) {
            result.dependabot.push({
              number: alert.number,
              state: alert.state,
              severity: alert.security_advisory?.severity ?? 'unknown',
              description: alert.security_advisory?.summary ?? `Vulnerable dependency: ${alert.dependency?.package?.name}`,
              html_url: alert.html_url ?? null,
              type: 'dependabot',
            })
          }
        }
      } catch {
        result.errors.push(`Failed to parse Dependabot alerts`)
      }
    }
  } else if (!depResult.success && !depResult.stderr.includes('Dependabot alerts are disabled')) {
    result.errors.push(`Dependabot: ${depResult.stderr}`)
  }

  return result
}

// =============================================================================
// Setup All Repos
// =============================================================================

/**
 * Enable security features on all public repos in the database.
 * Only targets repos with is_public=1 to avoid GHAS billing on private repos.
 */
export async function setupSecurityAllRepos(): Promise<{
  total: number
  processed: number
  succeeded: number
  failed: number
  results: SecuritySetupResult[]
}> {
  const repos = await getRepos()

  // Filter to public repos with GitHub slug info
  const publicRepos = repos.filter(
    (r) => (r as any).is_public === 1 && r.github_owner && r.github_repo
  )

  console.log(`[Security] Setting up security on ${publicRepos.length} public repos (${repos.length} total)`)

  const results: SecuritySetupResult[] = []
  let succeeded = 0
  let failed = 0

  for (const repo of publicRepos) {
    try {
      const result = await enableSecurityFeatures(repo.github_owner!, repo.github_repo!)
      results.push(result)
      if (result.success) succeeded++
      else failed++
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      results.push({
        owner: repo.github_owner!,
        repo: repo.github_repo!,
        success: false,
        error: errMsg,
        features_enabled: [],
      })
      failed++
    }
  }

  console.log(`[Security] Done: ${succeeded} succeeded, ${failed} failed out of ${publicRepos.length} public repos`)

  return {
    total: repos.length,
    processed: publicRepos.length,
    succeeded,
    failed,
    results,
  }
}
