/**
 * Workspace Isolation via Git Worktrees
 *
 * Provides isolated working directories for agent tasks using git worktrees.
 * Each task gets its own branch and worktree, preventing agents from
 * interfering with each other or the main branch.
 *
 * Uses Bun.spawn for all git operations (same pattern as dispatch.ts).
 */

import { spawn } from 'bun'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { rm, readdir } from 'fs/promises'

// =============================================================================
// Types
// =============================================================================

export interface WorktreeResult {
  worktreePath: string
  branchName: string
}

export interface WorktreeInfo {
  worktreePath: string
  branchName: string
  exists: boolean
  diffStats: string | null
}

export interface BranchDiff {
  filesChanged: string[]
  diffStat: string
  diffContent: string
}

// =============================================================================
// Configuration
// =============================================================================

const WORKTREE_BASE_DIR = join(homedir(), '.mycelium', 'worktrees')
const BRANCH_PREFIX = 'mycel/task-'

// =============================================================================
// Helper: Run git command
// =============================================================================

/**
 * Execute a git command and return stdout.
 * Throws on non-zero exit code.
 */
async function runGit(args: string[], cwd: string): Promise<string> {
  const proc = spawn({
    cmd: ['git', ...args],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  })

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new Error(`git ${args[0]} failed (exit ${exitCode}): ${stderr.trim() || stdout.trim()}`)
  }

  return stdout.trim()
}

/**
 * Execute a git command and return exit code without throwing.
 */
async function runGitSafe(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = spawn({
    cmd: ['git', ...args],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  })

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  const exitCode = await proc.exited
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() }
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Create an isolated workspace for a task using git worktrees.
 *
 * Creates branch `mycel/task-{taskId}` from current HEAD and a worktree
 * at `~/.mycelium/worktrees/task-{taskId}`.
 *
 * Handles edge cases:
 * - Directory already exists (reuse if valid worktree, remove if stale)
 * - Branch already exists (reuse it)
 */
export async function prepareWorkspace(taskId: string, repoPath: string): Promise<WorktreeResult> {
  const branchName = `${BRANCH_PREFIX}${taskId}`
  const worktreePath = join(WORKTREE_BASE_DIR, `task-${taskId}`)

  console.log(`[WORKSPACE] Preparing workspace for task=${taskId.slice(0, 8)} in ${repoPath}`)

  // Ensure base directory exists
  mkdirSync(WORKTREE_BASE_DIR, { recursive: true })

  // Check if worktree already exists at that path
  if (existsSync(worktreePath)) {
    // Verify it's a valid worktree for this repo
    const info = await getWorktreeInfo(taskId, repoPath)
    if (info?.exists) {
      console.log(`[WORKSPACE] Reusing existing worktree for task=${taskId.slice(0, 8)}`)
      return { worktreePath, branchName: info.branchName }
    }

    // Stale directory - remove it
    console.log(`[WORKSPACE] Removing stale worktree directory for task=${taskId.slice(0, 8)}`)
    // Try git worktree remove first
    await runGitSafe(['worktree', 'remove', '--force', worktreePath], repoPath)
    // If directory still exists, force remove
    if (existsSync(worktreePath)) {
      await rm(worktreePath, { recursive: true, force: true })
    }
  }

  // Check if branch already exists
  const branchCheck = await runGitSafe(['rev-parse', '--verify', branchName], repoPath)
  const branchExists = branchCheck.exitCode === 0

  if (branchExists) {
    // Branch exists - create worktree from existing branch
    console.log(`[WORKSPACE] Branch ${branchName} exists, creating worktree from it`)
    await runGit(['worktree', 'add', worktreePath, branchName], repoPath)
  } else {
    // Create new branch and worktree in one step
    // git worktree add -b <branch> <path> HEAD
    await runGit(['worktree', 'add', '-b', branchName, worktreePath, 'HEAD'], repoPath)
  }

  console.log(`[WORKSPACE] Created worktree at ${worktreePath} on branch ${branchName}`)
  return { worktreePath, branchName }
}

