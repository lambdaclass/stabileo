import { readFileSync } from 'node:fs';
import { test, expect, loadModel, designAll, solveModel, sizeAll } from './fixtures';

const BUILDING = JSON.parse(readFileSync('src/lib/templates/fixtures/3d-building.json', 'utf8'));

test.describe('@smoke the 3d-building example in PRO design (#766)', () => {
  test('CIRSOC 201 reaches an outcome for each of the 105 members as shipped, with no concrete refused', async ({ pro: page }) => {
    await loadModel(page, '3d-building');
    const counts = await designAll(page);
    expect(counts.total).toBe(105);
    expect({ aborted: counts.aborted, notReached: counts.notReached, demandUnavailable: counts.demandUnavailable })
      .toEqual({ aborted: 0, notReached: 0, demandUnavailable: 0 });
    expect(counts.verified + counts.provisionalBiaxial + counts.sectionInadequate + counts.searchExhausted + counts.unsupported).toBe(105);
    expect(counts.verified).toBeGreaterThan(0);
    await expect(page.getByTestId('desk-error')).toBeHidden();
  });

  test('a concrete with no f′c is named in the design run, not called steel', async ({ pro: page }) => {
    const model = {
      ...BUILDING,
      materials: BUILDING.materials.map((m: { name: string; fy?: number }) => {
        if (m.name !== 'H-30') return m;
        const { fy: _fy, ...rest } = m;
        return rest;
      }),
    };
    await page.evaluate((j) => window.__stabileoActions.loadModelData(j), model);
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(105);
    await solveModel(page);
    await sizeAll(page);
    const error = page.getByTestId('desk-error');
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toContainText('H-30');
    await expect(error).toContainText('f′c');
    await expect(error).not.toContainText('steel');
  });
});
