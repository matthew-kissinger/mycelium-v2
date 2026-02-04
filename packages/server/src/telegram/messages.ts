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

export interface DiscoveryReportInfo {
  repo_path: string
  repo_name: string
  findings: string[]
  tasks_created?: number
  mode: 'align' | 'auto'
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
}

export interface DigestSummaryInfo {
  period: string
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  total_cost_usd: number
  active_repos: string[]
  pending_signals: number
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

export function formatTaskCreated(task: TaskInfo): string {
  const shortId = task.id.slice(0, 8)
  const repoName = task.repo_path?.split('/').pop() ?? 'unknown'

  return (
    `<b>New Task Created</b>\n\n` +
    `<b>ID:</b> <code>${shortId}</code>\n` +
    `<b>Title:</b> ${escapeHtml(task.title)}\n` +
    `<b>Repo:</b> ${escapeHtml(repoName)}\n` +
    (task.agent ? `<b>Agent:</b> ${task.agent}\n` : '')
  )
}

export function formatTaskStarted(task: TaskInfo): string {
  const shortId = task.id.slice(0, 8)
  const repoName = task.repo_path?.split('/').pop() ?? 'unknown'

  return (
    `\u25b6\ufe0f <b>Task Started</b>\n\n` +
    `<b>ID:</b> <code>${shortId}</code>\n` +
    `<b>Title:</b> ${escapeHtml(task.title)}\n` +
    `<b>Repo:</b> ${escapeHtml(repoName)}\n` +
    (task.agent ? `<b>Agent:</b> ${task.agent}` : '') +
    (task.model ? ` (${task.model})` : '')
  )
}

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

export function formatTaskUpdate(task: TaskInfo): string {
  switch (task.status) {
    case 'running':
      return formatTaskStarted(task)
    case 'done':
      return formatTaskCompleted(task)
    case 'failed':
      return formatTaskFailed(task)
    default:
      return formatTaskCreated(task)
  }
}

// =============================================================================
// Discovery Messages
// =============================================================================

export function formatDiscoveryReport(report: DiscoveryReportInfo): string {
  const modeIcon = report.mode === 'auto' ? '\ud83e\udd16' : '\ud83d\udc41\ufe0f'
  const modeLabel = report.mode === 'auto' ? 'Auto' : 'Align'

  let message =
    `${modeIcon} <b>Discovery Report: ${escapeHtml(report.repo_name)}</b>\n` +
    `<i>${escapeHtml(report.repo_path)}</i>\n\n`

  if (report.findings.length > 0) {
    message += `<b>Findings:</b>\n`
    for (const finding of report.findings.slice(0, 5)) {
      message += `  \u2022 ${escapeHtml(finding)}\n`
    }
    if (report.findings.length > 5) {
      message += `  ... and ${report.findings.length - 5} more\n`
    }
    message += '\n'
  }

  if (report.tasks_created !== undefined && report.tasks_created > 0) {
    message += `<b>Tasks Created:</b> ${report.tasks_created}\n`
  }

  message += `<b>Mode:</b> ${modeLabel}`

  return message
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
    message += `<b>Decisions:</b> ${decisions.join(', ')}`
  }

  return message
}

// =============================================================================
// Digest Messages
// =============================================================================

export function formatDigestSummary(digest: DigestSummaryInfo): string {
  const successRate =
    digest.total_tasks > 0
      ? ((digest.completed_tasks / digest.total_tasks) * 100).toFixed(1)
      : '0'

  let message =
    `\ud83d\udcca <b>Digest Summary (${escapeHtml(digest.period)})</b>\n\n` +
    `<b>Tasks:</b>\n` +
    `  Total: ${digest.total_tasks}\n` +
    `  Completed: ${digest.completed_tasks}\n` +
    `  Failed: ${digest.failed_tasks}\n` +
    `  Success Rate: ${successRate}%\n\n` +
    `<b>Cost:</b> $${digest.total_cost_usd.toFixed(2)}\n\n`

  if (digest.active_repos.length > 0) {
    message += `<b>Active Repos:</b>\n`
    for (const repo of digest.active_repos.slice(0, 5)) {
      const name = repo.split('/').pop() ?? repo
      message += `  \u2022 ${escapeHtml(name)}\n`
    }
    if (digest.active_repos.length > 5) {
      message += `  ... and ${digest.active_repos.length - 5} more\n`
    }
    message += '\n'
  }

  if (digest.pending_signals > 0) {
    message += `\u26a0\ufe0f <b>${digest.pending_signals} pending signal(s)</b> awaiting response`
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

export function formatSignalButtons(signal: SignalInfo): string[][] {
  if (!signal.options || signal.options.length === 0) {
    return []
  }

  // Create buttons with callback data that includes signal ID
  // Format: signal:uuid:response
  const buttons: string[][] = []
  let row: string[] = []

  for (const opt of signal.options) {
    row.push(opt)
    // 2 buttons per row for better mobile display
    if (row.length >= 2) {
      buttons.push(row)
      row = []
    }
  }

  if (row.length > 0) {
    buttons.push(row)
  }

  return buttons
}

// =============================================================================
// Notification Messages
// =============================================================================

export function formatNotification(message: string): string {
  return `\ud83d\udce2 ${escapeHtml(message)}`
}

export function formatError(error: string): string {
  return `\u274c <b>Error:</b>\n<pre>${escapeHtml(error)}</pre>`
}

export function formatWarning(warning: string): string {
  return `\u26a0\ufe0f <b>Warning:</b> ${escapeHtml(warning)}`
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

export function formatRelativeTime(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = now - then

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ago`
  }
  if (hours > 0) {
    return `${hours}h ago`
  }
  if (minutes > 0) {
    return `${minutes}m ago`
  }
  return 'just now'
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength - 3) + '...'
}