/**
 * Clean up a task's worktree and optionally its branch.
 *
 * Removes the worktree directory and prunes stale entries.
 * Force-removes if the worktree has uncommitted changes.
 */
export async function cleanupWorkspace(
  taskId: string,
  repoPath: string,
  deleteBranch: boolean = false
): Promise<void> {
  const branchName = `${BRANCH_PREFIX}${taskId}`
  const worktreePath = join(WORKTREE_BASE_DIR, `task-${taskId}`)

  console.log(`[WORKSPACE] Cleaning up workspace for task=${taskId.slice(0, 8)}`)

  // Remove worktree (force to handle dirty state)
  if (existsSync(worktreePath)) {
    const result = await runGitSafe(['worktree', 'remove', worktreePath], repoPath)
    if (result.exitCode !== 0) {
      // Force remove if regular remove fails (dirty worktree)
      console.log(`[WORKSPACE] Force removing dirty worktree for task=${taskId.slice(0, 8)}`)
      await runGitSafe(['worktree', 'remove', '--force', worktreePath], repoPath)

      // Last resort: manual directory removal
      if (existsSync(worktreePath)) {
        await rm(worktreePath, { recursive: true, force: true })
      }
    }
  }

  // Prune stale worktree entries
  await runGitSafe(['worktree', 'prune'], repoPath)

  // Delete branch if requested
  if (deleteBranch) {
    const deleteResult = await runGitSafe(['branch', '-D', branchName], repoPath)
    if (deleteResult.exitCode === 0) {
      console.log(`[WORKSPACE] Deleted branch ${branchName}`)
    }
  }

  console.log(`[WORKSPACE] Cleanup complete for task=${taskId.slice(0, 8)}`)
}

/**
 * Clean up all mycelium worktrees.
 *
 * Used at startup/shutdown to ensure no stale worktrees remain.
 * Optionally scoped to a specific repo.
 */
export async function cleanupAllWorkspaces(repoPath?: string): Promise<number> {
  console.log('[WORKSPACE] Cleaning up all mycelium worktrees...')

  // If we have a specific repo, prune its worktrees
  if (repoPath) {
    await runGitSafe(['worktree', 'prune'], repoPath)
  }

  // Remove all worktree directories under our base dir
  if (!existsSync(WORKTREE_BASE_DIR)) {
    console.log('[WORKSPACE] No worktree directory found, nothing to clean')
    return 0
  }

  let cleaned = 0
  try {
    const entries = await readdir(WORKTREE_BASE_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('task-')) {
        const fullPath = join(WORKTREE_BASE_DIR, entry.name)

        // Try git worktree remove first (if we have a repo path)
        if (repoPath) {
          await runGitSafe(['worktree', 'remove', '--force', fullPath], repoPath)
        }

        // Force remove directory if still exists
        if (existsSync(fullPath)) {
          await rm(fullPath, { recursive: true, force: true })
        }
        cleaned++
      }
    }
  } catch (error) {
    console.error('[WORKSPACE] Error during cleanup:', error)
  }

  console.log(`[WORKSPACE] Cleaned up ${cleaned} worktrees`)
  return cleaned
}

/**
 * Get information about a task's worktree.
 *
 * Returns null if no worktree exists for the task.
 */
export async function getWorktreeInfo(taskId: string, repoPath: string): Promise<WorktreeInfo | null> {
  const worktreePath = join(WORKTREE_BASE_DIR, `task-${taskId}`)

  if (!existsSync(worktreePath)) {
    return null
  }

  // List worktrees and find ours
  const result = await runGitSafe(['worktree', 'list', '--porcelain'], repoPath)
  if (result.exitCode !== 0) {
    return null
  }

  // Parse porcelain output to find our worktree
  // Format: blocks separated by blank lines, each has:
  //   worktree <path>
  //   HEAD <sha>
  //   branch refs/heads/<name>
  const blocks = result.stdout.split('\n\n')
  let branchName = ''
  let found = false

  for (const block of blocks) {
    const lines = block.split('\n')
    const pathLine = lines.find(l => l.startsWith('worktree '))
    const branchLine = lines.find(l => l.startsWith('branch '))

    if (pathLine) {
      const path = pathLine.replace('worktree ', '')
      if (path === worktreePath) {
        found = true
        if (branchLine) {
          // branch refs/heads/mycel/task-xxx -> mycel/task-xxx
          branchName = branchLine.replace('branch refs/heads/', '')
        }
        break
      }
    }
  }

  if (!found) {
    // Directory exists but isn't registered as a worktree
    return {
      worktreePath,
      branchName: '',
      exists: false,
      diffStats: null,
    }
  }

  // Get diff stats for the worktree
  let diffStats: string | null = null
  const diffResult = await runGitSafe(['diff', '--stat', 'HEAD'], worktreePath)
  if (diffResult.exitCode === 0 && diffResult.stdout) {
    diffStats = diffResult.stdout
  }

  return {
    worktreePath,
    branchName,
    exists: true,
    diffStats,
  }
}

