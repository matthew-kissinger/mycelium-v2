/**
 * GitHub Webhook Receiver
 *
 * Handles incoming webhook events from GitHub:
 * - push: Branch updates, code pushes
 * - pull_request: PR opened/closed/merged
 * - workflow_run: CI/CD status updates
 * - dependabot_alert / code_scanning_alert: Security events
 *
 * Webhook setup:
 *   gh api repos/{owner}/{repo}/hooks -X POST \
 *     -f url=http://<host>:8765/api/github/webhook \
 *     -f content_type=json \
 *     -f secret=<webhook_secret>
 *
 * Or via GitHub Settings -> Webhooks for each repo.
 *
 * The webhook secret is stored in GITHUB_WEBHOOK_SECRET env var
 * or in the config override DB as "github_webhook_secret".
 */

import { Hono } from 'hono'
import { broadcast } from '../sse'
import { getRepoByPath, getRepos, getTasks, createTask } from '../db/queries'
import { getConfigOverride } from '../db/config-store'
import { getTelegramService } from '../telegram'
import { escapeHtml } from '../telegram/messages'
import { setupSecurityAllRepos } from '../github/security'
import { applyRulesetsToAllPublic, listRulesets } from '../github/rulesets'

const app = new Hono()

// =============================================================================
// Types
// =============================================================================

interface WebhookPushPayload {
  ref: string
  before: string
  after: string
  repository: {
    full_name: string
    name: string
    default_branch: string
  }
  pusher: {
    name: string
  }
  commits: Array<{
    id: string
    message: string
    author: { name: string }
    added: string[]
    removed: string[]
    modified: string[]
  }>
  forced: boolean
}

interface WebhookPRPayload {
  action: string
  number: number
  pull_request: {
    title: string
    html_url: string
    state: string
    merged: boolean
    head: { ref: string }
    base: { ref: string }
    user: { login: string }
    labels: Array<{ name: string }>
    body: string | null
    additions: number
    deletions: number
    changed_files: number
  }
  repository: {
    full_name: string
    name: string
  }
}

interface WebhookWorkflowRunPayload {
  action: string
  workflow_run: {
    id: number
    name: string
    status: string
    conclusion: string | null
    html_url: string
    head_branch: string
    head_sha: string
    run_number: number
  }
  repository: {
    full_name: string
    name: string
  }
}

interface WebhookSecurityPayload {
  action: string
  alert: {
    number: number
    state: string
    severity: string
    html_url?: string
    rule?: { description: string }
    security_advisory?: { summary: string }
    dependency?: { package: { name: string } }
  }
  repository: {
    full_name: string
    name: string
  }
}

// =============================================================================
// Webhook Secret Verification
// =============================================================================

function getWebhookSecret(): string | null {
  // Check env first, then DB config
  return process.env.GITHUB_WEBHOOK_SECRET ?? getConfigOverride('github_webhook_secret') ?? null
}

/**
 * Verify the GitHub webhook HMAC-SHA256 signature.
 * If no secret is configured, accept all requests (development mode).
 */
async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  const secret = getWebhookSecret()

  // No secret configured - accept all (dev mode)
  if (!secret) return true

  // Secret configured but no signature in request
  if (!signature) return false

  // Verify HMAC-SHA256
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const computed = `sha256=${Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`

  // Constant-time comparison
  if (computed.length !== signature.length) return false
  let result = 0
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return result === 0
}

// =============================================================================
// Repo Lookup
// =============================================================================

/**
 * Find the local repo path matching a GitHub full_name (owner/repo).
 * Checks the repos table for matching github_owner + github_repo.
 */
async function findRepoPath(fullName: string): Promise<string | null> {
  const repos = await getRepos()
  const [owner, repo] = fullName.split('/')

  for (const r of repos) {
    // Check DB github fields
    if (r.github_owner === owner && r.github_repo === repo) {
      return r.path
    }

    // Fallback: match by repo name
    if (r.name === repo) {
      return r.path
    }
  }

  return null
}

// =============================================================================
// POST /api/github/webhook - Receive GitHub webhook events
// =============================================================================

