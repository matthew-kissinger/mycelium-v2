/**
 * Responsive Layout Tests
 *
 * Tests the three-column responsive layout behavior across viewports:
 * - Mobile (375x667): hamburger menu, sidebar as overlay, panel as full-screen modal
 * - Tablet (768x1024): sidebar visible (collapsed by default), panel as modal
 * - Desktop (1280x800): three-column layout (sidebar | canvas | panel)
 *
 * Note: sidebarCollapsed defaults to true for better mobile UX:
 * - Mobile: sidebar hidden by default, open via hamburger
 * - Desktop: sidebar starts in narrow (48px) mode, can expand
 */

import { test, expect, type Page } from '@playwright/test'

// Mock all API endpoints to avoid backend dependency
async function mockAPIs(page: Page) {
  await page.route('/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })

  await page.route('/api/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_tasks: 10,
        running: 2,
        pending: 3,
        done: 4,
        failed: 1,
        unsequenced: 2,
        ready: 1,
      }),
    })
  })

  await page.route('/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: '',
    })
  })

  await page.route('/api/scheduler/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ running: false, cycles: [] }),
    })
  })

  await page.route('/api/repos', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  await page.route('/api/signals/pending', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  await page.route('/api/memory/all', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ global: { patterns: [], warnings: [] }, repos: {} }),
    })
  })

  await page.route('/api/inventory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ skills_count: 5, mcps_count: 3, skills: [], mcps: [] }),
    })
  })

  await page.route('/api/shepherd/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total_unevaluated: 0, batch_size: 5, repos: {} }),
    })
  })

  await page.route('/api/tasks**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
}

test.describe('Mobile viewport (375x667)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await mockAPIs(page)
  })

  test('hamburger menu is visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()

    // Hamburger button should be visible on mobile (has md:hidden class)
    const hamburger = page.locator('header button.md\\:hidden')
    await expect(hamburger).toBeVisible()
  })

  test('desktop sidebar container is not visible', async ({ page }) => {
    await page.goto('/')

    // The desktop sidebar container (hidden md:block) should not be visible on mobile
    const desktopSidebar = page.locator('div.hidden.md\\:block')
    await expect(desktopSidebar).not.toBeVisible()
  })

  test('mobile sidebar overlay is hidden by default', async ({ page }) => {
    await page.goto('/')

    // With sidebarCollapsed: true default, mobile sidebar overlay is NOT visible
    const mobileSidebarOverlay = page.locator('div.md\\:hidden.fixed.inset-0.z-40')
    await expect(mobileSidebarOverlay).not.toBeVisible()
  })

  test('hamburger opens sidebar overlay', async ({ page }) => {
    await page.goto('/')

    // Sidebar should be hidden by default
    const mobileSidebarOverlay = page.locator('div.md\\:hidden.fixed.inset-0.z-40')
    await expect(mobileSidebarOverlay).not.toBeVisible()

    // Click hamburger to open
    const hamburger = page.locator('header button.md\\:hidden')
    await hamburger.click()

    // Sidebar should now be visible
    await expect(mobileSidebarOverlay).toBeVisible()
  })

  test('clicking backdrop closes sidebar overlay', async ({ page }) => {
    await page.goto('/')

    // Open sidebar via hamburger
    const hamburger = page.locator('header button.md\\:hidden')
    await hamburger.click()

    const mobileSidebarOverlay = page.locator('div.md\\:hidden.fixed.inset-0.z-40')
    await expect(mobileSidebarOverlay).toBeVisible()

    // Click on the right side of the screen where backdrop is visible (sidebar is 256px wide)
    await page.mouse.click(320, 300)

    // Sidebar should be hidden
    await expect(mobileSidebarOverlay).not.toBeVisible()
  })

  test('opening panel shows as full-screen modal', async ({ page }) => {
    await page.goto('/')

    // Open sidebar via hamburger first
    const hamburger = page.locator('header button.md\\:hidden')
    await hamburger.click()

    // Click Ready in the sidebar
    const readyButton = page.locator('div.md\\:hidden.fixed.inset-0.z-40 button:has-text("Ready")').first()
    await readyButton.click()

    // Panel should appear as full-screen modal (lg:hidden fixed inset-0 z-50)
    const mobilePanel = page.locator('div.lg\\:hidden.fixed.inset-0.z-50.bg-zinc-900')
    await expect(mobilePanel).toBeVisible()
  })
})

