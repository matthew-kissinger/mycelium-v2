import { z } from 'zod'

// Repo mode - auto creates tasks, align requires approval
export const RepoMode = z.enum(['auto', 'align'])
export type RepoMode = z.infer<typeof RepoMode>

// Network repository
export const Repo = z.object({
  id: z.string().uuid(),
  path: z.string(),
  name: z.string(),
  description: z.string().optional(),
  language: z.string().optional(),
  mode: RepoMode.default('align'),
  weight: z.number().int().min(0).max(100).default(50), // Allocation weight for discovery selection
  created_at: z.string().datetime(),
  last_scanned_at: z.string().datetime().optional(),
})
export type Repo = z.infer<typeof Repo>

// Repo registration input
export const RepoCreate = z.object({
  path: z.string().min(1),
  description: z.string().optional(),
  mode: RepoMode.optional(),
  weight: z.number().int().min(0).max(100).optional(),
})
export type RepoCreate = z.infer<typeof RepoCreate>
