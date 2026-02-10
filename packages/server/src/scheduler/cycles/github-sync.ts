/**
 * GitHub Sync Cycle
 *
 * Periodically syncs GitHub state with local database:
 * 1. Detects and caches repo slugs (owner/repo) for repos with GitHub remotes
 * 2. Fetches default branch names and stores them in the repos table
 * 3. Checks open mycelium PRs for merge/close status changes
 *
 * Interval: 30 minutes (configurable via github_sync_interval_sec)
 * This cycle is lightweight - it only makes a few API calls per repo.
 */

import { SchedulerConfig } from '@mycelium/shared'
import { getRepos, updateRepo } from '../../db/queries'
import { getRepoSlug, getGitHubDefaultBranch, formatSlug, runGh } from '../../github'
import { enableSecurityFeatures } from '../../github/security'
import { broadcast } from '../../sse'

/**
 * Run the GitHub sync cycle.
 * Detects GitHub remotes and caches repo metadata.
 */
export async function runGitHubSyncCycle(config: SchedulerConfig): Promise<void> {
  const repos = await getRepos()

  if (repos.length === 0) {
    console.log('[GitHub Sync] No repos to sync')
    return
  }

  let updated = 0
  let skipped = 0

  const RESYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

  for (const repo of repos) {
    try {
      const hasCachedInfo = repo.github_owner && repo.github_repo && repo.github_default_branch

      // Skip repos that have cached info and were synced recently
      if (hasCachedInfo) {
        const lastSynced = repo.last_scanned_at ? new Date(repo.last_scanned_at).getTime() : 0
        const age = Date.now() - lastSynced
        if (age < RESYNC_INTERVAL_MS) {
          skipped++
          continue
        }
        // Stale cache - re-check below
      }

      // Detect GitHub remote
      const slug = await getRepoSlug(repo.path)
      if (!slug) {
        // Not a GitHub repo, skip silently
        continue
      }

      // Always fetch default branch (cheap single API call)
      const defaultBranch = (await getGitHubDefaultBranch(slug)) ?? repo.github_default_branch ?? undefined

      // Update if anything changed or this is a fresh sync
      if (
        repo.github_owner !== slug.owner ||
        repo.github_repo !== slug.repo ||
        repo.github_default_branch !== defaultBranch ||
        !hasCachedInfo
      ) {
        await updateRepo(repo.id, {
          github_owner: slug.owner,
          github_repo: slug.repo,
          github_default_branch: defaultBranch,
          last_scanned_at: new Date().toISOString(),
        })

        updated++
        console.log(
          `[GitHub Sync] ${repo.name}: cached ${formatSlug(slug)} (default: ${defaultBranch ?? 'unknown'})`
        )
      } else {
        // No changes, just update last_scanned_at
        await updateRepo(repo.id, {
          last_scanned_at: new Date().toISOString(),
        })
        skipped++
      }

      // Check visibility and enable security features for public repos
      if (repo.is_public === null || repo.is_public === undefined) {
        const visResult = await runGh([
          'api', `repos/${formatSlug(slug)}`, '--jq', '.visibility',
        ])

        if (visResult.success) {
          const isPublic = visResult.stdout.trim() === 'public' ? 1 : 0
          await updateRepo(repo.id, { is_public: isPublic })

          if (isPublic) {
            console.log(`[GitHub Sync] ${repo.name}: public repo, enabling security features`)
            try {
              await enableSecurityFeatures(slug.owner, slug.repo)
            } catch (secError) {
              console.error(`[GitHub Sync] ${repo.name}: failed to enable security:`, secError)
            }
          }
        }
      }
    } catch (error) {
      console.error(`[GitHub Sync] Error syncing ${repo.name}:`, error)
    }
  }

  console.log(`[GitHub Sync] Done: ${updated} updated, ${skipped} already cached, ${repos.length} total`)
}
