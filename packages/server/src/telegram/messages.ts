/**
 * Telegram Message Formatting Helpers
 *
 * Provides consistent formatting for various message types sent via Telegram.
 * Uses HTML parse mode for rich formatting.
 */

// =============================================================================
// Types
// =============================================================================

export interface TaskInfo {
  id: string
  title: string
  status: string
  repo_path?: string
  agent?: string | null
  model?: string | null
  error?: string | null
  cost_usd?: number | null
  duration_seconds?: number | null
  created_at: string
  started_at?: string | null
  completed_at?: string | null
}

export interface BranchEvaluation {
  task_id: string
  decision: string
  reason: string
  confidence?: number
  agent?: string
  files_modified?: string[]
  files_created?: string[]
  commits?: Array<{ hash?: string; message: string }>
  tests?: { passed: number; failed: number; skipped: number }
}

export interface ShepherdReportInfo {
  repo_path: string
  repo_name: string
  health: 'healthy' | 'warning' | 'critical'
  headline: string
  concerns?: string[]
  wins?: string[]
  merges?: number
  rejects?: number
  defers?: number
  branch_evaluations?: BranchEvaluation[]
}

export interface SignalInfo {
  id: string
  question: string
  options?: string[]
  repo_path?: string | null
  task_id?: string | null
}

// =============================================================================
// Task Messages
// =============================================================================

export function formatTaskCompleted(task: TaskInfo): string {
  const shortId = task.id.slice(0, 8)
  const repoName = task.repo_path?.split('/').pop() ?? 'unknown'
  const duration = task.duration_seconds
    ? formatDuration(task.duration_seconds)
    : 'unknown'
  const cost = task.cost_usd
    ? `$${task.cost_usd.toFixed(4)}`
    : 'N/A'
  const agentStr = task.agent
    ? (task.model ? `${task.agent}/${task.model}` : task.agent)
    : null

  return (
    `\u2705 <b>Task Completed</b>\n\n` +
    `<b>ID:</b> <code>${shortId}</code>\n` +
    `<b>Title:</b> ${escapeHtml(task.title)}\n` +
    `<b>Repo:</b> ${escapeHtml(repoName)}\n` +
    (agentStr ? `<b>Agent:</b> ${escapeHtml(agentStr)}\n` : '') +
    `<b>Duration:</b> ${duration}\n` +
    `<b>Cost:</b> ${cost}`
  )
}

export function formatTaskFailed(task: TaskInfo): string {
  const shortId = task.id.slice(0, 8)
  const repoName = task.repo_path?.split('/').pop() ?? 'unknown'
  const duration = task.duration_seconds
    ? formatDuration(task.duration_seconds)
    : null
  const agentStr = task.agent
    ? (task.model ? `${task.agent}/${task.model}` : task.agent)
    : null
  const errorPreview = task.error
    ? task.error.slice(0, 200) + (task.error.length > 200 ? '...' : '')
    : 'Unknown error'

  return (
    `\u274c <b>Task Failed</b>\n\n` +
    `<b>ID:</b> <code>${shortId}</code>\n` +
    `<b>Title:</b> ${escapeHtml(task.title)}\n` +
    `<b>Repo:</b> ${escapeHtml(repoName)}\n` +
    (agentStr ? `<b>Agent:</b> ${escapeHtml(agentStr)}\n` : '') +
    (duration ? `<b>Duration:</b> ${duration}\n` : '') +
    `\n<b>Error:</b>\n<pre>${escapeHtml(errorPreview)}</pre>`
  )
}

export interface TaskRetryInfo {
  id: string
  title: string
  repo_path?: string
  failed_agent: string
  failed_model: string
  error: string
  retry_agent: string
  retry_model: string
  attempt: number
}

export function formatTaskRetrying(info: TaskRetryInfo): string {
  const shortId = info.id.slice(0, 8)
  const repoName = info.repo_path?.split('/').pop() ?? 'unknown'
  const errorPreview = info.error.slice(0, 200) + (info.error.length > 200 ? '...' : '')

  return (
    `\u{1f504} <b>Task Retrying</b>\n\n` +
    `<b>ID:</b> <code>${shortId}</code>\n` +
    `<b>Title:</b> ${escapeHtml(info.title)}\n` +
    `<b>Repo:</b> ${escapeHtml(repoName)}\n` +
    `<b>Failed:</b> ${escapeHtml(info.failed_agent)}/${escapeHtml(info.failed_model)}\n` +
    `<b>Retrying:</b> ${escapeHtml(info.retry_agent)}/${escapeHtml(info.retry_model)} (attempt ${info.attempt + 1})\n` +
    `\n<b>Error:</b>\n<pre>${escapeHtml(errorPreview)}</pre>`
  )
}

// =============================================================================
// Batch Task Messages
// =============================================================================

