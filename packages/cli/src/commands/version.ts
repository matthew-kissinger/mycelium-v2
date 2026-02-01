/**
 * Version CLI commands.
 *
 * Implements:
 * - mycel version             - Show mycelium version
 * - mycel version --deps      - Include dependency versions
 * - mycel version --outdated  - Show outdated packages
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { json, info, warn, table } from '../output.ts'

/**
 * Version info from API
 */
interface VersionInfo {
  mycelium: string
  backend: string
  node: string
  bun?: string
  dependencies?: Record<string, string>
}

/**
 * Package info for outdated check
 */
interface PackageInfo {
  name: string
  current: string
  latest: string
  outdated: boolean
}

/**
 * Register version command on the program.
 */
export function registerVersionCommand(program: Command): void {
  program
    .command('version')
    .description('Show version information')
    .option('--deps', 'Include dependency versions')
    .option('--outdated', 'Show outdated packages')
    .option('--json', 'Output as JSON')
    .action(async (options: { deps?: boolean; outdated?: boolean; json?: boolean }) => {
      try {
        const client = getClient()

        // Get version info from API
        let versionInfo: VersionInfo
        try {
          versionInfo = await client.get<VersionInfo>('/api/version')
        } catch {
          // API might not have version endpoint - use local info
          versionInfo = {
            mycelium: '0.1.0',
            backend: 'unknown',
            node: process.version,
          }

          // Check if running in Bun
          const bunProcess = process as unknown as { isBun?: boolean; versions?: { bun?: string } }
          if (bunProcess.isBun) {
            versionInfo.bun = bunProcess.versions?.bun ?? 'unknown'
          }
        }

        if (options.outdated) {
          // Check for outdated packages
          let outdatedPackages: PackageInfo[] = []
          try {
            outdatedPackages = await client.get<PackageInfo[]>('/api/version/outdated')
          } catch {
            // Endpoint might not exist
            warn('Outdated check not available from API')

            // Show local package info instead
            console.log('')
            console.log('Mycelium Version Info')
            console.log('=====================')
            console.log(`CLI Version:     ${versionInfo.mycelium}`)
            console.log(`Backend:         ${versionInfo.backend}`)
            console.log(`Node:            ${versionInfo.node}`)
            if (versionInfo.bun) {
              console.log(`Bun:             ${versionInfo.bun}`)
            }
            console.log('')
            info('To check for outdated packages, ensure backend is running')
            return
          }

          if (options.json) {
            json({ version: versionInfo, outdated: outdatedPackages })
            return
          }

          console.log('')
          console.log('Mycelium Version Info')
          console.log('=====================')
          console.log(`CLI Version:     ${versionInfo.mycelium}`)
          console.log(`Backend:         ${versionInfo.backend}`)
          console.log('')

          const outdatedOnly = outdatedPackages.filter(p => p.outdated)
          if (outdatedOnly.length === 0) {
            info('All packages are up to date')
          } else {
            warn(`${outdatedOnly.length} package(s) have updates available:`)
            console.log('')
            table(outdatedOnly.map(p => ({
              package: p.name,
              current: p.current,
              latest: p.latest,
            })))
          }
          console.log('')
          return
        }

        if (options.deps) {
          // Include dependency versions
          let deps: Record<string, string> = {}
          try {
            const depsResponse = await client.get<{ dependencies: Record<string, string> }>('/api/version/deps')
            deps = depsResponse.dependencies
          } catch {
            // Try to get from local package.json
            deps = {
              'commander': '^12.0.0',
              'typescript': '^5.0.0',
            }
          }

          if (options.json) {
            json({ ...versionInfo, dependencies: deps })
            return
          }

          console.log('')
          console.log('Mycelium Version Info')
          console.log('=====================')
          console.log(`CLI Version:     ${versionInfo.mycelium}`)
          console.log(`Backend:         ${versionInfo.backend}`)
          console.log(`Node:            ${versionInfo.node}`)
          if (versionInfo.bun) {
            console.log(`Bun:             ${versionInfo.bun}`)
          }
          console.log('')
          console.log('Dependencies:')
          console.log('-------------')
          for (const [name, version] of Object.entries(deps)) {
            console.log(`  ${name}: ${version}`)
          }
          console.log('')
          return
        }

        // Default: just show version
        if (options.json) {
          json(versionInfo)
          return
        }

        console.log('')
        console.log('Mycelium Version Info')
        console.log('=====================')
        console.log(`CLI Version:     ${versionInfo.mycelium}`)
        console.log(`Backend:         ${versionInfo.backend}`)
        console.log(`Node:            ${versionInfo.node}`)
        if (versionInfo.bun) {
          console.log(`Bun:             ${versionInfo.bun}`)
        }
        console.log('')
      } catch (err) {
        if (err instanceof ApiError) {
          console.log('')
          console.log('Mycelium CLI')
          console.log('============')
          console.log('Version: 0.1.0')
          console.log('')
          warn('Could not connect to backend for full version info')
          console.log('')
        } else {
          throw err
        }
      }
    })
}
