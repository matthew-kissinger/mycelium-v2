/**
 * Git command helpers - thin wrapper around git CLI.
 * Extracted to enable mocking in tests.
 */

import { spawn } from 'bun'

/**
 * Execute a git command and return exit code without throwing.
 */
export async function runGitSafe(
  args: string[],
  cwd: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
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

/**
 * Detect the default branch for a repo (main or master).
 */
export async function detectDefaultBranch(repoPath: string): Promise<string> {
  const mainCheck = await runGitSafe(['rev-parse', '--verify', 'main'], repoPath)
  if (mainCheck.exitCode === 0) return 'main'

  const masterCheck = await runGitSafe(['rev-parse', '--verify', 'master'], repoPath)
  if (masterCheck.exitCode === 0) return 'master'

  return 'HEAD'
}
