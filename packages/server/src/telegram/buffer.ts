/**
 * Telegram Notification Buffer
 *
 * Accumulates task completion/failure events and flushes them as batched
 * messages. Reduces notification noise by grouping events per repo.
 *
 * Flush triggers:
 * - 60 seconds since first buffered event
 * - 5+ events accumulated
 */

import { getTelegramService } from './index'
import { formatTaskBatch, type BatchTaskItem } from './messages'

// =============================================================================
// Types
// =============================================================================

interface BufferedEvent {
  repoPath: string
  repoName: string
  task: BatchTaskItem
  timestamp: string
}

// =============================================================================
// State
// =============================================================================

const buffer: BufferedEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false

const FLUSH_INTERVAL_MS = 60_000 // 60 seconds
const FLUSH_THRESHOLD = 5 // flush when buffer hits this size

// =============================================================================
// Public API
// =============================================================================

/**
 * Add a task completion/failure event to the buffer.
 * May trigger an immediate flush if threshold is reached.
 */
export function bufferTaskEvent(
  repoPath: string,
  task: BatchTaskItem
): void {
  const repoName = repoPath.split('/').pop() ?? 'unknown'

  buffer.push({
    repoPath,
    repoName,
    task,
    timestamp: new Date().toISOString(),
  })

  // Start timer on first event
  if (buffer.length === 1 && !flushTimer) {
    flushTimer = setTimeout(() => {
      flushBuffer()
    }, FLUSH_INTERVAL_MS)
  }

  // Flush immediately if threshold reached
  if (buffer.length >= FLUSH_THRESHOLD) {
    flushBuffer()
  }
}

/**
 * Flush the buffer, sending batched messages grouped by repo.
 */
export function flushBuffer(): void {
  if (flushing) return

  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }

  if (buffer.length === 0) return

  flushing = true

  const telegram = getTelegramService()
  if (!telegram?.isConnected()) {
    buffer.length = 0
    flushing = false
    return
  }

  // Snapshot and clear buffer before sending to prevent loss on crash
  const events = buffer.splice(0, buffer.length)

  // Group events by repo
  const byRepo = new Map<string, BufferedEvent[]>()
  for (const event of events) {
    const existing = byRepo.get(event.repoPath)
    if (existing) {
      existing.push(event)
    } else {
      byRepo.set(event.repoPath, [event])
    }
  }

  // Send one message per repo
  for (const [, repoEvents] of byRepo) {
    const repoName = repoEvents[0].repoName
    const tasks = repoEvents.map((e) => e.task)
    const timeRange = {
      start: repoEvents[0].timestamp,
      end: repoEvents[repoEvents.length - 1].timestamp,
    }

    // If only 1 event, skip batch formatting - let the individual
    // notification handle it (already sent by dispatcher for single events)
    if (repoEvents.length === 1) continue

    const msg = formatTaskBatch(repoName, tasks, timeRange)
    telegram.sendMessage(msg).catch((e) =>
      console.error('[TelegramBuffer] Send error:', e)
    )
  }

  flushing = false
}

/**
 * Get current buffer size (for testing/monitoring).
 */
export function getBufferSize(): number {
  return buffer.length
}

/**
 * Shutdown: flush remaining events and clear timer.
 */
export function shutdownBuffer(): void {
  flushBuffer()
}
