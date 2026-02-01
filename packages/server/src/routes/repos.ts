import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { RepoCreateRequest, RepoUpdateRequest, RepoDiscoverRequest, RepoHealthItem, RepoHealthResponse } from '@mycelium/shared'
import { basename, resolve } from 'path'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { broadcast } from '../sse'

const app = new Hono()

// List repos
app.get('/', async (c) => {
  const rows = await db.select().from(schema.repos)
  return c.json(rows)
})

// Health summary - must be before /:id route
app.get('/health', async (c) => {
  const repos = await db.select().from(schema.repos)
  const allTasks = await db.select().from(schema.tasks)

  const healthItems: RepoHealthItem[] = []
  let totalHealthScore = 0

  for (const repo of repos) {
    const repoTasks = allTasks.filter((t) => t.repo_path === repo.path)

    const pending = repoTasks.filter((t) => t.status === 'pending').length
    const running = repoTasks.filter((t) => t.status === 'running').length
    const completed = repoTasks.filter((t) => t.status === 'done').length
    const failed = repoTasks.filter((t) => t.status === 'failed').length

    // Find most recent activity
    const completedTasks = repoTasks.filter((t) => t.completed_at)
    const lastActivity = completedTasks.length > 0
      ? completedTasks.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))[0].completed_at ?? undefined
      : undefined

    // Calculate health score (0-100)
    // - Base score: 70
    // - +10 if completed > failed
    // - +10 if no running tasks stuck
    // - +10 if recent activity (last 7 days)
    // - -20 if failure rate > 30%
    // - -10 if many pending tasks (>10)
    let healthScore = 70

    const total = completed + failed
    if (total > 0) {
      const failureRate = failed / total
      if (failureRate > 0.3) healthScore -= 20
      if (completed > failed) healthScore += 10
    }

    if (pending > 10) healthScore -= 10
    if (running === 0 || running <= 3) healthScore += 5

    if (lastActivity) {
      const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSince <= 7) healthScore += 10
      else if (daysSince > 30) healthScore -= 10
    }

    healthScore = Math.max(0, Math.min(100, healthScore))
    totalHealthScore += healthScore

    healthItems.push({
      path: repo.path,
      name: repo.name,
      pending_tasks: pending,
      running_tasks: running,
      completed_tasks: completed,
      failed_tasks: failed,
      last_activity: lastActivity,
      health_score: healthScore,
    })
  }

  const overallHealth = repos.length > 0 ? Math.round(totalHealthScore / repos.length) : 100

  const response: RepoHealthResponse = {
    repos: healthItems,
    overall_health: overallHealth,
  }

  return c.json(response)
})

// Discover repos - scan paths for git repos
app.post('/discover', zValidator('json', RepoDiscoverRequest), async (c) => {
  const data = c.req.valid('json')
  const paths = data.paths ?? []

  if (paths.length === 0) {
    return c.json({ error: 'No paths provided' }, 400)
  }

  const discovered: Array<{
    path: string
    name: string
    language: string | null
    description: string | null
    already_registered: boolean
  }> = []

  for (const scanPath of paths) {
    const resolvedPath = resolve(scanPath)

    if (!existsSync(resolvedPath)) {
      continue
    }

    const stat = statSync(resolvedPath)
    if (!stat.isDirectory()) {
      continue
    }

    // Check if this is itself a git repo
    if (existsSync(join(resolvedPath, '.git'))) {
      const existing = await db.select().from(schema.repos).where(eq(schema.repos.path, resolvedPath))
      discovered.push({
        path: resolvedPath,
        name: basename(resolvedPath),
        language: detectLanguage(resolvedPath),
        description: extractDescription(resolvedPath),
        already_registered: existing.length > 0,
      })
    }

    // Scan subdirectories (1 level deep)
    try {
      const entries = readdirSync(resolvedPath, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.')) continue

        const subPath = join(resolvedPath, entry.name)

        if (existsSync(join(subPath, '.git'))) {
          const existing = await db.select().from(schema.repos).where(eq(schema.repos.path, subPath))
          discovered.push({
            path: subPath,
            name: entry.name,
            language: detectLanguage(subPath),
            description: extractDescription(subPath),
            already_registered: existing.length > 0,
          })
        }
      }
    } catch (error) {
      // Ignore permission errors etc
    }
  }

  return c.json({
    discovered,
    total: discovered.length,
    new: discovered.filter((d) => !d.already_registered).length,
  })
})