/**
 * Get the diff between a task branch and the main branch.
 *
 * Used by the shepherd to evaluate task output.
 * Finds the merge base automatically to get only the task's changes.
 */
export async function getBranchDiff(repoPath: string, branchName: string): Promise<BranchDiff> {
  // Find the default branch (main or master)
  const defaultBranch = await getDefaultBranch(repoPath)

  // Get merge base between default branch and task branch
  const mergeBaseResult = await runGitSafe(['merge-base', defaultBranch, branchName], repoPath)
  const mergeBase = mergeBaseResult.exitCode === 0 ? mergeBaseResult.stdout : defaultBranch

  // Get list of changed files
  const filesResult = await runGitSafe(['diff', '--name-only', mergeBase, branchName], repoPath)
  const filesChanged = filesResult.exitCode === 0 && filesResult.stdout
    ? filesResult.stdout.split('\n').filter(f => f.length > 0)
    : []

  // Get diff stat summary
  const statResult = await runGitSafe(['diff', '--stat', mergeBase, branchName], repoPath)
  const diffStat = statResult.exitCode === 0 ? statResult.stdout : ''

  // Get full diff content (limited to prevent huge outputs)
  const diffResult = await runGitSafe(['diff', mergeBase, branchName], repoPath)
  let diffContent = diffResult.exitCode === 0 ? diffResult.stdout : ''

  // Truncate if too large (100KB limit)
  const MAX_DIFF_SIZE = 100 * 1024
  if (diffContent.length > MAX_DIFF_SIZE) {
    diffContent = diffContent.slice(0, MAX_DIFF_SIZE) + '\n\n[diff truncated - exceeded 100KB]'
  }

  return {
    filesChanged,
    diffStat,
    diffContent,
  }
}

// =============================================================================
// Git Backup Data Capture
// =============================================================================

export interface WorktreeCommitData {
  commits: Array<{ hash: string; message: string; author: string }>
  files_modified: string[]
  files_created: string[]
  files_deleted: string[]
}

/**
 * Capture commit and file change data from a worktree's git history.
 * Used as backup when agents don't produce structured XML output.
 *
 * Reads: git log (commits since default branch) + git diff --name-status (file categorization).
 */
export async function captureWorktreeCommits(worktreePath: string): Promise<WorktreeCommitData | null> {
  try {
    const defaultBranch = await getDefaultBranch(worktreePath)

    // Get commit list since divergence from default branch
    const logResult = await runGitSafe(
      ['log', `${defaultBranch}..HEAD`, '--format=%H|%s|%an', '--reverse'],
      worktreePath,
    )
    const commits: WorktreeCommitData['commits'] = []
    if (logResult.exitCode === 0 && logResult.stdout) {
      for (const line of logResult.stdout.split('\n')) {
        if (!line.trim()) continue
        const [hash, message, author] = line.split('|')
        if (hash && message) {
          commits.push({ hash: hash.slice(0, 7), message, author: author ?? 'unknown' })
        }
      }
    }

    if (commits.length === 0) return null

    // Get file categorization (M=modified, A=added, D=deleted)
    const diffResult = await runGitSafe(
      ['diff', '--name-status', `${defaultBranch}...HEAD`],
      worktreePath,
    )

    const files_modified: string[] = []
    const files_created: string[] = []
    const files_deleted: string[] = []

    if (diffResult.exitCode === 0 && diffResult.stdout) {
      for (const line of diffResult.stdout.split('\n')) {
        if (!line.trim()) continue
        const [status, ...pathParts] = line.split('\t')
        const filePath = pathParts.join('\t') // handle paths with tabs (rare)
        if (!filePath) continue

        if (status === 'A') files_created.push(filePath)
        else if (status === 'D') files_deleted.push(filePath)
        else files_modified.push(filePath) // M, R, C all treated as modified
      }
    }

    return { commits, files_modified, files_created, files_deleted }
  } catch (error) {
    console.error('[WORKSPACE] Failed to capture worktree commits:', error)
    return null
  }
}

