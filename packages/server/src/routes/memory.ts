import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { MemoryPatternCreateRequest, MemoryWarningCreateRequest, MemoryWriteRequest, MemoryCompactRequest } from '@mycelium/shared'
import {
  getGlobalPatterns,
  getGlobalWarnings,
  getPatterns,
  getWarnings,
  createPattern,
  createWarning,
  parsePattern,
} from '../db/queries'
import { broadcast } from '../sse'

const app = new Hono()

// GET /api/memory/global - Get global memory (patterns + warnings)
app.get('/global', async (c) => {
  const [patterns, warnings] = await Promise.all([
    getGlobalPatterns(),
    getGlobalWarnings(),
  ])

  return c.json({
    patterns: patterns.map(parsePattern),
    warnings,
  })
})

// POST /api/memory/global - Add to global memory (pattern or warning)
app.post('/global', zValidator('json', MemoryWriteRequest), async (c) => {
  const data = c.req.valid('json')

  if (data.type === 'pattern') {
    const pattern = await createPattern({
      content: data.content,
      source: data.source ?? 'manual',
      task_id: data.task_id,
      repo_path: undefined, // Global memory has no repo_path
      tags: data.tags ?? [],
    })

    const result = parsePattern(pattern as any)
    broadcast('memory:pattern_created', result)

    return c.json(result, 201)
  } else {
    const warning = await createWarning({
      content: data.content,
      severity: data.severity ?? 'medium',
      task_id: data.task_id,
      repo_path: undefined, // Global memory has no repo_path
    })

    broadcast('memory:warning_created', warning)

    return c.json(warning, 201)
  }
})

// GET /api/memory/repo/:path - Get repo-specific memory
// Note: path should be URL-encoded (e.g., %2Fhome%2Fuser%2Frepo)
app.get('/repo/:path', async (c) => {
  const encodedPath = c.req.param('path')
  const repoPath = decodeURIComponent(encodedPath)

  const [patterns, warnings] = await Promise.all([
    getPatterns({ repo_path: repoPath }),
    getWarnings({ repo_path: repoPath }),
  ])

  return c.json({
    repo_path: repoPath,
    patterns: patterns.map(parsePattern),
    warnings,
  })
})

// POST /api/memory/repo/:path - Add to repo memory
app.post('/repo/:path', zValidator('json', MemoryWriteRequest), async (c) => {
  const encodedPath = c.req.param('path')
  const repoPath = decodeURIComponent(encodedPath)
  const data = c.req.valid('json')

  if (data.type === 'pattern') {
    const pattern = await createPattern({
      content: data.content,
      source: data.source ?? 'manual',
      task_id: data.task_id,
      repo_path: repoPath,
      tags: data.tags ?? [],
    })

    const result = parsePattern(pattern as any)
    broadcast('memory:pattern_created', { ...result, repo_path: repoPath })

    return c.json(result, 201)
  } else {
    const warning = await createWarning({
      content: data.content,
      severity: data.severity ?? 'medium',
      task_id: data.task_id,
      repo_path: repoPath,
    })

    broadcast('memory:warning_created', { ...warning, repo_path: repoPath })

    return c.json(warning, 201)
  }
})

// POST /api/memory/compact - Trigger memory compaction (placeholder)
app.post('/compact', zValidator('json', MemoryCompactRequest), async (c) => {
  const data = c.req.valid('json')

  // Placeholder: Memory compaction would be handled by a system agent
  // For now, just return a success response indicating the request was received
  return c.json({
    message: 'Memory compaction triggered',
    repo_path: data.repo_path ?? 'global',
    status: 'queued',
  })
})

export default app
