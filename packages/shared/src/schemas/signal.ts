import { z } from 'zod'

// Signal status
export const SignalStatus = z.enum(['pending', 'responded', 'expired'])
export type SignalStatus = z.infer<typeof SignalStatus>

// Alignment signal - for human-in-the-loop
export const Signal = z.object({
  id: z.string().uuid(),
  question: z.string(),
  options: z.array(z.string()).optional(),
  status: SignalStatus.default('pending'),
  response: z.string().optional(),
  task_id: z.string().uuid().optional(),
  repo_path: z.string().optional(),
  created_at: z.string().datetime(),
  responded_at: z.string().datetime().optional(),
})
export type Signal = z.infer<typeof Signal>

// Signal creation
export const SignalCreate = z.object({
  question: z.string().min(1),
  options: z.array(z.string()).optional(),
  task_id: z.string().uuid().optional(),
  repo_path: z.string().optional(),
})
export type SignalCreate = z.infer<typeof SignalCreate>
