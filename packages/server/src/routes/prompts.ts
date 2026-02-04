/**
 * Prompts API Routes
 *
 * GET/PATCH endpoints for system agent prompts:
 * - /api/prompts - List all prompts
 * - /api/prompts/:id - Get specific prompt
 * - /api/prompts/:id/reset - Reset to default
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  listPrompts,
  getPrompt,
  getEffectivePrompt,
  saveCustomPrompt,
  deleteCustomPrompt,
  getPromptsConfigPath,
} from '../config'
import { buildMycelContext, buildAgentsSection } from '../prompts/context'

const app = new Hono()

// GET /api/prompts - List all prompts
app.get('/', async (c) => {
  const prompts = listPrompts()

  return c.json({
    prompts: prompts.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      agent: p.agent,
      templateVariables: p.templateVariables,
      isCustomized: p.isCustomized,
      contentLength: p.content.length,
    })),
    config_path: getPromptsConfigPath(),
    total: prompts.length,
    customized: prompts.filter((p) => p.isCustomized).length,
  })
})

// GET /api/prompts/:id - Get specific prompt with full content
app.get('/:id', async (c) => {
  const promptId = c.req.param('id')
  const prompt = getPrompt(promptId)

  if (!prompt) {
    return c.json({ error: `Prompt not found: ${promptId}` }, 404)
  }

  return c.json({
    id: prompt.id,
    name: prompt.name,
    description: prompt.description,
    agent: prompt.agent,
    templateVariables: prompt.templateVariables,
    content: prompt.content,
    customContent: prompt.customContent,
    isCustomized: prompt.isCustomized,
    effectiveContent: prompt.customContent ?? prompt.content,
  })
})

// Validation schema for prompt updates
const PromptUpdateSchema = z.object({
  content: z.string().min(1),
})

// PATCH /api/prompts/:id - Update prompt with custom content
app.patch('/:id', zValidator('json', PromptUpdateSchema), async (c) => {
  const promptId = c.req.param('id')
  const { content } = c.req.valid('json')

  // Verify prompt exists
  const existing = getPrompt(promptId)
  if (!existing) {
    return c.json({ error: `Prompt not found: ${promptId}` }, 404)
  }

  // Save custom content
  saveCustomPrompt(promptId, content)

  // Return updated prompt
  const updated = getPrompt(promptId)
  return c.json({
    message: `Prompt ${promptId} updated`,
    id: updated?.id,
    name: updated?.name,
    isCustomized: true,
  })
})

// POST /api/prompts/:id/reset - Reset prompt to default
app.post('/:id/reset', async (c) => {
  const promptId = c.req.param('id')

  // Verify prompt exists
  const existing = getPrompt(promptId)
  if (!existing) {
    return c.json({ error: `Prompt not found: ${promptId}` }, 404)
  }

  // Delete custom content
  deleteCustomPrompt(promptId)

  return c.json({
    message: `Prompt ${promptId} reset to default`,
    id: promptId,
    isCustomized: false,
  })
})

// GET /api/prompts/:id/variables - Get resolved template variable values
app.get('/:id/variables', async (c) => {
  const promptId = c.req.param('id')
  const prompt = getPrompt(promptId)

  if (!prompt) {
    return c.json({ error: `Prompt not found: ${promptId}` }, 404)
  }

  // Resolve each template variable to its current value
  const variables: Record<string, { value: string; length: number }> = {}

  for (const varName of prompt.templateVariables) {
    let value = ''
    switch (varName) {
      case 'MYCEL_CONTEXT':
        value = buildMycelContext({ role: prompt.agent })
        break
      case 'AGENTS_SECTION':
        value = buildAgentsSection()
        break
      case 'repo_path':
        value = '(resolved at runtime per-repo)'
        break
      case 'repo_name':
        value = '(resolved at runtime per-repo)'
        break
      default:
        value = `(unknown variable: ${varName})`
    }
    variables[varName] = { value, length: value.length }
  }

  return c.json({
    id: promptId,
    templateVariables: prompt.templateVariables,
    variables,
  })
})

// GET /api/prompts/:id/preview - Get prompt with variables resolved
app.get('/:id/preview', async (c) => {
  const promptId = c.req.param('id')
  const repoPath = c.req.query('repo_path') ?? '/example/repo'
  const prompt = getPrompt(promptId)

  if (!prompt) {
    return c.json({ error: `Prompt not found: ${promptId}` }, 404)
  }

  const effectiveContent = prompt.customContent ?? prompt.content
  let resolved = effectiveContent

  // Replace template variables with resolved values
  const replacements: Record<string, string> = {
    '{MYCEL_CONTEXT}': buildMycelContext({ role: prompt.agent }),
    '{AGENTS_SECTION}': buildAgentsSection(),
    '{repo_path}': repoPath,
    '{repo_name}': repoPath.split('/').pop() || repoPath,
  }

  for (const [placeholder, value] of Object.entries(replacements)) {
    resolved = resolved.replaceAll(placeholder, value)
  }

  return c.json({
    id: promptId,
    preview: resolved,
    length: resolved.length,
    repo_path: repoPath,
  })
})

export default app
