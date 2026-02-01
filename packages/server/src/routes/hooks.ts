import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { HookEventType, WebhookConfig, HooksConfig } from '@mycelium/shared'
import { loadHooksConfig, saveHooksConfig, getHooksConfigPath } from '../config'

const app = new Hono()

// =============================================================================
// Local type aliases for backward compatibility
// =============================================================================
type HookType = z.infer<typeof HookEventType>

// =============================================================================
// GET /api/hooks/status - Get hooks config
// =============================================================================
app.get('/status', async (c) => {
  const config = loadHooksConfig()

  // Count hooks by type
  const hookCounts: Record<string, number> = {}
  for (const [type, webhooks] of Object.entries(config.hooks)) {
    hookCounts[type] = webhooks.filter((w) => w.enabled).length
  }

  return c.json({
    config_path: getHooksConfigPath(),
    timeout_ms: config.timeout_ms,
    retry_count: config.retry_count,
    global_headers: config.global_headers ? Object.keys(config.global_headers) : [],
    hooks: hookCounts,
    total_hooks: Object.values(hookCounts).reduce((a, b) => a + b, 0),
  })
})

// =============================================================================
// POST /api/hooks/configure - Configure hooks
// =============================================================================
const ConfigureHooksRequest = z.object({
  hook_type: HookEventType,
  action: z.enum(['add', 'remove', 'update', 'clear']),
  webhook: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT']).default('POST'),
    headers: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().default(true),
  }).optional(),
  webhook_index: z.number().int().nonnegative().optional(),
  global_headers: z.record(z.string(), z.string()).optional(),
  timeout_ms: z.number().int().positive().optional(),
  retry_count: z.number().int().nonnegative().optional(),
})

app.post('/configure', zValidator('json', ConfigureHooksRequest), async (c) => {
  const data = c.req.valid('json')
  const config = loadHooksConfig()

  // Update global settings if provided
  if (data.global_headers !== undefined) {
    config.global_headers = data.global_headers
  }
  if (data.timeout_ms !== undefined) {
    config.timeout_ms = data.timeout_ms
  }
  if (data.retry_count !== undefined) {
    config.retry_count = data.retry_count
  }

  // Initialize hook array if needed
  if (!config.hooks[data.hook_type]) {
    config.hooks[data.hook_type] = []
  }

  const hooks = config.hooks[data.hook_type]!

  switch (data.action) {
    case 'add':
      if (!data.webhook) {
        return c.json({ error: 'webhook is required for add action' }, 400)
      }
      hooks.push(data.webhook)
      break

    case 'remove':
      if (data.webhook_index === undefined) {
        return c.json({ error: 'webhook_index is required for remove action' }, 400)
      }
      if (data.webhook_index < 0 || data.webhook_index >= hooks.length) {
        return c.json({ error: 'webhook_index out of range' }, 400)
      }
      hooks.splice(data.webhook_index, 1)
      break

    case 'update':
      if (data.webhook_index === undefined) {
        return c.json({ error: 'webhook_index is required for update action' }, 400)
      }
      if (!data.webhook) {
        return c.json({ error: 'webhook is required for update action' }, 400)
      }
      if (data.webhook_index < 0 || data.webhook_index >= hooks.length) {
        return c.json({ error: 'webhook_index out of range' }, 400)
      }
      hooks[data.webhook_index] = data.webhook
      break

    case 'clear':
      config.hooks[data.hook_type] = []
      break
  }

  saveHooksConfig(config)

  return c.json({
    message: `Hook configuration updated for ${data.hook_type}`,
    hook_type: data.hook_type,
    hooks_count: config.hooks[data.hook_type]?.length ?? 0,
  })
})

// =============================================================================
// POST /api/hooks/test - Test a webhook
// =============================================================================
const TestHookRequest = z.object({
  hook_type: HookEventType,
  webhook: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT']).default('POST'),
    headers: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().default(true),
  }).optional(),
  webhook_index: z.number().int().nonnegative().optional(),
  test_payload: z.record(z.string(), z.unknown()).optional(),
})

app.post('/test', zValidator('json', TestHookRequest), async (c) => {
  const data = c.req.valid('json')
  const config = loadHooksConfig()

  // Determine which webhook to test
  let webhook: z.infer<typeof WebhookConfig> | undefined

  if (data.webhook) {
    // Test provided webhook directly
    webhook = data.webhook
  } else if (data.webhook_index !== undefined) {
    // Test existing webhook by index
    const hooks = config.hooks[data.hook_type]
    if (!hooks || data.webhook_index >= hooks.length) {
      return c.json({ error: 'webhook_index out of range or no hooks configured' }, 400)
    }
    webhook = hooks[data.webhook_index]
  } else {
    return c.json({ error: 'Either webhook or webhook_index is required' }, 400)
  }

  // Build test payload
  const testPayload = data.test_payload ?? {
    event: data.hook_type,
    test: true,
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test hook from Mycelium',
    },
  }

  // Merge headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.global_headers,
    ...webhook.headers,
  }

  // Send test request
  const startTime = Date.now()
  try {
    const response = await fetch(webhook.url, {
      method: webhook.method,
      headers,
      body: webhook.method !== 'GET' ? JSON.stringify(testPayload) : undefined,
      signal: AbortSignal.timeout(config.timeout_ms),
    })

    const duration = Date.now() - startTime
    const responseText = await response.text()

    return c.json({
      success: response.ok,
      status_code: response.status,
      status_text: response.statusText,
      response_body: responseText.slice(0, 1000), // Truncate long responses
      duration_ms: duration,
      webhook_url: webhook.url,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration_ms: duration,
      webhook_url: webhook.url,
    }, 500)
  }
})

// =============================================================================
// Export hook execution function for use by other modules
// =============================================================================
export async function executeHooks(hookType: HookType, payload: Record<string, unknown>): Promise<void> {
  const config = loadHooksConfig()
  const hooks = config.hooks[hookType]

  if (!hooks || hooks.length === 0) {
    return
  }

  for (const webhook of hooks) {
    if (!webhook.enabled) continue

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.global_headers,
      ...webhook.headers,
    }

    try {
      await fetch(webhook.url, {
        method: webhook.method,
        headers,
        body: webhook.method !== 'GET' ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(config.timeout_ms),
      })
    } catch (error) {
      console.error(`[HOOKS] Failed to execute ${hookType} hook to ${webhook.url}:`, error)
    }
  }
}

export default app
