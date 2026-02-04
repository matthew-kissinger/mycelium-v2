/**
 * Cline Instance Pool
 *
 * Manages multiple cline instances for concurrent task execution.
 * Each cline instance runs one task at a time, so we need multiple
 * instances to run multiple cline tasks in parallel.
 */

import { spawn } from 'bun'

interface ClineInstance {
  address: string
  pid: number
  inUse: boolean
  createdAt: Date
}

// Pool of available cline instances
const instancePool: ClineInstance[] = []

// Maximum instances to keep in the pool
const MAX_POOL_SIZE = 4

/**
 * Get an available cline instance, creating one if needed.
 * Returns the gRPC address to use with --address flag.
 */
export async function acquireClineInstance(): Promise<string> {
  // First, try to find an existing unused instance
  const available = instancePool.find(i => !i.inUse)
  if (available) {
    available.inUse = true
    console.log(`[ClinePool] Reusing instance at ${available.address}`)
    return available.address
  }

  // If pool is at max, wait for one to become available
  if (instancePool.length >= MAX_POOL_SIZE) {
    console.log(`[ClinePool] Pool at max (${MAX_POOL_SIZE}), waiting for available instance...`)
    // In practice, this should be rare since tasks complete
    // For now, just return the first one and let cline handle the conflict
    const first = instancePool[0]
    first.inUse = true
    return first.address
  }

  // Create a new instance
  const instance = await createClineInstance()
  if (instance) {
    instancePool.push(instance)
    return instance.address
  }

  // Fallback to default if creation fails
  console.warn('[ClinePool] Failed to create instance, using default')
  return 'localhost:50052'
}

/**
 * Release a cline instance back to the pool.
 */
export function releaseClineInstance(address: string): void {
  const instance = instancePool.find(i => i.address === address)
  if (instance) {
    instance.inUse = false
    console.log(`[ClinePool] Released instance at ${address}`)
  }
}

/**
 * Create a new cline instance.
 */
async function createClineInstance(): Promise<ClineInstance | null> {
  try {
    const proc = spawn({
      cmd: ['cline', 'instance', 'new', '-F', 'plain'],
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const output = await new Response(proc.stdout).text()
    await proc.exited

    // Parse the address from output
    // Format: "  Address: 127.0.0.1:43911"
    const addressMatch = output.match(/Address:\s*([\d.:]+)/)
    if (!addressMatch) {
      console.error('[ClinePool] Could not parse instance address from:', output)
      return null
    }

    const address = addressMatch[1]
    console.log(`[ClinePool] Created new instance at ${address}`)

    // Get PID from instance list (for cleanup)
    const listProc = spawn({
      cmd: ['cline', 'instance', 'list', '-F', 'plain'],
      stdout: 'pipe',
    })
    const listOutput = await new Response(listProc.stdout).text()
    await listProc.exited

    // Parse PID from list output
    const pidMatch = listOutput.match(new RegExp(`${address.replace('.', '\\.')}.*?\\s+(\\d+)\\s+CLI`))
    const pid = pidMatch ? parseInt(pidMatch[1]) : 0

    return {
      address,
      pid,
      inUse: true,
      createdAt: new Date(),
    }
  } catch (error) {
    console.error('[ClinePool] Error creating instance:', error)
    return null
  }
}

/**
 * Clean up all cline instances on shutdown.
 */
export async function cleanupClineInstances(): Promise<void> {
  console.log(`[ClinePool] Cleaning up ${instancePool.length} instances...`)

  for (const instance of instancePool) {
    try {
      const proc = spawn({
        cmd: ['cline', 'instance', 'kill', instance.address],
        stdout: 'ignore',
        stderr: 'ignore',
      })
      await proc.exited
    } catch {
      // Ignore errors during cleanup
    }
  }

  instancePool.length = 0
  console.log('[ClinePool] Cleanup complete')
}

/**
 * Get pool status for debugging.
 */
export function getClinePoolStatus(): { total: number; inUse: number; available: number } {
  const inUse = instancePool.filter(i => i.inUse).length
  return {
    total: instancePool.length,
    inUse,
    available: instancePool.length - inUse,
  }
}
