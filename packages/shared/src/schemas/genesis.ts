import { z } from 'zod'

/**
 * Genesis Agent configuration.
 *
 * Genesis creates new repositories with full agent plumbing.
 */
export const GenesisConfig = z.object({
  enabled: z.boolean().default(false),
  interval_sec: z.number().int().positive().default(43200), // 12 hours
  auto_create: z.boolean().default(false), // If true, create repos directly; if false, send alignment
  default_public: z.boolean().default(true),
  default_language: z.string().optional(),
  repos_dir: z.string().default('~/repos'),
  last_run: z.string().datetime().optional(),
})
export type GenesisConfig = z.infer<typeof GenesisConfig>

/**
 * Default genesis configuration.
 */
export const DEFAULT_GENESIS_CONFIG: GenesisConfig = {
  enabled: false,
  interval_sec: 43200, // 12 hours
  auto_create: false,
  default_public: true,
  default_language: undefined,
  repos_dir: '~/repos',
  last_run: undefined,
}