export interface BatchTaskItem {
  title: string
  agent?: string | null
  status: string
  duration_seconds?: number | null
  cost_usd?: number | null
  branchName?: string | null
}

export function formatTaskBatch(
  repoName: string,
  tasks: BatchTaskItem[],
  timeRange?: { start: string; end: string }
): string {
  const completed = tasks.filter((t) => t.status === 'done').length
  const failed = tasks.filter((t) => t.status === 'failed').length

  let header = ''
  if (completed > 0 && failed > 0) {
    header = `${completed} completed, ${failed} failed`
  } else if (completed > 0) {
    header = `${completed} task${completed === 1 ? '' : 's'} completed`
  } else {
    header = `${failed} task${failed === 1 ? '' : 's'} failed`
  }

  let message = `\ud83d\udce6 <b>${header} on ${escapeHtml(repoName)}</b>`
  if (timeRange) {
    const start = new Date(timeRange.start)
    const end = new Date(timeRange.end)
    const startStr = `${start.getHours()}:${String(start.getMinutes()).padStart(2, '0')}`
    const endStr = `${end.getHours()}:${String(end.getMinutes()).padStart(2, '0')}`
    message += ` (${startStr}-${endStr})`
  }
  message += '\n'

  for (const task of tasks) {
    const icon = task.status === 'done' ? '\u2705' : '\u274c'
    const agent = task.agent ? ` (${escapeHtml(task.agent)})` : ''
    const duration = task.duration_seconds ? ` ${formatDuration(task.duration_seconds)}` : ''
    const statusLabel = task.status === 'done'
      ? (task.branchName ? ' - ready to merge' : '')
      : ' FAILED'

    message += `${icon} ${escapeHtml(truncate(task.title, 40))}${agent}${duration}${statusLabel}\n`
  }

  const totalCost = tasks.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0)
  if (totalCost > 0) {
    message += `\n<b>Cost:</b> $${totalCost.toFixed(4)}`
  }

  return message
}

// =============================================================================
// Merge Messages
// =============================================================================

export function formatMergeConflict(
  repoPath: string,
  branchName: string,
  agent: string,
  conflictFiles: string[]
): string {
  const repoName = repoPath.split('/').pop() ?? 'unknown'

  let message =
    `\u26a0\ufe0f <b>MERGE CONFLICT: ${escapeHtml(repoName)}</b>\n\n` +
    `<b>Branch:</b> ${escapeHtml(branchName)} (${escapeHtml(agent)})\n` +
    `<b>Conflicts:</b>\n`

  for (const file of conflictFiles.slice(0, 5)) {
    message += `  \u2022 <code>${escapeHtml(file)}</code>\n`
  }
  if (conflictFiles.length > 5) {
    message += `  ... and ${conflictFiles.length - 5} more\n`
  }

  return message
}

export function formatMergeSuccess(
  repoPath: string,
  branchName: string,
  agent: string,
  filesMerged: number
): string {
  const repoName = repoPath.split('/').pop() ?? 'unknown'

  return (
    `\u2705 <b>MERGED: ${escapeHtml(repoName)}</b>\n\n` +
    `<b>Branch:</b> ${escapeHtml(branchName)} (${escapeHtml(agent)})\n` +
    `<b>Files:</b> ${filesMerged} merged`
  )
}

// =============================================================================
// Shepherd Messages
// =============================================================================

export function formatShepherdReport(report: ShepherdReportInfo): string {
  const healthIcon = {
    healthy: '\ud83d\udfe2',
    warning: '\ud83d\udfe1',
    critical: '\ud83d\udd34',
  }[report.health]

  let message =
    `${healthIcon} <b>Shepherd Report: ${escapeHtml(report.repo_name)}</b>\n\n` +
    `<b>${escapeHtml(report.headline)}</b>\n\n`

  if (report.wins && report.wins.length > 0) {
    message += `<b>Wins:</b>\n`
    for (const win of report.wins.slice(0, 3)) {
      message += `  \u2705 ${escapeHtml(win)}\n`
    }
    message += '\n'
  }

  if (report.concerns && report.concerns.length > 0) {
    message += `<b>Concerns:</b>\n`
    for (const concern of report.concerns.slice(0, 3)) {
      message += `  \u26a0\ufe0f ${escapeHtml(concern)}\n`
    }
    message += '\n'
  }

  const decisions: string[] = []
  if (report.merges && report.merges > 0) {
    decisions.push(`${report.merges} merged`)
  }
  if (report.rejects && report.rejects > 0) {
    decisions.push(`${report.rejects} rejected`)
  }
  if (report.defers && report.defers > 0) {
    decisions.push(`${report.defers} deferred`)
  }

  if (decisions.length > 0) {
    message += `<b>Decisions:</b> ${decisions.join(', ')}\n`
  }

  // Per-task evaluation details
  if (report.branch_evaluations && report.branch_evaluations.length > 0) {
    message += '\n'
    for (const b of report.branch_evaluations) {
      const icon = b.decision === 'MERGE' ? '\u2705' : b.decision === 'REJECT' ? '\u274c' : '\u23f3'
      const label = b.agent ? escapeHtml(b.agent) : b.task_id.slice(0, 8)
      const confStr = b.confidence ? ` (${Math.round(b.confidence * 100)}%)` : ''
      message += `${icon} <b>${b.decision}:</b> ${label}${confStr}\n`

      if (b.reason) message += `  ${escapeHtml(truncate(b.reason, 80))}\n`

      const fileCount = (b.files_modified?.length ?? 0) + (b.files_created?.length ?? 0)
      if (fileCount > 0) message += `  Files: ${fileCount} changed\n`
      if (b.tests) message += `  Tests: ${b.tests.passed}p/${b.tests.failed}f/${b.tests.skipped}s\n`
      if (b.commits?.length) message += `  Commits: ${b.commits.length}\n`
    }
  }

  return message
}

