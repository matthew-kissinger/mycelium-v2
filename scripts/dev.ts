#!/usr/bin/env bun
/**
 * Mycelium v2 Development Script
 *
 * Cross-platform replacement for dev.sh
 * Works on: NixOS, Linux, macOS, Windows
 *
 * Usage:
 *   bun scripts/dev.ts start       # Start backend + frontend
 *   bun scripts/dev.ts stop        # Stop all services
 *   bun scripts/dev.ts restart     # Restart all services
 *   bun scripts/dev.ts status      # Show status
 *   bun scripts/dev.ts logs        # Tail logs
 */

import { spawn, type Subprocess } from 'bun'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { homedir, platform, networkInterfaces } from 'os'

// =============================================================================
// Configuration
// =============================================================================

const SCRIPT_DIR = dirname(import.meta.path)
const PROJECT_DIR = dirname(SCRIPT_DIR)

const IS_WINDOWS = platform() === 'win32'
const LOG_DIR = IS_WINDOWS
  ? join(process.env['TEMP'] || 'C:\\Temp', 'mycelium-v2')
  : '/tmp/mycelium-v2'

const BACKEND_LOG = join(LOG_DIR, 'backend.log')
const FRONTEND_LOG = join(LOG_DIR, 'frontend.log')
const BACKEND_PID = join(LOG_DIR, 'backend.pid')
const FRONTEND_PID = join(LOG_DIR, 'frontend.pid')

const BACKEND_PORT = parseInt(process.env['PORT'] || '8765')
const FRONTEND_PORT = parseInt(process.env['FRONTEND_PORT'] || '5765')

// Colors (ANSI codes, supported on most modern terminals including Windows Terminal)
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'
const NC = '\x1b[0m'

// =============================================================================
// Helpers
// =============================================================================

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function readPid(pidFile: string): number | null {
  try {
    if (existsSync(pidFile)) {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim())
      return isNaN(pid) ? null : pid
    }
  } catch {
    // Ignore
  }
  return null
}

function writePid(pidFile: string, pid: number): void {
  writeFileSync(pidFile, String(pid))
}

function removePid(pidFile: string): void {
  try {
    if (existsSync(pidFile)) {
      rmSync(pidFile)
    }
  } catch {
    // Ignore
  }
}

async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    // Cross-platform: try to send signal 0 (check if process exists)
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function isPortInUse(port: number): Promise<boolean> {
  try {
    const socket = await Bun.connect({
      hostname: '127.0.0.1',
      port,
    })
    socket.end()
    return true
  } catch {
    return false
  }
}

async function killPid(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 'SIGTERM')
    // Wait a bit for graceful shutdown
    await Bun.sleep(1000)

    // Check if still running
    if (await isProcessRunning(pid)) {
      // Force kill
      process.kill(pid, 'SIGKILL')
    }
    return true
  } catch {
    return false
  }
}

