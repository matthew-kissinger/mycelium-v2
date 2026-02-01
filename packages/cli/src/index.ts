#!/usr/bin/env bun
/**
 * Mycelium CLI entry point.
 *
 * This is the main entry point for the mycel command-line interface.
 * It sets up the Commander.js program and registers command modules.
 */

import { Command } from 'commander'
import { createClient, setGlobalClient } from './client.ts'

const VERSION = '0.1.0'
const DEFAULT_API_URL = 'http://localhost:8000'

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

// Placeholder commands - individual command modules will be added in Phase 3B-F
program
  .command('stats')
  .description('Show task statistics')
  .action(() => {
    console.log('Command not yet implemented (Phase 3B)')
  })

program
  .command('tasks')
  .description('List and manage tasks')
  .action(() => {
    console.log('Command not yet implemented (Phase 3B)')
  })

program
  .command('repos')
  .description('Manage network repositories')
  .action(() => {
    console.log('Command not yet implemented (Phase 3C)')
  })

program
  .command('signals')
  .description('View and respond to alignment signals')
  .action(() => {
    console.log('Command not yet implemented (Phase 3D)')
  })

program
  .command('memory')
  .description('View and manage patterns and warnings')
  .action(() => {
    console.log('Command not yet implemented (Phase 3E)')
  })

program
  .command('notify')
  .description('Send notifications')
  .action(() => {
    console.log('Command not yet implemented (Phase 3F)')
  })

// Parse and execute
program.parse()
