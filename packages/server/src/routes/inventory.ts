/**
 * Inventory API Routes - skills and MCP servers
 */

import { Hono } from 'hono'
import { getInventory, getInstalledSkills, getMcpServers } from '../config/inventory'
import { runArmoryCycle, shouldRunArmory } from '../scheduler/cycles/armory'
import { getSchedulerConfig } from '../scheduler'

const app = new Hono()

// GET /api/inventory - Get full inventory
app.get('/', async (c) => {
  const inventory = getInventory()
  return c.json({
    skills: inventory.skills,
    mcps: inventory.mcps,
    skills_count: inventory.skills.length,
    mcps_count: inventory.mcps.length,
  })
})

// GET /api/inventory/skills - Get skills only
app.get('/skills', async (c) => {
  const skills = getInstalledSkills()
  return c.json({
    skills,
    count: skills.length,
  })
})

// GET /api/inventory/mcps - Get MCP servers only
app.get('/mcps', async (c) => {
  const mcps = getMcpServers()
  return c.json({
    mcps,
    count: mcps.length,
  })
})

// POST /api/inventory/armory - Trigger armory cycle manually
app.post('/armory', async (c) => {
  const config = getSchedulerConfig()

  // Check if there are enough tasks (or force with query param)
  const force = c.req.query('force') === 'true'
  const canRun = force || await shouldRunArmory(config)

  if (!canRun) {
    return c.json({
      message: 'Not enough unreviewed tasks to trigger armory',
      threshold: config.armory_batch_size ?? 10,
    }, 400)
  }

  // Run in background
  runArmoryCycle(config).catch((error) => {
    console.error('[Armory] Manual trigger error:', error)
  })

  return c.json({
    message: 'Armory cycle triggered',
    force,
  })
})

// GET /api/inventory/armory/status - Get armory status
app.get('/armory/status', async (c) => {
  const config = getSchedulerConfig()
  const canRun = await shouldRunArmory(config)

  return c.json({
    enabled: config.armory_enabled,
    batch_size: config.armory_batch_size ?? 10,
    ready_to_run: canRun,
  })
})

export default app
