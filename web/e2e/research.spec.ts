import { test, expect } from '@playwright/test';

/**
 * Stabileo Research: the gallery, and the phase-field page running its real simulation (the
 * research WASM, in a worker) for a few load steps on the coarse mesh.
 *
 * Run locally:
 *   npx playwright test --grep "@smoke research"
 */
test.describe('@smoke research', () => {
  test('the gallery lists the catalogue and links to the experiment', async ({ page }) => {
    await page.goto('/en/research/');
    await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
    expect(await page.locator('.rs-g-card').count()).toBeGreaterThanOrEqual(10);
    await expect(page.getByText('Research, not design')).toBeVisible();
    await page.getByRole('link', { name: 'Open the experiment' }).click();
    await expect(page).toHaveURL(/\/en\/research\/fracture\/shauer-2025\/$/);
    await expect(page.getByRole('heading', { name: 'Phase-field fracture of a notched plate' })).toBeVisible();
  });

  test('the phase-field experiment runs load steps and plots the force', async ({ page }) => {
    const wasm: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/research-wasm/')) wasm.push(r.url());
    });
    await page.goto('/en/research/fracture/shauer-2025/');
    await expect(page.getByText('Research, not a design tool')).toBeVisible();
    expect(wasm, 'the research WASM loads only when a run starts').toHaveLength(0);

    await page.getByLabel('Mesh').selectOption('coarse');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('.rs-out').getAttribute('data-steps')), { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
    await expect(page.locator('.field canvas')).toBeVisible();
    const points = page.locator('.rs-charts figure').first().locator('circle');
    expect(await points.count()).toBeGreaterThanOrEqual(5);
    expect(wasm.some((u) => u.endsWith('phasefield_bg.wasm'))).toBe(true);
  });

  test('the application and the landing do not load research code', async ({ page }) => {
    const research: string[] = [];
    page.on('request', (r) => {
      if (/research-wasm|ResearchPage|sim\.worker/.test(r.url())) research.push(r.url());
    });
    await page.goto('/en/');
    await page.waitForLoadState('networkidle');
    expect(research).toEqual([]);
  });
});