test.describe('Tablet viewport (768x1024)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await mockAPIs(page)
  })

  test('hamburger menu is hidden', async ({ page }) => {
    await page.goto('/')

    // Hamburger button (md:hidden) should not be visible on tablet (>=768px)
    const hamburger = page.locator('header button.md\\:hidden')
    await expect(hamburger).not.toBeVisible()
  })

  test('sidebar is visible', async ({ page }) => {
    await page.goto('/')

    // Desktop sidebar (hidden md:block) should be visible
    const desktopSidebar = page.locator('div.hidden.md\\:block')
    await expect(desktopSidebar).toBeVisible()
  })

  test('sidebar starts collapsed and can be expanded', async ({ page }) => {
    await page.goto('/')

    // Find the sidebar aside element
    const sidebar = page.locator('div.hidden.md\\:block aside')
    await expect(sidebar).toBeVisible()

    // Initial width should be 48px (w-12, collapsed by default)
    const initialBox = await sidebar.boundingBox()
    expect(initialBox?.width).toBe(48)

    // Click the expand button (chevron in sidebar header)
    const expandButton = sidebar.locator('button').first()
    await expandButton.click()

    // Sidebar should now be expanded (w-60 = 240px)
    await page.waitForTimeout(300) // Wait for transition
    const expandedBox = await sidebar.boundingBox()
    expect(expandedBox?.width).toBe(240)
  })

  test('opening panel shows as modal on tablet', async ({ page }) => {
    await page.goto('/')

    // Expand sidebar first to see the buttons
    const sidebar = page.locator('div.hidden.md\\:block aside')
    const expandButton = sidebar.locator('button').first()
    await expandButton.click()
    await page.waitForTimeout(300)

    // Click on a task filter to open taskPool panel
    const readyButton = page.locator('button:has-text("Ready")').first()
    await readyButton.click()

    // Panel should appear as modal (lg:hidden fixed inset-0 z-50)
    // since tablet is < lg breakpoint (1024px)
    const tabletPanel = page.locator('div.lg\\:hidden.fixed.inset-0.z-50.bg-zinc-900')
    await expect(tabletPanel).toBeVisible()
  })
})

test.describe('Desktop viewport (1280x800)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockAPIs(page)
  })

  test('hamburger menu is hidden', async ({ page }) => {
    await page.goto('/')

    // Hamburger button (md:hidden) should not be visible
    const hamburger = page.locator('header button.md\\:hidden')
    await expect(hamburger).not.toBeVisible()
  })

  test('sidebar is visible', async ({ page }) => {
    await page.goto('/')

    // Desktop sidebar should be visible
    const desktopSidebar = page.locator('div.hidden.md\\:block')
    await expect(desktopSidebar).toBeVisible()
  })

  test('sidebar starts collapsed, can be expanded', async ({ page }) => {
    await page.goto('/')

    const sidebar = page.locator('div.hidden.md\\:block aside')
    await expect(sidebar).toBeVisible()

    // Should start collapsed (48px)
    const initialBox = await sidebar.boundingBox()
    expect(initialBox?.width).toBe(48)

    // Click to expand
    const expandButton = sidebar.locator('button').first()
    await expandButton.click()
    await page.waitForTimeout(300)

    // Should be expanded (240px)
    const expandedBox = await sidebar.boundingBox()
    expect(expandedBox?.width).toBe(240)
  })

  test('three-column layout is displayed with panel', async ({ page }) => {
    await page.goto('/')

    // Expand sidebar first
    const sidebar = page.locator('div.hidden.md\\:block aside')
    const expandButton = sidebar.locator('button').first()
    await expandButton.click()
    await page.waitForTimeout(300)

    // Main canvas area should be visible
    const main = page.locator('main.flex-1')
    await expect(main).toBeVisible()

    // Open a panel to verify three-column layout
    const readyButton = page.locator('button:has-text("Ready")').first()
    await readyButton.click()

    // Desktop panel should appear (hidden lg:block)
    const desktopPanel = page.locator('div.hidden.lg\\:block')
    await expect(desktopPanel).toBeVisible()
  })

  test('panel appears as side panel, not modal', async ({ page }) => {
    await page.goto('/')

    // Expand sidebar
    const sidebar = page.locator('div.hidden.md\\:block aside')
    const expandButton = sidebar.locator('button').first()
    await expandButton.click()
    await page.waitForTimeout(300)

    // Click on a task filter to open panel
    const readyButton = page.locator('button:has-text("Ready")').first()
    await readyButton.click()

    // Desktop panel (hidden lg:block) should be visible
    const desktopPanel = page.locator('div.hidden.lg\\:block')
    await expect(desktopPanel).toBeVisible()

    // Mobile/tablet modal (lg:hidden fixed z-50) should NOT be visible
    const mobilePanel = page.locator('div.lg\\:hidden.fixed.inset-0.z-50')
    await expect(mobilePanel).not.toBeVisible()
  })

  test('quick access buttons are visible in header', async ({ page }) => {
    await page.goto('/')

    // Quick access buttons (hidden lg:flex) should be visible
    const reposButton = page.locator('header button:has-text("Repos")')
    await expect(reposButton).toBeVisible()

    const skillsButton = page.locator('header button:has-text("Skills/MCPs")')
    await expect(skillsButton).toBeVisible()
  })

  test('stats show full details', async ({ page }) => {
    await page.goto('/')

    // All stats should be visible on desktop
    await expect(page.locator('text=Total:')).toBeVisible()
    await expect(page.locator('text=Running:')).toBeVisible()
    await expect(page.locator('text=Pending:')).toBeVisible()
    await expect(page.locator('text=Done:')).toBeVisible()
    await expect(page.locator('text=Failed:')).toBeVisible()
  })
})