function getLocalIp(): string {
  const interfaces = networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

// =============================================================================
// Service Management
// =============================================================================

async function isBackendRunning(): Promise<boolean> {
  const pid = readPid(BACKEND_PID)
  if (pid && (await isProcessRunning(pid))) {
    return true
  }
  return isPortInUse(BACKEND_PORT)
}

async function isFrontendRunning(): Promise<boolean> {
  const pid = readPid(FRONTEND_PID)
  if (pid && (await isProcessRunning(pid))) {
    return true
  }
  return isPortInUse(FRONTEND_PORT)
}

async function startBackend(): Promise<boolean> {
  if (await isBackendRunning()) {
    console.log(`${YELLOW}Backend already running on port ${BACKEND_PORT}${NC}`)
    return true
  }

  console.log(`${GREEN}Starting backend...${NC}`)

  const logFile = Bun.file(BACKEND_LOG)
  const logWriter = logFile.writer()

  const proc = spawn({
    cmd: ['bun', 'run', 'dev:server'],
    cwd: PROJECT_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Write PID
  if (proc.pid) {
    writePid(BACKEND_PID, proc.pid)
  }

  // Stream output to log file
  ;(async () => {
    const reader = proc.stdout.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      logWriter.write(value)
    }
  })()
  ;(async () => {
    const reader = proc.stderr.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      logWriter.write(value)
    }
  })()

  // Wait for server to be ready
  await Bun.sleep(2000)

  if (await isBackendRunning()) {
    console.log(`${GREEN}Backend started on http://0.0.0.0:${BACKEND_PORT}${NC}`)
    return true
  } else {
    console.log(`${RED}Backend failed to start. Check ${BACKEND_LOG}${NC}`)
    return false
  }
}

async function startFrontend(): Promise<boolean> {
  if (await isFrontendRunning()) {
    console.log(`${YELLOW}Frontend already running on port ${FRONTEND_PORT}${NC}`)
    return true
  }

  console.log(`${GREEN}Starting frontend...${NC}`)

  const logFile = Bun.file(FRONTEND_LOG)
  const logWriter = logFile.writer()

  const proc = spawn({
    cmd: ['bun', 'run', 'dev:client'],
    cwd: PROJECT_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Write PID
  if (proc.pid) {
    writePid(FRONTEND_PID, proc.pid)
  }

  // Stream output to log file
  ;(async () => {
    const reader = proc.stdout.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      logWriter.write(value)
    }
  })()
  ;(async () => {
    const reader = proc.stderr.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      logWriter.write(value)
    }
  })()

  // Wait for server to be ready
  await Bun.sleep(3000)

  if (await isFrontendRunning()) {
    console.log(`${GREEN}Frontend started on http://0.0.0.0:${FRONTEND_PORT}${NC}`)
    return true
  } else {
    console.log(`${RED}Frontend failed to start. Check ${FRONTEND_LOG}${NC}`)
    return false
  }
}

async function stopBackend(): Promise<void> {
  const pid = readPid(BACKEND_PID)
  if (pid && (await isProcessRunning(pid))) {
    console.log(`${YELLOW}Stopping backend (PID: ${pid})...${NC}`)
    await killPid(pid)
    console.log(`${GREEN}Backend stopped${NC}`)
  } else {
    console.log(`${YELLOW}Backend not running${NC}`)
  }
  removePid(BACKEND_PID)
}

async function stopFrontend(): Promise<void> {
  const pid = readPid(FRONTEND_PID)
  if (pid && (await isProcessRunning(pid))) {
    console.log(`${YELLOW}Stopping frontend (PID: ${pid})...${NC}`)
    await killPid(pid)
    console.log(`${GREEN}Frontend stopped${NC}`)
  } else {
    console.log(`${YELLOW}Frontend not running${NC}`)
  }
  removePid(FRONTEND_PID)
}

// =============================================================================
// Commands
// =============================================================================

async function cmdStart(): Promise<void> {
  console.log(`${BLUE}Starting Mycelium v2...${NC}`)
  ensureLogDir()

  const backendOk = await startBackend()
  if (!backendOk) {
    return
  }

  await startFrontend()

  const localIp = getLocalIp()
  console.log('')
  console.log(`${GREEN}Mycelium v2 is running!${NC}`)
  console.log(`  Backend:  http://${localIp}:${BACKEND_PORT}`)
  console.log(`  Frontend: http://${localIp}:${FRONTEND_PORT}`)
  console.log(`  API:      http://${localIp}:${BACKEND_PORT}/api/health`)
}

async function cmdStop(): Promise<void> {
  console.log(`${BLUE}Stopping Mycelium v2...${NC}`)
  await stopBackend()
  await stopFrontend()
  console.log(`${GREEN}Mycelium v2 stopped${NC}`)
}

async function cmdRestart(): Promise<void> {
  await cmdStop()
  await Bun.sleep(1000)
  await cmdStart()
}

async function cmdStatus(): Promise<void> {
  console.log(`${BLUE}Mycelium v2 Status${NC}`)
  console.log('')

  const backendRunning = await isBackendRunning()
  const backendPid = readPid(BACKEND_PID)

  if (backendRunning) {
    console.log(`  Backend:  ${GREEN}Running${NC} (PID: ${backendPid || 'unknown'}, port ${BACKEND_PORT})`)

    // Check health
    try {
      const resp = await fetch(`http://localhost:${BACKEND_PORT}/api/health`)
      const health = await resp.text()
      console.log(`  Health:   ${health}`)
    } catch {
      console.log(`  Health:   ${RED}unreachable${NC}`)
    }
  } else {
    console.log(`  Backend:  ${RED}Stopped${NC}`)
  }

  console.log('')

  const frontendRunning = await isFrontendRunning()
  const frontendPid = readPid(FRONTEND_PID)

  if (frontendRunning) {
    console.log(`  Frontend: ${GREEN}Running${NC} (PID: ${frontendPid || 'unknown'}, port ${FRONTEND_PORT})`)
  } else {
    console.log(`  Frontend: ${RED}Stopped${NC}`)
  }

  const localIp = getLocalIp()
  console.log('')
  console.log(`${BLUE}Network Access:${NC}`)
  console.log(`  Backend:  http://${localIp}:${BACKEND_PORT}`)
  console.log(`  Frontend: http://${localIp}:${FRONTEND_PORT}`)
}

async function cmdLogs(target: string = 'all'): Promise<void> {
  ensureLogDir()

  const tailLog = async (logPath: string, label: string) => {
    if (!existsSync(logPath)) {
      console.log(`${YELLOW}No log file: ${logPath}${NC}`)
      return
    }

    console.log(`${BLUE}=== ${label} ===${NC}`)

    // Read last 50 lines
    const content = readFileSync(logPath, 'utf-8')
    const lines = content.trim().split('\n').slice(-50)
    console.log(lines.join('\n'))
  }

  switch (target) {
    case 'backend':
    case 'server':
      await tailLog(BACKEND_LOG, 'Backend logs')
      break
    case 'frontend':
    case 'client':
      await tailLog(FRONTEND_LOG, 'Frontend logs')
      break
    case 'all':
    default:
      await tailLog(BACKEND_LOG, 'Backend logs')
      console.log('')
      await tailLog(FRONTEND_LOG, 'Frontend logs')
  }
}

async function cmdClean(deep: boolean = false): Promise<void> {
  console.log(`${BLUE}Cleaning up...${NC}`)

  await cmdStop()

  // Clean logs
  if (existsSync(LOG_DIR)) {
    rmSync(LOG_DIR, { recursive: true })
    console.log(`${GREEN}Cleaned log files${NC}`)
  }

  if (deep) {
    console.log(`${YELLOW}Deep clean: removing node_modules...${NC}`)
    const nodeModulesPath = join(PROJECT_DIR, 'node_modules')
    if (existsSync(nodeModulesPath)) {
      rmSync(nodeModulesPath, { recursive: true })
    }

    // Clean package node_modules
    for (const pkg of ['shared', 'server', 'client', 'cli', 'mcp']) {
      const pkgNodeModules = join(PROJECT_DIR, 'packages', pkg, 'node_modules')
      if (existsSync(pkgNodeModules)) {
        rmSync(pkgNodeModules, { recursive: true })
      }
    }
    console.log(`${GREEN}Removed node_modules${NC}`)
  }

  console.log(`${GREEN}Cleanup complete${NC}`)
}

async function cmdBuild(): Promise<void> {
  console.log(`${BLUE}Building Mycelium v2...${NC}`)

  const proc = spawn({
    cmd: ['bun', 'run', 'build'],
    cwd: PROJECT_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await proc.exited

  if (exitCode === 0) {
    console.log(`${GREEN}Build complete${NC}`)
  } else {
    console.log(`${RED}Build failed with exit code ${exitCode}${NC}`)
  }
}

async function cmdBuildRestart(): Promise<void> {
  console.log(`${BLUE}Build + Restart...${NC}`)

  const proc = spawn({
    cmd: ['bun', 'run', 'build'],
    cwd: PROJECT_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    console.log(`${RED}Build failed (exit ${exitCode}) - not restarting${NC}`)
    return
  }

  console.log(`${GREEN}Build succeeded, restarting...${NC}`)
  await cmdRestart()
}

async function cmdScheduler(action: string): Promise<void> {
  if (action !== 'start' && action !== 'stop') {
    console.log(`Usage: bun scripts/dev.ts scheduler <start|stop>`)
    return
  }

  const url = `http://localhost:${BACKEND_PORT}/api/scheduler/${action}`
  try {
    const resp = await fetch(url, { method: 'POST' })
    if (!resp.ok) {
      const body = await resp.text()
      console.log(`${RED}Scheduler ${action} failed: ${resp.status} ${body}${NC}`)
      return
    }
    const data = await resp.json() as Record<string, unknown>
    console.log(`${GREEN}Scheduler ${action}: ${data.status ?? 'ok'}${NC}`)
  } catch (err) {
    console.log(`${RED}Cannot reach backend at port ${BACKEND_PORT}${NC}`)
  }
}

async function cmdCheck(): Promise<void> {
  console.log(`${BLUE}Mycelium v2 Check${NC}`)
  console.log('')

  // Fetch stats and scheduler status in parallel
  let stats: Record<string, unknown> | null = null
  let scheduler: Record<string, unknown> | null = null

  try {
    const [statsResp, schedResp] = await Promise.all([
      fetch(`http://localhost:${BACKEND_PORT}/api/stats`).catch(() => null),
      fetch(`http://localhost:${BACKEND_PORT}/api/scheduler/status`).catch(() => null),
    ])

    if (statsResp?.ok) stats = await statsResp.json() as Record<string, unknown>
    if (schedResp?.ok) scheduler = await schedResp.json() as Record<string, unknown>
  } catch {
    console.log(`${RED}Cannot reach backend at port ${BACKEND_PORT}${NC}`)
    return
  }

  if (!stats && !scheduler) {
    console.log(`${RED}Backend not responding${NC}`)
    return
  }

  // Tasks summary
  if (stats) {
    console.log(`${BLUE}Tasks${NC}`)
    const byStatus = stats.by_status ?? stats.byStatus ?? stats
    if (typeof byStatus === 'object' && byStatus !== null) {
      for (const [status, count] of Object.entries(byStatus as Record<string, number>)) {
        const color = status === 'failed' || status === 'cancelled' ? RED
          : status === 'running' ? GREEN
          : status === 'done' ? GREEN
          : YELLOW
        console.log(`  ${color}${status}${NC}: ${count}`)
      }
    }
    if (stats.total !== undefined) {
      console.log(`  total: ${stats.total}`)
    }
    console.log('')
  }

  // Scheduler summary
  if (scheduler) {
    const running = scheduler.running ?? scheduler.status === 'running'
    const statusColor = running ? GREEN : RED
    console.log(`${BLUE}Scheduler${NC}: ${statusColor}${running ? 'running' : 'stopped'}${NC}`)

    const cycles = scheduler.cycles as Record<string, unknown>[] | undefined
    if (Array.isArray(cycles)) {
      for (const cycle of cycles) {
        const name = cycle.name ?? cycle.id ?? '?'
        const lastRun = cycle.last_run ?? cycle.lastRun
        const ago = lastRun ? timeSince(lastRun as string) : 'never'
        console.log(`  ${name}: last ${ago}`)
      }
    }

    const activeRuns = scheduler.active_runs ?? scheduler.activeRuns
    if (Array.isArray(activeRuns) && activeRuns.length > 0) {
      console.log('')
      console.log(`${BLUE}Active Agents${NC}`)
      for (const run of activeRuns) {
        console.log(`  ${run.agent_type ?? run.type}: ${run.status ?? 'running'}`)
      }
    }
  }
}

function timeSince(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function cmdHelp(): void {
  console.log('Mycelium v2 Development Script')
  console.log('')
  console.log('Usage: bun scripts/dev.ts <command> [options]')
  console.log('')
  console.log('Commands:')
  console.log('  start              Start backend and frontend servers')
  console.log('  stop               Stop all servers')
  console.log('  restart            Restart all servers')
  console.log('  status             Show server status and health')
  console.log('  logs               Show logs (backend|frontend|all)')
  console.log('  clean              Stop servers and clean logs (--deep for node_modules)')
  console.log('  build              Build all packages')
  console.log('  build-restart      Build then restart servers')
  console.log('  scheduler <start|stop>  Start or stop the scheduler via API')
  console.log('  check              Show task stats and scheduler status')
  console.log('  help               Show this help')
  console.log('')
  console.log('Examples:')
  console.log('  bun scripts/dev.ts start              # Start all services')
  console.log('  bun scripts/dev.ts logs backend       # Show backend logs')
  console.log('  bun scripts/dev.ts build-restart      # Build + restart')
  console.log('  bun scripts/dev.ts scheduler start    # Start scheduler')
  console.log('  bun scripts/dev.ts check              # System summary')
  console.log('  bun scripts/dev.ts clean --deep       # Full cleanup including node_modules')
}

// =============================================================================
// Main
// =============================================================================

const args = process.argv.slice(2)
const command = args[0] || 'help'

switch (command) {
  case 'start':
    await cmdStart()
    break
  case 'stop':
    await cmdStop()
    break
  case 'restart':
    await cmdRestart()
    break
  case 'status':
    await cmdStatus()
    break
  case 'logs':
    await cmdLogs(args[1])
    break
  case 'clean':
    await cmdClean(args.includes('--deep'))
    break
  case 'build':
    await cmdBuild()
    break
  case 'build-restart':
    await cmdBuildRestart()
    break
  case 'scheduler':
    await cmdScheduler(args[1])
    break
  case 'check':
    await cmdCheck()
    break
  case 'help':
  default:
    cmdHelp()
}