// =============================================================================
// Diff Capture
// =============================================================================

export interface WorktreeDiffResult {
  stat: string
  diff: string
  commits: number
}

/**
 * Capture the git diff between a task branch and its base.
 * Used to record what changes an agent made in fruiting sessions.
 *
 * Returns stat summary, full diff (truncated to 50KB), and commit count.
 */
export async function captureWorktreeDiff(worktreePath: string): Promise<WorktreeDiffResult | null> {
  try {
    // Detect default branch from the main repo (worktree inherits refs)
    const defaultBranch = await getDefaultBranch(worktreePath)

    // Get stat summary
    const statResult = await runGitSafe(['diff', `${defaultBranch}...HEAD`, '--stat'], worktreePath)
    const stat = statResult.exitCode === 0 ? statResult.stdout : ''

    // Get full diff (truncated to 50KB)
    const diffResult = await runGitSafe(['diff', `${defaultBranch}...HEAD`], worktreePath)
    let diff = diffResult.exitCode === 0 ? diffResult.stdout : ''
    const MAX_DIFF_SIZE = 50 * 1024
    if (diff.length > MAX_DIFF_SIZE) {
      diff = diff.slice(0, MAX_DIFF_SIZE) + '\n\n[diff truncated - exceeded 50KB]'
    }

    // Count commits on the task branch since divergence
    const commitResult = await runGitSafe(['rev-list', '--count', `${defaultBranch}..HEAD`], worktreePath)
    const commits = commitResult.exitCode === 0 ? parseInt(commitResult.stdout) || 0 : 0

    return { stat, diff, commits }
  } catch (error) {
    console.error('[WORKSPACE] Failed to capture worktree diff:', error)
    return null
  }
}

// =============================================================================
// GitHub Push
// =============================================================================

/**
 * Push a task branch to GitHub after agent completes work.
 * Graceful - returns false on failure without throwing.
 *
 * Only pushes if the repo has a GitHub remote (origin -> github.com).
 */
export async function pushBranchToGithub(
  repoPath: string,
  branchName: string
): Promise<{ pushed: boolean; error?: string }> {
  // Check if origin points to GitHub
  const remoteResult = await runGitSafe(['remote', 'get-url', 'origin'], repoPath)
  if (remoteResult.exitCode !== 0 || !remoteResult.stdout.includes('github.com')) {
    return { pushed: false, error: 'No GitHub remote' }
  }

  // Push the branch
  const pushResult = await runGitSafe(['push', 'origin', branchName, '--force'], repoPath)
  if (pushResult.exitCode !== 0) {
    console.error(`[WORKSPACE] Failed to push ${branchName} to GitHub: ${pushResult.stderr}`)
    return { pushed: false, error: pushResult.stderr }
  }

  console.log(`[WORKSPACE] Pushed ${branchName} to GitHub`)
  return { pushed: true }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Detect the default branch name for a repo (main or master).
 */
async function getDefaultBranch(repoPath: string): Promise<string> {
  // Check for 'main' first, then 'master'
  const mainCheck = await runGitSafe(['rev-parse', '--verify', 'main'], repoPath)
  if (mainCheck.exitCode === 0) return 'main'

  const masterCheck = await runGitSafe(['rev-parse', '--verify', 'master'], repoPath)
  if (masterCheck.exitCode === 0) return 'master'

  // Fallback: use HEAD
  return 'HEAD'
}