test.describe('Panel interactions', () => {
  test('taskPool panel can be opened from sidebar on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockAPIs(page)
    await page.goto('/')

    // Expand sidebar first
    const sidebar = page.locator('div.hidden.md\\:block aside')
    const expandButton = sidebar.locator('button').first()
    await expandButton.click()
    await page.waitForTimeout(300)

    // Click "Ready" in sidebar
    const readyButton = page.locator('button:has-text("Ready")').first()
    await readyButton.click()

    // Panel should be visible (as side panel on desktop)
    const desktopPanel = page.locator('div.hidden.lg\\:block')
    await expect(desktopPanel).toBeVisible()
  })

  test('scheduler panel can be opened', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockAPIs(page)
    await page.goto('/')

    // Expand sidebar first
    const sidebar = page.locator('div.hidden.md\\:block aside')
    const expandButton = sidebar.locator('button').first()
    await expandButton.click()
    await page.waitForTimeout(300)

    // Click "Scheduler" in sidebar
    const schedulerButton = page.locator('button:has-text("Scheduler")').first()
    await schedulerButton.click()

    // Panel should be visible
    const desktopPanel = page.locator('div.hidden.lg\\:block')
    await expect(desktopPanel).toBeVisible()
  })
})

test.describe('Responsive transitions', () => {
  test('layout adapts when resizing from mobile to desktop', async ({ page }) => {
    await mockAPIs(page)

    // Start at mobile size
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // Hamburger should be visible on mobile
    const hamburger = page.locator('header button.md\\:hidden')
    await expect(hamburger).toBeVisible()

    // Desktop sidebar container should not be visible on mobile
    const desktopSidebar = page.locator('div.hidden.md\\:block')
    await expect(desktopSidebar).not.toBeVisible()

    // Mobile sidebar should be hidden by default (sidebarCollapsed: true)
    const mobileSidebarOverlay = page.locator('div.md\\:hidden.fixed.inset-0.z-40')
    await expect(mobileSidebarOverlay).not.toBeVisible()

    // Resize to tablet
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.waitForTimeout(100)

    // Hamburger should now be hidden
    await expect(hamburger).not.toBeVisible()

    // Desktop sidebar should now be visible
    await expect(desktopSidebar).toBeVisible()

    // Resize to desktop
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(100)

    // Quick access buttons should be visible
    const reposButton = page.locator('header button:has-text("Repos")')
    await expect(reposButton).toBeVisible()
  })
})
