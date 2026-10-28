import { test, expect } from '@playwright/test';

/**
 * Stabileo Research: the gallery, and the phase-field page running its real simulation (the
 * research WASM, in a worker) for a few load steps on the coarse mesh.
 *
 * Run locally:
 *   npx playwright test --grep "@smoke research"
 */
test.describe('@smoke research', () => {
  test('the gallery shows the runnable experiment first, then the list, and links to the experiment', async ({ page }) => {
    await page.goto('/en/research/');
    await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
    expect(await page.locator('.rs-g-card').count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByText('Research, not a design tool').first()).toBeVisible();
    // Every runnable experiment shows its build-time thumbnail, never the field icon.
    const cards = page.locator('.rs-g-runcard');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    for (const card of await cards.all()) {
      await expect(card.locator('.rs-g-thumb-icon')).toHaveCount(0);
      const img = card.locator('img');
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    }
    await page.getByRole('link', { name: 'Read & run' }).first().click();
    await expect(page).toHaveURL(/\/en\/research\/fracture\/shauer-2025\/$/);
    await expect(page.getByRole('heading', { name: 'Phase-field fracture of a notched plate' })).toBeVisible();
  });

  test('the phase-field experiment replays, then runs load steps live and plots the force', async ({ page }) => {
    const wasm: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('phasefield_bg.wasm')) wasm.push(r.url());
    });
    await page.goto('/en/research/fracture/shauer-2025/');
    await expect(page.getByText('Research, not a design tool').first()).toBeVisible();
    const app = page.locator('.rs-app');
    await expect(app).toHaveAttribute('data-source', 'replay');
    await expect.poll(async () => Number(await app.getAttribute('data-steps')), { timeout: 30_000 }).toBeGreaterThanOrEqual(70);
    await expect(page.locator('.sfv canvas').first()).toBeVisible();
    expect(wasm, 'the solver WASM loads only when a live run starts').toHaveLength(0);

    await page.locator('#rs-tab-parameters').click();
    await page.locator('#p-mesh').selectOption('coarse');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(app).toHaveAttribute('data-source', 'live');
    await expect.poll(async () => Number(await app.getAttribute('data-steps')), { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
    await page.locator('#rs-tab-force').click();
    const curve = page.locator('#rs-panel-force svg path[stroke-width="1.75"]').first();
    await expect(curve).toBeVisible();
    expect(((await curve.getAttribute('d')) ?? '').split('L').length).toBeGreaterThanOrEqual(5);
    expect(wasm.length).toBeGreaterThan(0);
  });

  test('the application and the landing do not load research code', async ({ page }) => {
    const research: string[] = [];
    page.on('request', (r) => {
      if (/research-wasm|ResearchPage|sim\.worker|ScalarFieldViewer/.test(r.url())) research.push(r.url());
    });
    await page.goto('/en/');
    await page.waitForLoadState('networkidle');
    expect(research).toEqual([]);
  });

  for (const width of [390, 1120, 1280]) {
    test(`the experiment page reflows at ${width} px: nothing is cut off`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/en/research/fracture/shauer-2025/');
      await expect(page.locator('.rs-app')).toHaveAttribute('data-source', 'replay');
      await page.waitForTimeout(1000);
      const m = await page.evaluate(() => {
        const landing = document.querySelector('.landing') as HTMLElement;
        const pane = document.querySelector('.rs-shell-app') as HTMLElement;
        const article = document.querySelector('.rs-shell-article') as HTMLElement;
        return { lw: landing.scrollWidth, lc: landing.clientWidth, pw: pane.scrollWidth, pc: pane.clientWidth, ar: article.getBoundingClientRect().right, iw: innerWidth };
      });
      expect(m.lw).toBeLessThanOrEqual(m.lc + 1);
      expect(m.pw).toBeLessThanOrEqual(m.pc + 1);
      expect(m.ar).toBeLessThanOrEqual(m.iw + 1);
    });
  }

  test('the research page uses Plex Sans for Latin text and its Greek and maths subset', async ({ page }) => {
    await page.goto('/en/research/fracture/shauer-2025/');
    await page.waitForLoadState('networkidle');
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.family.includes('IBM Plex Sans') && f.status === 'loaded').map((f) => f.unicodeRange);
    });
    expect(loaded.some((r) => r.includes('U+20-7E'))).toBe(true);
    expect(loaded.some((r) => r.includes('U+370-3FF'))).toBe(true);
  });
});
