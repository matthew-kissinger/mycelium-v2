/**
 * Active system agent run tracking.
 * Separated from scheduler/index.ts to avoid circular imports
 * (cycles import this, scheduler/index imports cycles).
 */

/** Info about a currently running system agent */
export interface ActiveRun {
  run_id: string
  agent_type: string
  repo_path?: string
  started_at: string
}

// Track active system agent runs (run_id -> info)
const activeRuns = new Map<string, ActiveRun>()

/** Register a system agent run as active */
export function registerActiveRun(run: ActiveRun): void {
  activeRuns.set(run.run_id, run)
}

/** Remove a system agent run from active tracking */
export function unregisterActiveRun(runId: string): void {
  activeRuns.delete(runId)
}

/** Get all active system agent runs */
export function getActiveRuns(): ActiveRun[] {
  return Array.from(activeRuns.values())
}

/** Check if shepherd is already running for a specific repo */
export function isShepherdRunningForRepo(repoPath: string): boolean {
  for (const run of activeRuns.values()) {
    if (run.agent_type === 'shepherd' && run.repo_path === repoPath) {
      return true
    }
  }
  return false
}

/** Check if max alignment is already running for a specific repo */
export function isMaxAlignmentRunningForRepo(repoPath: string): boolean {
  for (const run of activeRuns.values()) {
    if (run.agent_type === 'max_alignment' && run.repo_path === repoPath) {
      return true
    }
  }
  return false
}
