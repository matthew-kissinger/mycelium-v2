import { z } from 'zod'

/**
 * Hook event types for Telegram notifications.
 */
export const HookEventType = z.enum([
  'task:created',
  'task:started',
  'task:completed',
  'task:failed',
  'signal:created',
  'signal:responded',
  'shepherd:evaluation',
])
export type HookEventType = z.infer<typeof HookEventType>

/**
 * Webhook configuration for a single hook.
 */
export const WebhookConfig = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT']).default('POST'),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
})
export type WebhookConfig = z.infer<typeof WebhookConfig>

/**
 * Hooks configuration - webhooks for system events.
 */
export const HooksConfig = z.object({
  hooks: z.record(z.string(), z.array(WebhookConfig)).default({}),
  global_headers: z.record(z.string(), z.string()).optional(),
  timeout_ms: z.number().int().positive().default(5000),
  retry_count: z.number().int().nonnegative().default(0),
})
export type HooksConfig = z.infer<typeof HooksConfig>

/**
 * Default hooks configuration.
 */
export const DEFAULT_HOOKS_CONFIG: HooksConfig = {
  hooks: {},
  global_headers: undefined,
  timeout_ms: 5000,
  retry_count: 0,
}
