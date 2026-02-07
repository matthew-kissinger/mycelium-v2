/**
 * Local Merge Queue
 *
 * Processes ordered merge entries sequentially with conflict detection.
 * When GitHub merge queue is unavailable (Free plan), this provides
 * sequential merge ordering with automatic rebase on conflicts.
 *
 * Flow per entry:
 * 1. Pre-check: dry-run merge to detect conflicts
 * 2. If clean: proceed with actual merge (via PR if slug exists, local otherwise)
 * 3. If conflict: attempt rebase onto target branch
 * 4. If rebase fails: DEFER the entry with conflict details
 */

import { runGitSafe, detectDefaultBranch } from './git'

// =============================================================================
// Types
// =============================================================================

export interface MergeQueueEntry {
  taskId: string
  branchName: string
  title: string
  mergeOrder: number
  agent: string | null
  model: string | null
}

export interface MergeQueueResult {
  merged: Array<{ taskId: string; branchName: string; filesChanged: number }>
  deferred: Array<{ taskId: string; branchName: string; reason: string; conflicts?: string[] }>
  failed: Array<{ taskId: string; branchName: string; error: string }>
}

export interface RebaseResult {
  success: boolean
  conflicts?: string[]
}

// =============================================================================
// Core: Process Merge Queue
// =============================================================================

/**
 * Process an ordered list of merge entries sequentially.
 *
 * After each successful merge, subsequent branches may need rebasing
 * since the target branch has moved forward. The queue handles this
 * by attempting a rebase before each merge.
 */
export async function processMergeQueue(
  repoPath: string,
  entries: MergeQueueEntry[]
): Promise<MergeQueueResult> {
  const result: MergeQueueResult = { merged: [], deferred: [], failed: [] }

  if (entries.length === 0) return result

  const defaultBranch = await detectDefaultBranch(repoPath)

  // Ensure we're on the default branch before starting
  const checkout = await runGitSafe(['checkout', defaultBranch], repoPath)
  if (checkout.exitCode !== 0) {
    for (const entry of entries) {
      result.failed.push({
        taskId: entry.taskId,
        branchName: entry.branchName,
        error: `Cannot checkout ${defaultBranch}: ${checkout.stderr}`,
      })
    }
    return result
  }

  for (const entry of entries) {
    console.log(`[MergeQueue] Processing ${entry.branchName} (order: ${entry.mergeOrder})`)

    const preCheck = await dryRunMerge(repoPath, entry.branchName)

    if (preCheck.clean) {
      const mergeResult = await doMerge(repoPath, entry.branchName, entry.title, defaultBranch)

      if (mergeResult.success) {
        console.log(`[MergeQueue] Merged ${entry.branchName} (${mergeResult.filesChanged} files)`)
        result.merged.push({
          taskId: entry.taskId,
          branchName: entry.branchName,
          filesChanged: mergeResult.filesChanged,
        })
        continue
      } else {
        result.failed.push({
          taskId: entry.taskId,
          branchName: entry.branchName,
          error: mergeResult.error ?? 'Merge failed after clean pre-check',
        })
      }
    } else {
      console.log(
        `[MergeQueue] Conflicts in ${entry.branchName}, attempting rebase onto ${defaultBranch}`
      )

      const rebaseResult = await rebaseBranch(repoPath, entry.branchName, defaultBranch)

      if (rebaseResult.success) {
        const retryResult = await doMerge(repoPath, entry.branchName, entry.title, defaultBranch)

        if (retryResult.success) {
          console.log(
            `[MergeQueue] Merged ${entry.branchName} after rebase (${retryResult.filesChanged} files)`
          )
          result.merged.push({
            taskId: entry.taskId,
            branchName: entry.branchName,
            filesChanged: retryResult.filesChanged,
          })
          continue
        } else {
          result.failed.push({
            taskId: entry.taskId,
            branchName: entry.branchName,
            error: retryResult.error ?? 'Merge failed after successful rebase',
          })
        }
      } else {
        console.log(
          `[MergeQueue] Cannot resolve conflicts for ${entry.branchName}, deferring`
        )
        result.deferred.push({
          taskId: entry.taskId,
          branchName: entry.branchName,
          reason: `Merge conflicts with ${defaultBranch} that could not be auto-resolved`,
          conflicts: rebaseResult.conflicts,
        })
      }
    }

    await runGitSafe(['checkout', defaultBranch], repoPath)
  }

  const summary = [
    result.merged.length > 0 ? `${result.merged.length} merged` : null,
    result.deferred.length > 0 ? `${result.deferred.length} deferred` : null,
    result.failed.length > 0 ? `${result.failed.length} failed` : null,
  ]
    .filter(Boolean)
    .join(', ')

  console.log(`[MergeQueue] Complete: ${summary}`)
  return result
}

// =============================================================================
// Rebase
// =============================================================================

/**
 * Rebase a branch onto a target branch.
 * Returns success if the rebase completes cleanly, or the conflict list if not.
 */
export async function rebaseBranch(
  repoPath: string,
  branchName: string,
  targetBranch: string
): Promise<RebaseResult> {
  const checkout = await runGitSafe(['checkout', branchName], repoPath)
  if (checkout.exitCode !== 0) {
    return { success: false, conflicts: [`Cannot checkout ${branchName}: ${checkout.stderr}`] }
  }

  const rebase = await runGitSafe(['rebase', targetBranch], repoPath)

  if (rebase.exitCode === 0) {
    await runGitSafe(['checkout', targetBranch], repoPath)
    return { success: true }
  }

  const conflictFiles = await runGitSafe(['diff', '--name-only', '--diff-filter=U'], repoPath)
  const conflicts = conflictFiles.stdout
    ? conflictFiles.stdout.split('\n').filter((f) => f.length > 0)
    : ['Unknown conflict']

  await runGitSafe(['rebase', '--abort'], repoPath)
  await runGitSafe(['checkout', targetBranch], repoPath)

  return { success: false, conflicts }
}

// =============================================================================
// Internals
// =============================================================================

async function dryRunMerge(
  repoPath: string,
  branchName: string
): Promise<{ clean: boolean; conflicts?: string[] }> {
  const merge = await runGitSafe(
    ['merge', '--no-commit', '--no-ff', branchName],
    repoPath
  )

  if (merge.exitCode === 0) {
    await runGitSafe(['merge', '--abort'], repoPath)
    return { clean: true }
  }

  const conflictFiles = await runGitSafe(['diff', '--name-only', '--diff-filter=U'], repoPath)
  const conflicts = conflictFiles.stdout
    ? conflictFiles.stdout.split('\n').filter((f) => f.length > 0)
    : []

  await runGitSafe(['merge', '--abort'], repoPath)

  return { clean: false, conflicts }
}

async function doMerge(
  repoPath: string,
  branchName: string,
  taskTitle: string,
  defaultBranch: string
): Promise<{ success: boolean; filesChanged: number; error?: string }> {
  await runGitSafe(['checkout', defaultBranch], repoPath)

  const commitMsg = `merge: ${taskTitle}`
  const merge = await runGitSafe(
    ['merge', '--no-ff', branchName, '-m', commitMsg],
    repoPath
  )

  if (merge.exitCode === 0) {
    const diffStat = await runGitSafe(['diff', '--stat', 'HEAD~1', 'HEAD'], repoPath)
    const fileLines = diffStat.stdout.split('\n').filter((l) => l.includes('|'))
    return { success: true, filesChanged: fileLines.length }
  }

  await runGitSafe(['merge', '--abort'], repoPath)
  return { success: false, filesChanged: 0, error: merge.stderr || merge.stdout }
}
