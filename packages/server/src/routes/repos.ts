import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { RepoCreate } from '@mycelium/shared'
import { basename } from 'path'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const app = new Hono()

// List repos
app.get('/', async (c) => {
  const rows = await db.select().from(schema.repos)
  return c.json(rows)
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
app.post('/', zValidator('json', RepoCreate), async (c) => {
  const data = c.req.valid('json')

  // Check if path exists
  if (!existsSync(data.path)) {
    return c.json({ error: 'Path does not exist' }, 400)
  }

  // Check if already registered
  const existing = await db.select().from(schema.repos).where(eq(schema.repos.path, data.path))
  if (existing.length > 0) {
    return c.json({ error: 'Repo already registered', repo: existing[0] }, 409)
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const name = basename(data.path)

  // Try to detect language
  const language = detectLanguage(data.path)

  // Try to get description from README
  const description = data.description ?? extractDescription(data.path)

  const repo = {
    id,
    path: data.path,
    name,
    description,
    language,
    mode: data.mode ?? 'align',
    created_at: now,
  }

  await db.insert(schema.repos).values(repo)

  return c.json(repo, 201)
})

// Update repo
app.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()

  const existing = await db.select().from(schema.repos).where(eq(schema.repos.id, id))
  if (existing.length === 0) {
    return c.json({ error: 'Repo not found' }, 404)
  }

  const updates: Record<string, unknown> = {}
  if (data.description !== undefined) updates.description = data.description
  if (data.mode !== undefined) updates.mode = data.mode
  if (data.last_scanned_at !== undefined) updates.last_scanned_at = data.last_scanned_at

  await db.update(schema.repos).set(updates).where(eq(schema.repos.id, id))

  const updated = await db.select().from(schema.repos).where(eq(schema.repos.id, id))
  return c.json(updated[0])
})

// Remove repo
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(schema.repos).where(eq(schema.repos.id, id))
  return c.json({ message: 'Repo removed' })
})

// Helper: Detect language from project files
function detectLanguage(path: string): string | null {
  const indicators: Record<string, string> = {
    'package.json': 'JavaScript',
    'tsconfig.json': 'TypeScript',
    'pyproject.toml': 'Python',
    'Cargo.toml': 'Rust',
    'go.mod': 'Go',
    'pom.xml': 'Java',
    'build.gradle': 'Java',
    'Gemfile': 'Ruby',
  }

  for (const [file, lang] of Object.entries(indicators)) {
    if (existsSync(join(path, file))) {
      // Upgrade JavaScript to TypeScript if tsconfig exists
      if (lang === 'JavaScript' && existsSync(join(path, 'tsconfig.json'))) {
        return 'TypeScript'
      }
      return lang
    }
  }

  return null
}

// Helper: Extract description from README
function extractDescription(path: string): string | null {
  const readmeFiles = ['README.md', 'README.txt', 'README']

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
          if (line.startsWith('#')) {
            foundTitle = true
            continue
          }
          if (foundTitle && line.trim()) {
            description = line.trim()
            break
          }
        }

        if (description) {
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