// Get single repo
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const rows = await db.select().from(schema.repos).where(eq(schema.repos.id, id))

  if (rows.length === 0) {
    return c.json({ error: 'Repo not found' }, 404)
  }

  return c.json(rows[0])
})

// Add repo
app.post('/', zValidator('json', RepoCreateRequest), async (c) => {
  const data = c.req.valid('json')
  const resolvedPath = resolve(data.path)

  // Check if path exists
  if (!existsSync(resolvedPath)) {
    return c.json({ error: 'Path does not exist' }, 400)
  }

  // Check if it's a git repo
  if (!existsSync(join(resolvedPath, '.git'))) {
    return c.json({ error: 'Path is not a git repository' }, 400)
  }

  // Check if already registered
  const existing = await db.select().from(schema.repos).where(eq(schema.repos.path, resolvedPath))
  if (existing.length > 0) {
    return c.json({ error: 'Repo already registered', repo: existing[0] }, 409)
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const name = basename(resolvedPath)

  // Try to detect language
  const language = detectLanguage(resolvedPath)

  // Try to get description from README
  const description = data.description ?? extractDescription(resolvedPath)

  const repo = {
    id,
    path: resolvedPath,
    name,
    description,
    language,
    mode: data.mode ?? 'align',
    created_at: now,
  }

  await db.insert(schema.repos).values(repo)

  broadcast('repo:added', repo)

  return c.json(repo, 201)
})

// Update repo
app.patch('/:id', zValidator('json', RepoUpdateRequest), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')

  const existing = await db.select().from(schema.repos).where(eq(schema.repos.id, id))
  if (existing.length === 0) {
    return c.json({ error: 'Repo not found' }, 404)
  }

  const updates: Record<string, unknown> = {}
  if (data.description !== undefined) updates.description = data.description
  if (data.mode !== undefined) updates.mode = data.mode

  if (Object.keys(updates).length === 0) {
    return c.json(existing[0])
  }

  await db.update(schema.repos).set(updates).where(eq(schema.repos.id, id))

  const updated = await db.select().from(schema.repos).where(eq(schema.repos.id, id))

  broadcast('repo:updated', updated[0])

  return c.json(updated[0])
})

// Remove repo
app.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const existing = await db.select().from(schema.repos).where(eq(schema.repos.id, id))
  if (existing.length === 0) {
    return c.json({ error: 'Repo not found' }, 404)
  }

  await db.delete(schema.repos).where(eq(schema.repos.id, id))

  broadcast('repo:removed', { id, path: existing[0].path })

  return c.json({ message: 'Repo removed', id })
})

// Helper: Detect language from project files
function detectLanguage(path: string): string | null {
  const indicators: Record<string, string> = {
    'package.json': 'JavaScript',
    'tsconfig.json': 'TypeScript',
    'pyproject.toml': 'Python',
    'requirements.txt': 'Python',
    'setup.py': 'Python',
    'Cargo.toml': 'Rust',
    'go.mod': 'Go',
    'pom.xml': 'Java',
    'build.gradle': 'Java',
    'Gemfile': 'Ruby',
    'composer.json': 'PHP',
    'mix.exs': 'Elixir',
    'project.clj': 'Clojure',
    'Makefile': 'C/C++',
    'CMakeLists.txt': 'C/C++',
  }

  // Check tsconfig first for TypeScript detection
  if (existsSync(join(path, 'tsconfig.json'))) {
    return 'TypeScript'
  }

  for (const [file, lang] of Object.entries(indicators)) {
    if (existsSync(join(path, file))) {
      return lang
    }
  }

  return null
}

// Helper: Extract description from README
function extractDescription(path: string): string | null {
  const readmeFiles = ['README.md', 'readme.md', 'README.txt', 'README', 'readme']

  for (const file of readmeFiles) {
    const readmePath = join(path, file)
    if (existsSync(readmePath)) {
      try {
        const content = readFileSync(readmePath, 'utf-8')
        // Get first paragraph after title
        const lines = content.split('\n')
        let foundTitle = false
        let description = ''

        for (const line of lines) {
          // Skip badges and empty lines
          if (line.startsWith('![') || line.startsWith('[![')) {
            continue
          }

          if (line.startsWith('#')) {
            foundTitle = true
            continue
          }

          if (foundTitle && line.trim()) {
            // Skip blockquotes that often contain badges or taglines
            if (line.startsWith('>')) {
              continue
            }
            description = line.trim()
            break
          }
        }

        if (description) {
          // Remove markdown links
          description = description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          return description.slice(0, 200) // Limit length
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return null
}

export default app
