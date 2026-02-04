#!/usr/bin/env bun
/**
 * Mycelium CLI entry point.
 *
 * This is the main entry point for the mycel command-line interface.
 * It sets up the Commander.js program and registers command modules.
 */

import { Command } from 'commander'
import { createClient, setGlobalClient } from './client.ts'
import { registerTaskCommands } from './commands/tasks.ts'
import { registerSignalCommands } from './commands/signals.ts'
import { registerMemoryCommands } from './commands/memory.ts'
import { registerRepoCommands } from './commands/repos.ts'
import { registerRunnerCommands } from './commands/runner.ts'
import { registerSequenceCommands } from './commands/sequence.ts'
import { registerGenesisCommands } from './commands/genesis.ts'
import { registerSessionCommands } from './commands/sessions.ts'
import { registerVersionCommand } from './commands/version.ts'
import { registerDeviceCommands } from './commands/devices.ts'

const VERSION = '0.1.0'
const DEFAULT_API_URL = 'http://localhost:8765'

const program = new Command()

program
  .name('mycel')
  .description('Mycelium agent orchestration CLI')
  .version(VERSION, '-v, --version', 'Display version number')
  .option(
    '--api-url <url>',
    'Backend API URL',
    process.env['MYCEL_API_URL'] ?? DEFAULT_API_URL
  )
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts()
    const apiUrl = opts['apiUrl'] as string
    const client = createClient(apiUrl)
    setGlobalClient(client)
  })

// Register command modules
registerTaskCommands(program)     // stats, tasks, task <subcommand>
registerSignalCommands(program)   // align, signals, check, notify, inbox, status, reply, show, download
registerMemoryCommands(program)   // memory, memory add, compact
registerRepoCommands(program)     // repos, repos add/remove/health/discover/describe/paths
registerRunnerCommands(program)   // runner, runner start/stop/config, config show/set
registerSequenceCommands(program) // sequence [repo_path] [--dry-run]
registerGenesisCommands(program)  // genesis, genesis create/auto/config
registerSessionCommands(program)  // sessions, session <id>, trace <task_id>
registerVersionCommand(program)   // version [--deps] [--outdated]
registerDeviceCommands(program)   // devices, device add/remove/status/ping/cmd, tv, vol

// Parse and execute
program.parse()
