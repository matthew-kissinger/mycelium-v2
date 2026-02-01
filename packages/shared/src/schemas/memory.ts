import { z } from 'zod'

// Memory pattern - learned from task execution
export const MemoryPattern = z.object({
  id: z.string(),
  content: z.string(),
  source: z.enum(['shepherd', 'manual', 'discovery']),
  task_id: z.string().uuid().optional(),
  repo_path: z.string().optional(),
  tags: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
})
export type MemoryPattern = z.infer<typeof MemoryPattern>

// Memory warning - things to avoid
export const MemoryWarning = z.object({
  id: z.string(),
  content: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  task_id: z.string().uuid().optional(),
  repo_path: z.string().optional(),
  created_at: z.string().datetime(),
})
export type MemoryWarning = z.infer<typeof MemoryWarning>

// Repo memory container
export const RepoMemory = z.object({
  repo_path: z.string(),
  patterns: z.array(MemoryPattern).default([]),
  warnings: z.array(MemoryWarning).default([]),
})
export type RepoMemory = z.infer<typeof RepoMemory>
