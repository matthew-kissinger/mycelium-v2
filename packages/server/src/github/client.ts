/**
 * GitHub Client - thin wrapper around the `gh` CLI
 *
 * Uses the authenticated gh CLI (already set up via `gh auth login`)
 * instead of raw HTTP to avoid token management complexity.
 *
 * All operations are optional/graceful - GitHub being down should never
 * block local task execution.
 */

import { spawn } from 'bun'
import { readFileSync, existsSync } from 'fs'

// =============================================================================
// Types
// =============================================================================

export interface RepoSlug {
  owner: string
  repo: string
}

export interface GhResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

// =============================================================================
// Core: Run `gh` CLI command
// =============================================================================

/**
 * Execute a `gh` CLI command and return the result.
 * Never throws - returns success:false on failure.
 *
 * @param args - Arguments to pass to `gh`
 * @param cwd - Working directory (optional)
 * @param timeoutMs - Timeout in milliseconds (default 30s)
 */
export async function runGh(
  args: string[],
  cwd?: string,
  timeoutMs: number = 30_000
): Promise<GhResult> {
  try {
    const proc = spawn({
      cmd: ['gh', ...args],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    const result = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), timeoutMs)
      ),
    ])

    if (result === 'timeout') {
      proc.kill()
      return { success: false, stdout: '', stderr: 'gh command timed out', exitCode: 124 }
    }

    const [stdout, stderr, exitCode] = result as [string, string, number]
    return {
      success: exitCode === 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode,
    }
  } catch (error) {
    return {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    }
  }
}

// =============================================================================
// Repo Slug Detection
// =============================================================================

/**
 * Detect the GitHub owner/repo slug from a local repo path.
 * Parses the `origin` remote URL.
 *
 * Returns null if the repo has no GitHub remote.
 */
export async function getRepoSlug(repoPath: string): Promise<RepoSlug | null> {
  const result = await runGitRemote(repoPath)
  if (!result) return null

  // Parse SSH: git@github.com:owner/repo.git
  const sshMatch = result.match(/github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/)
  if (sshMatch && sshMatch[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] }
  }

  // Parse HTTPS: https://github.com/owner/repo.git
  const httpsMatch = result.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/)
  if (httpsMatch && httpsMatch[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] }
  }

  return null
}

/**
 * Get the origin remote URL for a repo.
 */
async function runGitRemote(repoPath: string): Promise<string | null> {
  try {
    const proc = spawn({
      cmd: ['git', 'remote', 'get-url', 'origin'],
      cwd: repoPath,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    return exitCode === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}

/**
 * Format owner/repo as a single string: "owner/repo"
 */
export function formatSlug(slug: RepoSlug): string {
  return `${slug.owner}/${slug.repo}`
}

// =============================================================================
// GitHub API Helpers
// =============================================================================

/**
 * Check if a repo exists on GitHub.
 */
export async function repoExistsOnGitHub(slug: RepoSlug): Promise<boolean> {
  const result = await runGh(['api', `repos/${formatSlug(slug)}`, '--silent'])
  return result.success
}

/**
 * Get the default branch for a GitHub repo.
 */
export async function getGitHubDefaultBranch(slug: RepoSlug): Promise<string | null> {
  const result = await runGh([
    'api', `repos/${formatSlug(slug)}`,
    '--jq', '.default_branch',
  ])
  return result.success ? result.stdout : null
}

/**
 * Push a local branch to GitHub.
 * Uses git push directly (not gh) since gh doesn't have a push command.
 */
export async function pushBranch(
  repoPath: string,
  branchName: string,
  force: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const args = ['push', 'origin', branchName]
    if (force) args.push('--force')

    const proc = spawn({
      cmd: ['git', ...args],
      cwd: repoPath,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const exitCode = await proc.exited
    if (exitCode === 0) {
      return { success: true }
    }
    return { success: false, error: stderr.trim() || stdout.trim() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Delete a remote branch on GitHub.
 */
export async function deleteRemoteBranch(
  repoPath: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const proc = spawn({
      cmd: ['git', 'push', 'origin', '--delete', branchName],
      cwd: repoPath,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    if (exitCode === 0) {
      return { success: true }
    }
    return { success: false, error: stderr.trim() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// =============================================================================
// Commit Status API
// =============================================================================

/**
 * Create a commit status (pending/success/failure/error) on a branch.
 * Used to show build/evaluation status in the PR.
 */
export async function createCommitStatus(
  slug: RepoSlug,
  sha: string,
  state: 'pending' | 'success' | 'failure' | 'error',
  context: string,
  description: string,
  targetUrl?: string
): Promise<boolean> {
  const body: Record<string, string> = { state, context, description }
  if (targetUrl) body.target_url = targetUrl

  const result = await runGh([
    'api', `repos/${formatSlug(slug)}/statuses/${sha}`,
    '-X', 'POST',
    '-f', `state=${state}`,
    '-f', `context=${context}`,
    '-f', `description=${description}`,
    ...(targetUrl ? ['-f', `target_url=${targetUrl}`] : []),
  ])

  return result.success
}

/**
 * Get the HEAD SHA of a branch (local).
 */
export async function getBranchSha(repoPath: string, branchName: string): Promise<string | null> {
  try {
    const proc = spawn({
      cmd: ['git', 'rev-parse', branchName],
      cwd: repoPath,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    return exitCode === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}
