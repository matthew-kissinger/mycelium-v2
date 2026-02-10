/**
 * GitHub Repository Rulesets
 *
 * Manages branch protection rulesets for public repos using the GitHub API.
 * Rulesets are the modern replacement for branch protection rules and
 * are available for free on public repos (GitHub Free plan).
 *
 * Uses the `gh` CLI for all GitHub API interactions.
 */

import { runGh } from './client'
import { getRepos } from '../db/queries'

// =============================================================================
// Types
// =============================================================================

export interface RulesetInfo {
  id: number
  name: string
  enforcement: string
}

export interface RulesetCreateResult {
  success: boolean
  rulesetId?: number
  error?: string
}

export interface ApplyRulesetsResult {
  applied: string[]
  skipped: string[]
  errors: Array<{ repo: string; error: string }>
}

// =============================================================================
// Constants
// =============================================================================

export const RULESET_NAME = 'mycelium-default'

// =============================================================================
// Ruleset Payload
// =============================================================================

/**
 * Build the JSON payload for creating a default branch protection ruleset.
 *
 * Rules:
 * - pull_request: Require PRs (0 approvals - agents can self-merge)
 * - non_fast_forward: Prevent force pushes to the default branch
 * - deletion: Prevent branch deletion
 */
export function buildRulesetPayload(defaultBranch: string): object {
  return {
    name: RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    conditions: {
      ref_name: {
        include: [`refs/heads/${defaultBranch}`],
        exclude: [],
      },
    },
    rules: [
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: false,
        },
      },
      { type: 'non_fast_forward' },
      { type: 'deletion' },
    ],
  }
}

// =============================================================================
// Create Default Ruleset
// =============================================================================

/**
 * Create a default branch protection ruleset for a GitHub repo.
 * Only works on public repos (GitHub Free plan limitation).
 */
export async function createDefaultRuleset(
  owner: string,
  repo: string,
  defaultBranch: string
): Promise<RulesetCreateResult> {
  const slug = `${owner}/${repo}`
  const payload = buildRulesetPayload(defaultBranch)

  console.log(`[Rulesets] Creating '${RULESET_NAME}' ruleset on ${slug} (branch: ${defaultBranch})`)

  const payloadJson = JSON.stringify(payload)

  // runGh uses stdin: 'ignore', but gh api --input - needs stdin.
  // Use Bun.spawn directly with stdin: 'pipe' to write the JSON payload.
  const { spawn } = await import('bun')

  try {
    const proc = spawn({
      cmd: ['gh', 'api', `repos/${slug}/rulesets`, '-X', 'POST', '--input', '-'],
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
    })

    // Write the JSON payload to stdin
    proc.stdin.write(payloadJson)
    proc.stdin.end()

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    if (exitCode !== 0) {
      const errMsg = stderr.trim() || stdout.trim()
      console.error(`[Rulesets] Failed to create ruleset on ${slug}: ${errMsg}`)
      return { success: false, error: errMsg }
    }

    // Parse the response to get the ruleset ID
    try {
      const data = JSON.parse(stdout)
      console.log(`[Rulesets] Created ruleset ${data.id} on ${slug}`)
      return { success: true, rulesetId: data.id }
    } catch {
      // Ruleset was created but response wasn't parseable
      console.log(`[Rulesets] Created ruleset on ${slug} (could not parse response)`)
      return { success: true }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[Rulesets] Error creating ruleset on ${slug}: ${errMsg}`)
    return { success: false, error: errMsg }
  }
}

// =============================================================================
// List Rulesets
// =============================================================================

/**
 * List existing rulesets for a repo.
 */
export async function listRulesets(
  owner: string,
  repo: string
): Promise<RulesetInfo[]> {
  const slug = `${owner}/${repo}`

  const result = await runGh([
    'api', `repos/${slug}/rulesets`,
    '--jq', '.[] | {id, name, enforcement}',
  ])

  if (!result.success) {
    // May fail for repos without rulesets or private repos without GHAS
    if (result.stderr.includes('404') || result.stderr.includes('Not Found')) {
      return []
    }
    console.warn(`[Rulesets] Failed to list rulesets for ${slug}: ${result.stderr}`)
    return []
  }

  if (!result.stdout.trim()) {
    return []
  }

  const rulesets: RulesetInfo[] = []

  try {
    // gh --jq outputs one JSON object per line
    const lines = result.stdout.trim().split('\n').filter(Boolean)
    for (const line of lines) {
      const parsed = JSON.parse(line)
      rulesets.push({
        id: parsed.id,
        name: parsed.name,
        enforcement: parsed.enforcement,
      })
    }
  } catch {
    // Try parsing as a JSON array (gh may return array for empty --jq)
    try {
      const parsed = JSON.parse(result.stdout)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          rulesets.push({
            id: item.id,
            name: item.name,
            enforcement: item.enforcement,
          })
        }
      }
    } catch {
      console.warn(`[Rulesets] Failed to parse rulesets response for ${slug}`)
    }
  }

  return rulesets
}

// =============================================================================
// Apply to All Public Repos
// =============================================================================

/**
 * Apply default rulesets to all public repos in the database.
 * Skips repos that already have the 'mycelium-default' ruleset.
 */
export async function applyRulesetsToAllPublic(): Promise<ApplyRulesetsResult> {
  const repos = await getRepos()

  // Filter to public repos with GitHub slug info
  const publicRepos = repos.filter(
    (r) => r.is_public === 1 && r.github_owner && r.github_repo
  )

  console.log(`[Rulesets] Checking ${publicRepos.length} public repos (${repos.length} total)`)

  const applied: string[] = []
  const skipped: string[] = []
  const errors: Array<{ repo: string; error: string }> = []

  for (const repo of publicRepos) {
    const owner = repo.github_owner!
    const repoName = repo.github_repo!
    const slug = `${owner}/${repoName}`
    const defaultBranch = repo.github_default_branch ?? 'main'

    try {
      // Check if ruleset already exists
      const existing = await listRulesets(owner, repoName)
      const hasDefault = existing.some((r) => r.name === RULESET_NAME)

      if (hasDefault) {
        console.log(`[Rulesets] ${slug}: already has '${RULESET_NAME}' ruleset, skipping`)
        skipped.push(slug)
        continue
      }

      // Create the ruleset
      const result = await createDefaultRuleset(owner, repoName, defaultBranch)

      if (result.success) {
        applied.push(slug)
      } else {
        errors.push({ repo: slug, error: result.error ?? 'Unknown error' })
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      errors.push({ repo: slug, error: errMsg })
    }
  }

  console.log(
    `[Rulesets] Done: ${applied.length} applied, ${skipped.length} skipped, ${errors.length} errors`
  )

  return { applied, skipped, errors }
}