app.post('/webhook', async (c) => {
  const event = c.req.header('x-github-event')
  const delivery = c.req.header('x-github-delivery')
  const signature = c.req.header('x-hub-signature-256')

  if (!event) {
    return c.json({ error: 'Missing x-github-event header' }, 400)
  }

  // Read raw body for signature verification
  const rawBody = await c.req.text()

  // Verify signature
  const valid = await verifySignature(rawBody, signature ?? null)
  if (!valid) {
    console.error(`[GitHub Webhook] Invalid signature for delivery ${delivery}`)
    return c.json({ error: 'Invalid signature' }, 401)
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  console.log(`[GitHub Webhook] Received: ${event} (delivery: ${delivery?.slice(0, 8)})`)

  // Route to handler
  try {
    switch (event) {
      case 'push':
        await handlePush(payload as WebhookPushPayload)
        break
      case 'pull_request':
        await handlePullRequest(payload as WebhookPRPayload)
        break
      case 'workflow_run':
        await handleWorkflowRun(payload as WebhookWorkflowRunPayload)
        break
      case 'dependabot_alert':
      case 'code_scanning_alert':
      case 'secret_scanning_alert':
        await handleSecurityAlert(event, payload as WebhookSecurityPayload)
        break
      case 'ping':
        console.log(`[GitHub Webhook] Ping received from ${(payload as any)?.repository?.full_name ?? 'unknown'}`)
        break
      default:
        console.log(`[GitHub Webhook] Unhandled event: ${event}`)
    }
  } catch (error) {
    console.error(`[GitHub Webhook] Error handling ${event}:`, error)
  }

  return c.json({ received: true, event, delivery })
})

// =============================================================================
// POST /api/github/setup-security - Enable security features on all public repos
// =============================================================================

app.post('/setup-security', async (c) => {
  try {
    const result = await setupSecurityAllRepos()
    return c.json(result)
  } catch (error) {
    console.error('[GitHub Security] Setup failed:', error)
    return c.json(
      { error: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

// =============================================================================
// POST /api/github/rulesets/apply - Apply rulesets to all public repos
// =============================================================================

app.post('/rulesets/apply', async (c) => {
  try {
    const result = await applyRulesetsToAllPublic()
    return c.json(result)
  } catch (error) {
    console.error('[GitHub Rulesets] Apply failed:', error)
    return c.json(
      { error: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

// =============================================================================
// GET /api/github/rulesets/:owner/:repo - List rulesets for a repo
// =============================================================================

app.get('/rulesets/:owner/:repo', async (c) => {
  const { owner, repo } = c.req.param()
  try {
    const rulesets = await listRulesets(owner, repo)
    return c.json({ rulesets })
  } catch (error) {
    console.error(`[GitHub Rulesets] List failed for ${owner}/${repo}:`, error)
    return c.json(
      { error: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

// =============================================================================
// GET /api/github/webhook/status - Check webhook config status
// =============================================================================

app.get('/webhook/status', (c) => {
  const secret = getWebhookSecret()
  return c.json({
    configured: !!secret,
    mode: secret ? 'verified' : 'open',
  })
})

// =============================================================================
// GET /api/github/runner/status - Self-hosted runner status
// =============================================================================

app.get('/runner/status', async (c) => {
  try {
    const proc = Bun.spawn(['gh', 'api', '/user/actions/runners'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      console.error(`[GitHub Runner] gh api failed: ${stderr}`)
      return c.json({
        online: false,
        name: null,
        labels: [],
        os: null,
        error: 'Failed to query runner status',
      })
    }

    const data = JSON.parse(stdout) as {
      total_count: number
      runners: Array<{
        id: number
        name: string
        os: string
        status: string
        busy: boolean
        labels: Array<{ name: string }>
      }>
    }

    // Find our runner by name
    const runner = data.runners.find((r) => r.name === 'mycelium-hub')

    if (!runner) {
      return c.json({
        online: false,
        name: 'mycelium-hub',
        labels: [],
        os: null,
        error: 'Runner not registered',
      })
    }

    return c.json({
      online: runner.status === 'online',
      name: runner.name,
      labels: runner.labels.map((l) => l.name),
      os: runner.os,
      busy: runner.busy,
    })
  } catch (error) {
    console.error('[GitHub Runner] Status check failed:', error)
    return c.json(
      {
        online: false,
        name: null,
        labels: [],
        os: null,
        error: error instanceof Error ? error.message : String(error),
      },
      500
    )
  }
})

// =============================================================================
// Event Handlers
// =============================================================================

async function handlePush(payload: WebhookPushPayload): Promise<void> {
  const { ref, repository, commits, pusher, forced } = payload
  const branch = ref.replace('refs/heads/', '')
  const fullName = repository.full_name
  const repoPath = await findRepoPath(fullName)

  // Ignore pushes from mycelium branches (we already track these via SSE)
  if (branch.startsWith('mycel/')) {
    return
  }

  const fileCount = commits.reduce(
    (sum, c) => sum + c.added.length + c.modified.length + c.removed.length,
    0
  )

  console.log(
    `[GitHub Webhook] Push to ${fullName}/${branch}: ${commits.length} commits, ${fileCount} files changed`
  )

  // Broadcast SSE event
  broadcast('github:push', {
    type: 'github:push' as const,
    repo_path: repoPath ?? fullName,
    branch,
    timestamp: new Date().toISOString(),
  })

  // Notify via Telegram for non-mycelium pushes to default branch
  if (branch === repository.default_branch && commits.length > 0) {
    const telegram = getTelegramService()
    if (telegram) {
      const commitList = commits
        .slice(0, 5)
        .map((c) => `  \u2022 <code>${c.id.slice(0, 7)}</code> ${escapeHtml(c.message.split('\n')[0]!)}`)
        .join('\n')

      const extra = commits.length > 5 ? `\n  ... and ${commits.length - 5} more` : ''

      await telegram.sendMessage(
        `\ud83d\udce5 <b>Push to ${escapeHtml(fullName)}/${escapeHtml(branch)}</b>\n` +
          `By ${escapeHtml(pusher.name)}${forced ? ' (force)' : ''}\n\n` +
          `${commitList}${extra}`,
        { parseMode: 'HTML' }
      )
    }
  }
}

async function handlePullRequest(payload: WebhookPRPayload): Promise<void> {
  const { action, number, pull_request: pr, repository } = payload
  const fullName = repository.full_name
  const repoPath = await findRepoPath(fullName)

  // Skip mycelium-created PRs (already tracked via shepherd SSE events)
  const isMyceliumPR = pr.labels.some((l) => l.name === 'mycelium')

  console.log(
    `[GitHub Webhook] PR #${number} ${action} on ${fullName}: ${pr.title}${isMyceliumPR ? ' (mycelium)' : ''}`
  )

  // Broadcast SSE
  const ts = new Date().toISOString()
  switch (action) {
    case 'opened':
    case 'reopened':
      broadcast('github:pr_created', {
        type: 'github:pr_created' as const,
        repo_path: repoPath ?? fullName,
        pr_number: number,
        pr_url: pr.html_url,
        branch: pr.head.ref,
        title: pr.title,
        timestamp: ts,
      })
      break
    case 'closed':
      if (pr.merged) {
        broadcast('github:pr_merged', {
          type: 'github:pr_merged' as const,
          repo_path: repoPath ?? fullName,
          pr_number: number,
          timestamp: ts,
        })
      } else {
        broadcast('github:pr_closed', {
          type: 'github:pr_closed' as const,
          repo_path: repoPath ?? fullName,
          pr_number: number,
          reason: 'closed',
          timestamp: ts,
        })
      }
      break
  }

  // Telegram notifications for external PRs (not created by mycelium)
  if (!isMyceliumPR) {
    const telegram = getTelegramService()
    if (telegram) {
      let msg: string | null = null

      switch (action) {
        case 'opened':
          msg =
            `\ud83d\udfe2 <b>PR Opened: ${escapeHtml(fullName)} #${number}</b>\n` +
            `<b>${escapeHtml(pr.title)}</b>\n` +
            `By ${escapeHtml(pr.user.login)} (${pr.head.ref} \u2192 ${pr.base.ref})\n` +
            `+${pr.additions} -${pr.deletions} in ${pr.changed_files} files\n` +
            `<a href="${pr.html_url}">View PR</a>`
          break
        case 'closed':
          if (pr.merged) {
            msg =
              `\ud83d\udfe3 <b>PR Merged: ${escapeHtml(fullName)} #${number}</b>\n` +
              `<b>${escapeHtml(pr.title)}</b>\n` +
              `${pr.head.ref} \u2192 ${pr.base.ref}`
          }
          break
      }

      if (msg) {
        await telegram.sendMessage(msg, { parseMode: 'HTML' })
      }
    }
  }
}

async function handleWorkflowRun(payload: WebhookWorkflowRunPayload): Promise<void> {
  const { action, workflow_run: run, repository } = payload
  const fullName = repository.full_name
  const repoPath = await findRepoPath(fullName)

  // Only care about completed runs
  if (action !== 'completed') return

  const status = run.conclusion === 'success' ? 'success' : 'failure'

  console.log(
    `[GitHub Webhook] Workflow ${run.name} #${run.run_number} ${run.conclusion} on ${fullName}/${run.head_branch}`
  )

  // Broadcast SSE
  broadcast('github:check_status', {
    type: 'github:check_status' as const,
    repo_path: repoPath ?? fullName,
    status: status as 'success' | 'failure',
    context: `${run.name} #${run.run_number}`,
    timestamp: new Date().toISOString(),
  })

  // Telegram for CI failures
  if (run.conclusion === 'failure') {
    const telegram = getTelegramService()
    if (telegram) {
      await telegram.sendMessage(
        `\u274c <b>CI Failed: ${escapeHtml(fullName)}</b>\n` +
          `<b>${escapeHtml(run.name)}</b> #${run.run_number}\n` +
          `Branch: ${escapeHtml(run.head_branch)}\n` +
          `<a href="${run.html_url}">View Run</a>`,
        { parseMode: 'HTML' }
      )
    }
  }
}

async function handleSecurityAlert(
  eventType: string,
  payload: WebhookSecurityPayload
): Promise<void> {
  const { action, alert, repository } = payload

  // Only care about new/reopened alerts
  if (action !== 'created' && action !== 'reopened') return

  const fullName = repository.full_name
  const severity = alert.severity?.toUpperCase() ?? 'UNKNOWN'

  let description = ''
  if (alert.security_advisory?.summary) {
    description = alert.security_advisory.summary
  } else if (alert.rule?.description) {
    description = alert.rule.description
  } else if (alert.dependency?.package?.name) {
    description = `Vulnerable dependency: ${alert.dependency.package.name}`
  }

  console.log(
    `[GitHub Webhook] Security alert (${eventType}) on ${fullName}: ${severity} - ${description}`
  )

  // Always notify security alerts via Telegram
  const telegram = getTelegramService()
  if (telegram) {
    const severityIcon =
      severity === 'CRITICAL' || severity === 'HIGH' ? '\ud83d\udea8' : '\u26a0\ufe0f'

    await telegram.sendMessage(
      `${severityIcon} <b>Security Alert: ${escapeHtml(fullName)}</b>\n` +
        `<b>Type:</b> ${escapeHtml(eventType.replace('_', ' '))}\n` +
        `<b>Severity:</b> ${escapeHtml(severity)}\n` +
        (description ? `<b>Details:</b> ${escapeHtml(description.slice(0, 200))}\n` : '') +
        (alert.html_url ? `<a href="${alert.html_url}">View Alert</a>` : ''),
      { parseMode: 'HTML' }
    )
  }

  // Create a mycelium task for HIGH/CRITICAL severity alerts
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    const repoPath = await findRepoPath(fullName)
    if (repoPath) {
      const alertTitle = `[Security] ${severity} ${eventType.replace(/_/g, ' ')}: ${description.slice(0, 100)}`

      // Deduplicate: check for existing pending/running task with same title and repo
      try {
        const existingTasks = await getTasks({ repo_path: repoPath, status: 'pending', limit: 100 })
        const duplicate = existingTasks.find((t) => t.title === alertTitle)

        if (!duplicate) {
          const runningTasks = await getTasks({ repo_path: repoPath, status: 'running', limit: 100 })
          const runningDup = runningTasks.find((t) => t.title === alertTitle)

          if (!runningDup) {
            await createTask({
              title: alertTitle,
              repo_path: repoPath,
              prompt: `Investigate and fix the following security alert:\n\nType: ${eventType}\nSeverity: ${severity}\nDescription: ${description}\n${alert.html_url ? `URL: ${alert.html_url}` : ''}\n\nReview the alert, determine the root cause, and apply the appropriate fix.`,
            })

            console.log(`[GitHub Webhook] Created security task for ${severity} alert on ${fullName}`)
          } else {
            console.log(`[GitHub Webhook] Skipping duplicate security task (running): ${alertTitle}`)
          }
        } else {
          console.log(`[GitHub Webhook] Skipping duplicate security task (pending): ${alertTitle}`)
        }
      } catch (error) {
        console.error(`[GitHub Webhook] Failed to create security task:`, error)
      }
    }
  }
}

export default app
