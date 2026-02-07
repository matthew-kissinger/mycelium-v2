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

  for (const repo of repos) {
    try {
      // Skip repos that already have GitHub info cached
      if (repo.github_owner && repo.github_repo && repo.github_default_branch) {
        skipped++
        continue
      }

      // Detect GitHub remote
      const slug = await getRepoSlug(repo.path)
      if (!slug) {
        // Not a GitHub repo, skip silently
        continue
      }

      // Get default branch if not cached
      let defaultBranch: string | undefined = repo.github_default_branch ?? undefined
      if (!defaultBranch) {
        defaultBranch = (await getGitHubDefaultBranch(slug)) ?? undefined
      }

      // Only update if something is new
      if (repo.github_owner !== slug.owner || repo.github_repo !== slug.repo || !repo.github_default_branch) {
        await updateRepo(repo.id, {
          github_owner: slug.owner,
          github_repo: slug.repo,
          github_default_branch: defaultBranch,
        })

        updated++
        console.log(
          `[GitHub Sync] ${repo.name}: cached ${formatSlug(slug)} (default: ${defaultBranch ?? 'unknown'})`
        )
      }

      // Check visibility and enable security features for public repos
      if ((repo as any).is_public === null || (repo as any).is_public === undefined) {
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
