/**
 * PRO › Loads on shells and floors: an area load along the shells' normal and on part of them, a
 * fluid to a level, and a floor load kept as its definition, limited to a zone, rewritten when the
 * model moves under it.
 */
import { test, expect, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

async function openWrite(page: Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  await page.getByTestId('write-load').click();
  await expect(page.getByTestId('write-load-form')).toBeVisible();
}
const loads = (page: Page) => page.evaluate(() => window.__stabileo.allLoads());

test.describe('@smoke PRO loads on shells and floors', () => {
  test('an area load along the local normal, then on a rectangle only, then a fluid', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await openWrite(page);
    await page.evaluate(() => window.__stabileoActions.selectShells([]));
    await page.getByTestId('wl-kind-surface').click();
    await page.getByTestId('wl-sl-dir').selectOption('local');
    await page.getByTestId('wl-sq').fill('10');
    const before = (await loads(page)).length;
    await page.getByTestId('wl-add').click();
    await expect(page.getByTestId('wl-done')).toBeVisible();
    let all = await loads(page);
    const added = all.slice(before);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((l) => l.type === 'surface3d' && l.data.frame === 'local' && l.data.q === 10)).toBe(true);

    // Part of them: a 1 × 1 m rectangle in plan.
    await page.getByTestId('wl-sl-dir').selectOption('down');
    await page.getByTestId('wl-sl-partial').check();
    for (const [k, v] of [['u1', '0'], ['v1', '0'], ['u2', '1'], ['v2', '1']]) await page.getByTestId(`wl-sl-${k}`).fill(v);
    await page.getByTestId('wl-add').click();
    all = await loads(page);
    const partial = all[all.length - 1]!;
    expect(partial.data.region).toMatchObject({ normal: [0, 0, 1] });
    // The table says how it acts.
    await expect(page.getByTestId('load-tables')).toContainText(/inside a region/);

    // A fluid 2 m deep over the slab: a load varying with depth on every shell under the level.
    await page.getByTestId('wl-kind-hydro').click();
    await page.getByTestId('wl-hy-level').fill('2');
    const n0 = (await loads(page)).length;
    await page.getByTestId('wl-add').click();
    all = await loads(page);
    expect(all.length).toBeGreaterThan(n0);
    expect(all[all.length - 1]).toMatchObject({ type: 'surface3d', data: { frame: 'local', vary: { c1: 2, q1: 0 } } });
  });

  test('a floor load kept as its definition, in a zone, is undone as one step', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-bays-x').fill('6; 7,5');
    await page.getByTestId('grid-generate-x').click();
    await page.getByTestId('grid-bays-y').fill('5');
    await page.getByTestId('grid-generate-y').click();
    await page.getByTestId('grid-heights').fill('3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('grid-frame-create').click();

    // A zone over the first bay at the level: the four corner nodes, in order.
    const corners = await page.evaluate(() => {
      const at = (x: number, y: number) => window.__stabileo.nodeIds().find((id) => {
        const p = window.__stabileo.nodePos(id)!;
        return Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6 && Math.abs(p.z - 3) < 1e-6;
      })!;
      return [at(0, 0), at(6, 0), at(6, 5), at(0, 5)];
    });
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('load-tab-floor').click();
    await page.evaluate((ids) => window.__stabileoActions.selectNodes(ids), corners);
    await page.getByTestId('lz-name').fill('Bay A');
    await page.getByTestId('lz-add').click();
    await expect(page.getByTestId('lz-list')).toContainText('30.00 m²');

    await page.getByTestId('fl-target').selectOption({ label: 'Zone · Bay A' });
    await page.getByTestId('fl-q').fill('4');
    await page.getByTestId('fl-q').press('Tab');
    // 6 × 5 m of the 13,5 × 5 m level: 4 kN/m² × 30 m².
    await expect(page.getByTestId('fl-summary')).toContainText('120.0 kN');
    await page.getByTestId('fl-apply').click();
    await expect(page.getByTestId('fl-def-row')).toHaveCount(1);
    const fromDef = async () => (await loads(page)).filter((l) => l.data.fromDef !== undefined).length;
    expect(await fromDef()).toBeGreaterThan(0);

    // Undone as one step: the definition and its loads.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    expect(await fromDef()).toBe(0);
    await expect(page.getByTestId('fl-def-row')).toHaveCount(0);
  });
});
