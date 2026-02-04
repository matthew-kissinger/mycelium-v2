/**
 * Platform Abstraction Layer
 *
 * Provides cross-platform compatibility for:
 * - File paths (Unix vs Windows)
 * - Process management (kill signals, process listing)
 * - Config directories (XDG vs AppData)
 * - Shell commands
 *
 * Supports: NixOS, Linux, macOS, Windows
 */

import { homedir, platform, type } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

// =============================================================================
// Platform Detection
// =============================================================================

export type Platform = 'linux' | 'darwin' | 'win32' | 'nixos'

/**
 * Get the current platform.
 * Distinguishes NixOS from other Linux distributions.
 */
export function getPlatform(): Platform {
  const os = platform()

  if (os === 'linux') {
    // Check if running on NixOS
    if (existsSync('/etc/NIXOS') || existsSync('/run/current-system/nixos-version')) {
      return 'nixos'
    }
    return 'linux'
  }

  if (os === 'darwin') return 'darwin'
  if (os === 'win32') return 'win32'

  // Fallback
  return 'linux'
}

export const PLATFORM = getPlatform()
export const IS_WINDOWS = PLATFORM === 'win32'
export const IS_MACOS = PLATFORM === 'darwin'
export const IS_LINUX = PLATFORM === 'linux' || PLATFORM === 'nixos'
export const IS_NIXOS = PLATFORM === 'nixos'

// =============================================================================
// Paths
// =============================================================================

/**
 * Get the user's home directory.
 */
export function getHomeDir(): string {
  return homedir()
}

/**
 * Get the config directory for Mycelium.
 * - Linux/NixOS: ~/.config/mycelium-v2
 * - macOS: ~/Library/Application Support/mycelium-v2
 * - Windows: %APPDATA%/mycelium-v2
 */
export function getConfigDir(): string {
  // Allow override via environment
  if (process.env['MYCELIUM_DATA_DIR']) {
    return process.env['MYCELIUM_DATA_DIR']
  }

  const home = getHomeDir()

  switch (PLATFORM) {
    case 'win32':
      return process.env['APPDATA']
        ? join(process.env['APPDATA'], 'mycelium-v2')
        : join(home, 'AppData', 'Roaming', 'mycelium-v2')

    case 'darwin':
      return join(home, 'Library', 'Application Support', 'mycelium-v2')

    case 'linux':
    case 'nixos':
    default:
      return process.env['XDG_CONFIG_HOME']
        ? join(process.env['XDG_CONFIG_HOME'], 'mycelium-v2')
        : join(home, '.config', 'mycelium-v2')
  }
}

/**
 * Get the database path.
 */
export function getDatabasePath(): string {
  if (process.env['DATABASE_PATH']) {
    return process.env['DATABASE_PATH']
  }
  return join(getConfigDir(), 'mycelium.db')
}

/**
 * Get the logs directory.
 */
export function getLogsDir(): string {
  return join(getConfigDir(), 'logs')
}

/**
 * Get the Claude skills directory.
 * - Unix: ~/.claude/skills
 * - Windows: %USERPROFILE%/.claude/skills
 */
export function getClaudeSkillsDir(): string {
  return join(getHomeDir(), '.claude', 'skills')
}

/**
 * Get the Claude MCP config path.
 */
export function getClaudeMcpConfigPath(): string {
  return join(getHomeDir(), '.claude', 'mcp.json')
}

/**
 * Ensure a directory exists.
 */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Initialize all required directories.
 */
export function initializeDirectories(): void {
  ensureDir(getConfigDir())
  ensureDir(getLogsDir())
}

// =============================================================================
// Process Management
// =============================================================================

/**
 * Kill a process by PID.
 * Cross-platform process termination.
 */
export async function killProcess(pid: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): Promise<boolean> {
  try {
    if (IS_WINDOWS) {
      // Windows: use taskkill
      const proc = Bun.spawn(['taskkill', '/PID', String(pid), '/F'], {
        stdout: 'ignore',
        stderr: 'ignore',
      })
      await proc.exited
      return proc.exitCode === 0
    } else {
      // Unix: use kill
      const signalNum = signal === 'SIGKILL' ? '-9' : '-15'
      const proc = Bun.spawn(['kill', signalNum, String(pid)], {
        stdout: 'ignore',
        stderr: 'ignore',
      })
      await proc.exited
      return proc.exitCode === 0
    }
  } catch {
    return false
  }
}

/**
 * Kill processes matching a pattern.
 * Cross-platform pattern-based process killing.
 */
export async function killProcessByPattern(pattern: string): Promise<boolean> {
  try {
    if (IS_WINDOWS) {
      // Windows: use wmic or taskkill with filter
      // This is a simplified version - real implementation might need powershell
      const proc = Bun.spawn(['taskkill', '/F', '/FI', `IMAGENAME eq *${pattern}*`], {
        stdout: 'ignore',
        stderr: 'ignore',
      })
      await proc.exited
      return true
    } else {
      // Unix: use pkill
      const proc = Bun.spawn(['pkill', '-f', pattern], {
        stdout: 'ignore',
        stderr: 'ignore',
      })
      await proc.exited
      // pkill returns 1 if no processes matched, which is fine
      return true
    }
  } catch {
    return false
  }
}