// =============================================================================
// Max Alignment Messages
// =============================================================================

export interface MaxAlignmentReportInfo {
  repo_path: string
  repo_name: string
  health: 'healthy' | 'warning' | 'critical'
  headline: string
  build_status?: string
  test_status?: string
  test_count?: number
  test_passing?: number
  test_failing?: number
  runtime_status?: string
  critical_bugs: number
  claude_md_action?: string
  deleted_files: number
  deleted_branches: number
}

export function formatMaxAlignmentReport(report: MaxAlignmentReportInfo): string {
  const healthIcon = {
    healthy: '\ud83d\udfe2',
    warning: '\ud83d\udfe1',
    critical: '\ud83d\udd34',
  }[report.health]

  let message =
    `${healthIcon} <b>Max Alignment: ${escapeHtml(report.repo_name)}</b>\n\n` +
    `<b>${escapeHtml(report.headline)}</b>\n\n`

  // Runtime check summary
  const checks: string[] = []
  if (report.build_status) {
    checks.push(`Build: ${report.build_status === 'pass' ? '\u2705' : '\u274c'}`)
  }
  if (report.test_status) {
    const testDetail = report.test_passing != null && report.test_failing != null
      ? ` (${report.test_passing}p/${report.test_failing}f)`
      : ''
    checks.push(`Tests: ${report.test_status === 'pass' ? '\u2705' : '\u274c'}${testDetail}`)
  }
  if (report.runtime_status) {
    checks.push(`Runtime: ${report.runtime_status === 'pass' ? '\u2705' : report.runtime_status === 'untestable' ? '\u2796' : '\u274c'}`)
  }
  if (checks.length > 0) {
    message += checks.join(' | ') + '\n'
  }

  if (report.critical_bugs > 0) {
    message += `\u26a0\ufe0f <b>${report.critical_bugs} critical bug${report.critical_bugs > 1 ? 's' : ''} found</b>\n`
  }

  if (report.claude_md_action === 'rewritten') {
    message += `\ud83d\udcdd CLAUDE.md rewritten\n`
  }

  const cleanupParts: string[] = []
  if (report.deleted_files > 0) cleanupParts.push(`${report.deleted_files} files`)
  if (report.deleted_branches > 0) cleanupParts.push(`${report.deleted_branches} branches`)
  if (cleanupParts.length > 0) {
    message += `\ud83e\uddf9 Cleaned: ${cleanupParts.join(', ')}\n`
  }

  return message
}

// =============================================================================
// Signal Messages
// =============================================================================

export function formatSignalQuestion(signal: SignalInfo): string {
  const shortId = signal.id.slice(0, 8)
  const context = signal.repo_path
    ? `<i>${escapeHtml(signal.repo_path.split('/').pop() ?? '')}</i>\n`
    : ''

  let message =
    `\u2753 <b>Alignment Signal</b>\n` +
    `ID: <code>${shortId}</code>\n` +
    context +
    `\n${escapeHtml(signal.question)}`

  if (signal.options && signal.options.length > 0) {
    message += '\n\n<b>Options:</b>\n'
    for (const opt of signal.options) {
      message += `  \u2022 ${escapeHtml(opt)}\n`
    }
    message += `\nReply with your choice or use the buttons below.`
  } else {
    message += `\n\nReply to this message with your response.`
  }

  return message
}

// =============================================================================
// Notification Messages
// =============================================================================

export function formatNotification(message: string): string {
  return `\ud83d\udce2 ${escapeHtml(message)}`
}

// =============================================================================
// Helpers
// =============================================================================

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (minutes < 60) {
    return `${minutes}m ${secs}s`
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength - 3) + '...'
}
