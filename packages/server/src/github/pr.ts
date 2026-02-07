/**
 * GitHub Pull Request operations
 *
 * Creates, merges, and closes PRs for the agent workflow.
 * The shepherd uses these to replace direct local merges with
 * auditable PRs on GitHub.
 */

import { runGh, formatSlug, type RepoSlug } from './client'

// =============================================================================
// Types
// =============================================================================

export interface PRCreateOptions {
  slug: RepoSlug
  head: string         // Source branch (e.g., "mycel/task-abc123")
  base?: string        // Target branch (default: repo default branch)
  title: string
  body: string
  labels?: string[]
  draft?: boolean
}

export interface PRInfo {
  number: number
  url: string
  state: string
  title: string
  head: string
  base: string
  mergeable?: boolean
}

export interface PRMergeOptions {
  slug: RepoSlug
  prNumber: number
  method?: 'merge' | 'squash' | 'rebase'
  commitTitle?: string
  deleteAfterMerge?: boolean
}

// =============================================================================
// PR Creation
// =============================================================================

/**
 * Create a pull request on GitHub.
 * Returns the PR number and URL, or null on failure.
 */
export async function createPR(options: PRCreateOptions): Promise<PRInfo | null> {
  const { slug, head, base, title, body, labels, draft } = options

  const args = [
    'pr', 'create',
    '--repo', formatSlug(slug),
    '--head', head,
    '--title', title,
    '--body', body,
  ]

  if (base) args.push('--base', base)
  if (draft) args.push('--draft')
  if (labels && labels.length > 0) {
    args.push('--label', labels.join(','))
  }

  const result = await runGh(args)

  if (!result.success) {
    console.error(`[GitHub PR] Failed to create PR: ${result.stderr}`)
    return null
  }

  // gh pr create outputs the PR URL on success
  const url = result.stdout.trim()
  const prNumber = parsePRNumberFromUrl(url)

  if (!prNumber) {
    console.error(`[GitHub PR] Could not parse PR number from: ${url}`)
    return null
  }

  return {
    number: prNumber,
    url,
    state: 'open',
    title,
    head,
    base: base ?? 'main',
  }
}

// =============================================================================
// PR Merge
// =============================================================================

/**
 * Merge a pull request.
 * Returns true on success.
 */
export async function mergePR(options: PRMergeOptions): Promise<{ success: boolean; error?: string }> {
  const { slug, prNumber, method, commitTitle, deleteAfterMerge } = options

  const args = [
    'pr', 'merge', String(prNumber),
    '--repo', formatSlug(slug),
    `--${method ?? 'merge'}`,
  ]

  if (commitTitle) args.push('--subject', commitTitle)
  if (deleteAfterMerge !== false) args.push('--delete-branch')

  const result = await runGh(args)

  if (!result.success) {
    return { success: false, error: result.stderr }
  }
  return { success: true }
}

// =============================================================================
// PR Close
// =============================================================================

/**
 * Close a pull request without merging.
 * Used for REJECT decisions.
 */
export async function closePR(
  slug: RepoSlug,
  prNumber: number,
  comment?: string
): Promise<boolean> {
  // Add rejection comment if provided
  if (comment) {
    await runGh([
      'pr', 'comment', String(prNumber),
      '--repo', formatSlug(slug),
      '--body', comment,
    ])
  }

  const result = await runGh([
    'pr', 'close', String(prNumber),
    '--repo', formatSlug(slug),
    '--delete-branch',
  ])

  return result.success
}

// =============================================================================
// PR Status/Info
// =============================================================================

/**
 * Get PR info by number.
 */
export async function getPRInfo(slug: RepoSlug, prNumber: number): Promise<PRInfo | null> {
  const result = await runGh([
    'pr', 'view', String(prNumber),
    '--repo', formatSlug(slug),
    '--json', 'number,url,state,title,headRefName,baseRefName,mergeable',
  ])

  if (!result.success) return null

  try {
    const data = JSON.parse(result.stdout)
    return {
      number: data.number,
      url: data.url,
      state: data.state,
      title: data.title,
      head: data.headRefName,
      base: data.baseRefName,
      mergeable: data.mergeable === 'MERGEABLE',
    }
  } catch {
    return null
  }
}

/**
 * Find an open PR for a branch.
 * Returns null if no PR exists.
 */
export async function findPRForBranch(slug: RepoSlug, branchName: string): Promise<PRInfo | null> {
  const result = await runGh([
    'pr', 'list',
    '--repo', formatSlug(slug),
    '--head', branchName,
    '--state', 'open',
    '--json', 'number,url,state,title,headRefName,baseRefName',
    '--limit', '1',
  ])

  if (!result.success) return null

  try {
    const prs = JSON.parse(result.stdout)
    if (prs.length === 0) return null

    const pr = prs[0]
    return {
      number: pr.number,
      url: pr.url,
      state: pr.state,
      title: pr.title,
      head: pr.headRefName,
      base: pr.baseRefName,
    }
  } catch {
    return null
  }
}

// =============================================================================
// PR Labels
// =============================================================================

/**
 * Ensure labels exist on the repo (create if missing).
 */
export async function ensureLabels(
  slug: RepoSlug,
  labels: Array<{ name: string; color: string; description?: string }>
): Promise<void> {
  for (const label of labels) {
    // Try to create - if it already exists, gh will return an error which we ignore
    await runGh([
      'api', `repos/${formatSlug(slug)}/labels`,
      '-X', 'POST',
      '-f', `name=${label.name}`,
      '-f', `color=${label.color}`,
      ...(label.description ? ['-f', `description=${label.description}`] : []),
    ])
  }
}

/**
 * Standard labels for agent PRs.
 */
export const AGENT_LABELS = [
  { name: 'mycelium', color: '7B61FF', description: 'Created by mycelium agent network' },
  { name: 'auto-merge', color: '0E8A16', description: 'Approved for automatic merge by shepherd' },
  { name: 'needs-review', color: 'FBCA04', description: 'Awaiting shepherd review' },
  { name: 'rejected', color: 'E11D48', description: 'Rejected by shepherd evaluation' },
] as const

// =============================================================================
// PR Body Builder
// =============================================================================

/**
 * Build a standard PR body for agent-created PRs.
 */
export function buildPRBody(options: {
  taskId: string
  taskTitle: string
  agent: string
  model?: string | null
  duration?: number | null
  cost?: number | null
  diffStat?: string
  evaluationReason?: string
}): string {
  const { taskId, taskTitle, agent, model, duration, cost, diffStat, evaluationReason } = options

  const lines: string[] = [
    `## Task: ${taskTitle}`,
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| Task ID | \`${taskId.slice(0, 8)}\` |`,
    `| Agent | ${agent}${model ? `/${model}` : ''} |`,
  ]

  if (duration) lines.push(`| Duration | ${Math.round(duration)}s |`)
  if (cost) lines.push(`| Cost | $${cost.toFixed(4)} |`)

  if (diffStat) {
    lines.push('', '## Changes', '', '```', diffStat, '```')
  }

  if (evaluationReason) {
    lines.push('', '## Shepherd Evaluation', '', evaluationReason)
  }

  lines.push('', '---', 'Created by [mycelium](https://github.com/matthew-kissinger/mycelium-v2) agent network')

  return lines.join('\n')
}

// =============================================================================
// Helpers
// =============================================================================

function parsePRNumberFromUrl(url: string): number | null {
  const match = url.match(/\/pull\/(\d+)/)
  return match && match[1] ? parseInt(match[1], 10) : null
}