/**
 * Find processes by pattern and return PIDs.
 */
export async function findProcesses(pattern: string): Promise<number[]> {
  try {
    if (IS_WINDOWS) {
      // Windows: use wmic
      const proc = Bun.spawn(
        ['wmic', 'process', 'where', `CommandLine like '%${pattern}%'`, 'get', 'ProcessId'],
        { stdout: 'pipe', stderr: 'ignore' }
      )
      const output = await new Response(proc.stdout).text()
      await proc.exited

      const pids = output
        .split('\n')
        .map((line) => parseInt(line.trim()))
        .filter((pid) => !isNaN(pid))

      return pids
    } else {
      // Unix: use pgrep
      const proc = Bun.spawn(['pgrep', '-f', pattern], {
        stdout: 'pipe',
        stderr: 'ignore',
      })
      const output = await new Response(proc.stdout).text()
      await proc.exited

      const pids = output
        .trim()
        .split('\n')
        .map((line) => parseInt(line))
        .filter((pid) => !isNaN(pid))

      return pids
    }
  } catch {
    return []
  }
}

/**
 * Check if a port is in use.
 */
export async function isPortInUse(port: number): Promise<boolean> {
  try {
    if (IS_WINDOWS) {
      const proc = Bun.spawn(['netstat', '-ano'], {
        stdout: 'pipe',
        stderr: 'ignore',
      })
      const output = await new Response(proc.stdout).text()
      await proc.exited
      return output.includes(`:${port}`)
    } else {
      // Unix: use lsof or ss
      const proc = Bun.spawn(['lsof', '-i', `:${port}`], {
        stdout: 'pipe',
        stderr: 'ignore',
      })
      const output = await new Response(proc.stdout).text()
      await proc.exited
      return output.trim().length > 0
    }
  } catch {
    // Fallback: try TCP connection
    return new Promise((resolve) => {
      const net = require('net')
      const socket = new net.Socket()

      socket.setTimeout(1000)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.once('error', () => {
        socket.destroy()
        resolve(false)
      })

      socket.connect(port, '127.0.0.1')
    })
  }
}

// =============================================================================
// Shell Commands
// =============================================================================

/**
 * Get the appropriate shell for the platform.
 */
export function getShell(): string {
  if (IS_WINDOWS) {
    return process.env['COMSPEC'] || 'cmd.exe'
  }
  return process.env['SHELL'] || '/bin/sh'
}

/**
 * Get shell execution args.
 */
export function getShellArgs(command: string): string[] {
  if (IS_WINDOWS) {
    return ['/c', command]
  }
  return ['-c', command]
}

/**
 * Run a shell command.
 */
export async function runShellCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const shell = getShell()
  const args = getShellArgs(command)

  const proc = Bun.spawn([shell, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  const exitCode = await proc.exited

  return { stdout, stderr, exitCode }
}

// =============================================================================
// Service Management
// =============================================================================

export type ServiceManager = 'systemd' | 'launchd' | 'none'

/**
 * Get the service manager for the current platform.
 */
export function getServiceManager(): ServiceManager {
  if (IS_LINUX || IS_NIXOS) {
    // Check for systemd
    if (existsSync('/run/systemd/system') || existsSync('/sys/fs/cgroup/systemd')) {
      return 'systemd'
    }
  }

  if (IS_MACOS) {
    return 'launchd'
  }

  return 'none'
}

/**
 * Get systemd user service directory.
 */
export function getSystemdUserDir(): string {
  return process.env['XDG_CONFIG_HOME']
    ? join(process.env['XDG_CONFIG_HOME'], 'systemd', 'user')
    : join(getHomeDir(), '.config', 'systemd', 'user')
}

/**
 * Get launchd user agents directory (macOS).
 */
export function getLaunchdUserDir(): string {
  return join(getHomeDir(), 'Library', 'LaunchAgents')
}

// =============================================================================
// Platform Info
// =============================================================================

export interface PlatformInfo {
  platform: Platform
  isWindows: boolean
  isMacOS: boolean
  isLinux: boolean
  isNixOS: boolean
  serviceManager: ServiceManager
  configDir: string
  databasePath: string
  shell: string
}

/**
 * Get comprehensive platform information.
 */
export function getPlatformInfo(): PlatformInfo {
  return {
    platform: PLATFORM,
    isWindows: IS_WINDOWS,
    isMacOS: IS_MACOS,
    isLinux: IS_LINUX,
    isNixOS: IS_NIXOS,
    serviceManager: getServiceManager(),
    configDir: getConfigDir(),
    databasePath: getDatabasePath(),
    shell: getShell(),
  }
}

// Initialize directories on module load
initializeDirectories()
