/**
 * PRO › what is typed in the chosen units, names on nodes and members, a double click that frames,
 * and the clean-up that tells overlapping members from duplicates.
 */
import { test, expect, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

type Load = { type: string; data: Record<string, unknown> };
const loads = (page: Page): Promise<Load[]> => page.evaluate(() => window.__stabileo.allLoads());

async function units(page: Page, system: 'SI' | 'SImm' | 'MKS' | 'Imperial') {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-view').click();
  await page.getByTestId('view-unit-system').selectOption(system);
}
async function openLoadCard(page: Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  if (!(await page.getByTestId('write-load-card').isVisible())) await page.getByTestId('write-load').click();
}
async function addLoad(page: Page): Promise<Load[]> {
  const before = (await loads(page)).length;
  await page.getByTestId('wl-add').click();
  await expect(page.getByTestId('wl-done')).toBeVisible();
  return (await loads(page)).slice(before);
}

test.describe('@smoke PRO — units, names and table tools', () => {
  test('the Add load card reads the chosen units and keeps SI', async ({ pro: page }) => {
    const ids = await loadModel(page, '3d-portal-frame');

    // Technical metric: a tonne-force.
    await units(page, 'MKS');
    await openLoadCard(page);
    await page.getByTestId('wl-kind').selectOption('nodal');
    await expect(page.getByTestId('write-load-card')).toContainText('tf');
    await page.getByTestId('wl-fz').fill('-1');
    await page.getByTestId('load-target-by').selectOption('ids');
    await page.getByTestId('load-target-ids').fill('5');
    let added = await addLoad(page);
    expect(added[0]!.data.fz as number).toBeCloseTo(-9.80665, 6);

    // SI with millimetres: a distributed load from 500 mm.
    await units(page, 'SImm');
    await openLoadCard(page);
    await page.getByTestId('wl-kind').selectOption('distributed');
    await page.getByTestId('wl-qzi').fill('-2');
    await page.getByTestId('wl-a').fill('500');
    await page.getByTestId('load-target-by').selectOption('ids');
    await page.getByTestId('load-target-ids').fill(String(ids[0]));
    added = await addLoad(page);
    expect(added[0]!.data).toMatchObject({ qZI: -2, a: 0.5 });

    // Imperial: a temperature difference takes no offset.
    await units(page, 'Imperial');
    await openLoadCard(page);
    await page.getByTestId('wl-kind').selectOption('thermal');
    await page.getByTestId('wl-dt').fill('18');
    await page.getByTestId('load-target-by').selectOption('ids');
    await page.getByTestId('load-target-ids').fill(String(ids[0]));
    added = await addLoad(page);
    expect(added[0]!.data.dtUniform as number).toBeCloseTo(10, 6);
  });

  test('nodes and members take a name in their tables, and labels can show it', async ({ pro: page }) => {
    const ids = await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    const node = page.getByTestId('node-name-5');
    await node.fill('A1');
    await node.press('Enter');
    await expect.poll(() => page.evaluate(() => (window.__stabileo.entityData('setting', 'nodes') as Array<[number, { name?: string }]>).find(([id]) => id === 5)?.[1].name)).toBe('A1');

    await page.getByTestId('pr-cmd-elements').click();
    const member = page.getByTestId(`elem-name-${ids[0]}`);
    await member.fill('V101');
    await member.press('Enter');
    await expect.poll(() => page.evaluate((id) => (window.__stabileo.entityData('element', id) as { name?: string }).name, ids[0]!)).toBe('V101');

    await page.getByTestId('pr-cmd-view').click();
    await page.getByTestId('view-member-label').selectOption('name');
    await expect(page.getByTestId('view-member-label')).toHaveValue('name');
  });

  test('a double click on a table row frames it in the model', async ({ pro: page }) => {
    const ids = await loadModel(page, '3d-portal-frame');
    await page.evaluate(() => {
      (window as unknown as { __frames: number }).__frames = 0;
      window.addEventListener('stabileo-zoom-to-selection', () => { (window as unknown as { __frames: number }).__frames++; });
    });
    const frames = () => page.evaluate(() => (window as unknown as { __frames: number }).__frames);
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    await page.locator('.pro-nodes-table tbody tr').nth(2).locator('td.col-id').dblclick();
    await expect.poll(frames).toBe(1);
    await page.getByTestId('pr-cmd-elements').click();
    await page.locator(`.pro-elems-table tbody tr[data-elem="${ids[1]}"] td.col-id`).dblclick();
    await expect.poll(frames).toBe(2);
    expect(await page.evaluate(() => window.__stabileo.selection())).toEqual([ids[1]]);
    // A single click selects and does not frame.
    await page.locator(`.pro-elems-table tbody tr[data-elem="${ids[2]}"] td.col-id`).click();
    await page.waitForTimeout(300);
    expect(await frames()).toBe(2);
  });

  test('the clean-up removes duplicates and lists the overlapping members to choose from', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    await page.getByTestId('write-node').click();
    for (const x of [0, 6, 3]) {
      await page.getByTestId('write-node-x').fill(String(x));
      await page.getByTestId('write-node-card-submit').click();
    }
    await page.getByTestId('pr-cmd-elements').click();
    await page.getByTestId('write-element').click();
    for (const [i, j] of [[1, 2], [1, 2], [1, 3]] as const) {
      await page.getByTestId('write-element-i').fill(String(i));
      await page.getByTestId('write-element-j').fill(String(j));
      await page.keyboard.press('Enter');
    }
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(3);

    await page.getByTestId('pr-cmd-edit').click();
    await expect(page.getByTestId('ep-duplicates')).toContainText('1 duplicate');
    await expect(page.getByTestId('ep-overlaps')).toContainText('2 pairs');
    await page.getByTestId('ep-select-overlaps').click();
    expect((await page.evaluate(() => window.__stabileo.selection())).length).toBe(3);

    await page.getByTestId('ep-remove-duplicates').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(2);
    // The overlap stays for the modeller to settle.
    await expect(page.getByTestId('ep-overlaps')).toContainText('1 pairs');
    expect(await page.evaluate(() => window.__stabileo.elementIds().length)).toBe(2);
  });

  test('a P-Δ run with no second-order equilibrium is not published, and says why', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await openLoadCard(page);
    await page.getByTestId('wl-kind').selectOption('nodal');
    await page.getByTestId('wl-fz').fill('-1000000');
    await page.getByTestId('load-target-by').selectOption('ids');
    await page.getByTestId('load-target-ids').fill('5-8');
    await addLoad(page);
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('adv-run-pdelta').click();
    await expect(page.getByTestId('pdelta-refused')).toBeVisible();
    await expect(page.getByTestId('pdelta-summary')).toContainText('∞');
  });

  test('the report shows the model with its numbers as Figure 1, and puts the labels back', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await solveModel(page);
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-view').click();
    await page.getByTestId('view-label-nodes').uncheck();
    await page.getByTestId('view-label-members').uncheck();
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-report').click();
    const opened = page.context().waitForEvent('page');
    await page.getByTestId('rpt-pdf').click();
    const report = await opened;
    await report.waitForLoadState();
    const html = await report.content();
    expect(html).toContain('Figure 1.');
    expect(html).toMatch(/<img class="screenshot" src="data:image\/png/);
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-view').click();
    await expect(page.getByTestId('view-label-nodes')).not.toBeChecked();
    await expect(page.getByTestId('view-label-members')).not.toBeChecked();
  });

  test('beside the fields, a sketch of what they stand for, drawn from what is typed', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await openLoadCard(page);
    const sketch = page.getByTestId('load-sketch');
    for (const k of ['nodal', 'displacement', 'distributed', 'point', 'thermal', 'strain', 'prestress', 'selfWeight', 'surface', 'hydro', 'shellPoint', 'thermalQuad']) {
      await page.getByTestId('wl-kind').selectOption(k);
      await expect(sketch, k).toHaveAttribute('data-kind', k);
    }
    await page.getByTestId('wl-kind').selectOption('nodal');
    await page.getByTestId('wl-fz').fill('-10');
    await expect(sketch).toContainText('Fz = -10.00 kN');
    await page.getByTestId('wl-kind').selectOption('distributed');
    await page.getByTestId('wl-qzi').fill('-5');
    await expect(sketch).toContainText('qz I = -5.00 kN/m');
    // Beside the fields, not over them.
    const s = (await sketch.boundingBox())!, f = (await page.getByTestId('wl-qzi').boundingBox())!;
    expect(s.x).toBeGreaterThan(f.x + f.width);
    // Large, over the model and not over the panel; Escape closes it.
    await page.getByTestId('load-sketch-max').click();
    const big = page.getByTestId('load-sketch-big');
    await expect(big).toBeVisible();
    const b = (await big.boundingBox())!, card = (await page.getByTestId('write-load-card').boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(card.x + 1);
    await expect(page.getByTestId('load-sketch-big-svg')).toContainText('qz I = -5.00 kN/m');
    await page.keyboard.press('Escape');
    await expect(big).toHaveCount(0);
  });

  test('an inclined force takes its direction from an origin to a target, each a node or a point', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await openLoadCard(page);
    await page.getByTestId('wl-kind').selectOption('nodal');
    await page.getByTestId('wl-inclined').check();
    await page.getByTestId('wl-inc-f').fill('10');
    // From the point (0; 0; 4) toward (0; 0; 0): straight down, whatever node it acts at.
    await page.getByTestId('wl-inc-from-kind').selectOption('point');
    await page.getByTestId('wl-inc-from-z').fill('4');
    await page.getByTestId('wl-inc-to-kind').selectOption('point');
    await page.getByTestId('wl-inc-to-x').fill('0');
    await page.getByTestId('load-target-by').selectOption('ids');
    await page.getByTestId('load-target-ids').fill('6');
    const added = await addLoad(page);
    expect(added[0]!.data).toMatchObject({ nodeId: 6 });
    expect(added[0]!.data.fz as number).toBeCloseTo(-10, 6);
    expect(Math.abs(added[0]!.data.fx as number)).toBeLessThan(1e-9);
    // Origin and target in one place: no direction, nothing added.
    await page.getByTestId('wl-inc-from-z').fill('0');
    await page.getByTestId('wl-add').click();
    await expect(page.getByTestId('wl-error')).toBeVisible();
    await expect(page.getByTestId('load-sketch')).toHaveAttribute('data-kind', 'nodal');
  });
});
