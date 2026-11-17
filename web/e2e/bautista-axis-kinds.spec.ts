import { test, expect, loadModel } from './fixtures';
import { readFileSync } from 'node:fs';

for (const hand of ['right', 'left'] as const) {
  test(`known wrong result: #2259 @smoke modal factors transform with signs and mass percentages permute under reversed ${hand}-handed axes`, async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    const fixture = JSON.parse(readFileSync(new URL('../src/lib/templates/fixtures/3d-portal-frame.json', import.meta.url), 'utf8'));
    fixture.nodes = fixture.nodes.map((node: { x: number; y: number; z: number }) => {
      const x = Math.cos(0.37) * node.x - Math.sin(0.37) * node.y;
      const y = Math.sin(0.37) * node.x + Math.cos(0.37) * node.y;
      return { ...node, x, y: Math.cos(0.53) * y - Math.sin(0.53) * node.z, z: Math.sin(0.53) * y + Math.cos(0.53) * node.z };
    });
    await page.evaluate(model => window.__stabileoActions.loadModelData(model), fixture);
    await page.evaluate(() => window.__stabileoActions.openProTab('advanced'));
    await page.getByTestId('adv-run-modal').click();
    const row = page.getByTestId('adv-modal-row-1');
    await expect(row).toBeVisible();
    const before = await row.locator('td').allTextContents();
    expect(before).toHaveLength(12);
    const factors = before.slice(3, 6).map(Number);
    expect(factors.every(v => Number.isFinite(v) && v !== 0)).toBe(true);
    expect(new Set(factors.map(Math.abs)).size).toBe(3);
    const ratios = before.slice(6, 9);
    expect(ratios.map(parseFloat).every(v => v > 0)).toBe(true);
    expect(new Set(ratios).size).toBe(3);
    const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
    await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
    await page.getByTestId('axes-up--Y').click();
    await page.getByTestId('axes-right--Z').click();
    await page.getByTestId(`axes-hand-${hand}`).click();
    await page.getByTestId('axes-done').click();
    const after = await row.locator('td').allTextContents();
    expect(after).toHaveLength(12);
    expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
    expect(after.slice(3, 6).map(Number)).toEqual([hand === 'right' ? factors[1] : -factors[1]!, -factors[2]!, -factors[0]!]);
    expect([...factors, ...after.slice(3, 6).map(Number)].some(v => v < 0)).toBe(true);
    expect(after.slice(6, 9)).toEqual([ratios[1], ratios[2], ratios[0]]);
    expect(after.slice(9, 12)).toEqual([before[10], before[11], before[9]]);
    expect(after.slice(6, 12).map(parseFloat).every(v => v >= 0)).toBe(true);
  });

  test(`@smoke #2259 shell card converts reversed ${hand}-handed elevation and retains the hydrostatic pressure`, async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
    await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
    await page.getByTestId('axes-up--Y').click();
    await page.getByTestId(`axes-hand-${hand}`).click();
    await page.getByTestId('axes-done').click();
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('write-load').click();
    await page.getByTestId('wl-kind').selectOption('hydro');
    await page.getByTestId('wl-hy-level').fill('-3');
    await page.evaluate(() => window.__stabileoActions.selectShells([`q${window.__stabileo.quadIds()[0]}`]));
    const n0 = await page.evaluate(() => window.__stabileo.allLoads().length);
    await page.getByTestId('wl-add').click();
    await expect(page.getByTestId('wl-done')).toBeVisible();
    const loads = await page.evaluate(n => window.__stabileo.allLoads().slice(n), n0);
    expect(loads.length).toBeGreaterThan(0);
    for (const load of loads) {
      expect(load).toMatchObject({ type: 'surface3d', data: { vary: { dir: [0, 0, 1], c1: 3, q1: 0 } } });
      const vary = load.data.vary as { c1: number; c2: number; q1: number; q2: number };
      expect(vary.q2 / (vary.c1 - vary.c2)).toBe(-10);
      expect(vary.q2).toBeLessThan(0);
    }
  });
}
