/**
 * PRO › Supports and Loads: one way to add each, the "Add" card, and every option of it applied to
 * the selection and to typed numbers.
 *
 * The portal example: nodes 1-4 at the base, 5-8 on top; members 1-5, 2-6, 3-7, 4-8 (columns) and
 * 5-6, 7-8, 5-7, 6-8 (beams). The mat foundation for the slab loads.
 */
import { test, expect, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

type Load = { type: string; data: Record<string, unknown> };
type Support = { nodeId: number; type: string; dofRestraints?: Record<string, boolean> };

const loads = (page: Page): Promise<Load[]> => page.evaluate(() => window.__stabileo.allLoads());
const supports = (page: Page): Promise<Support[]> => page.evaluate(() =>
  (window.__stabileo.entityData('setting', 'supports') as Array<[number, Support]>).map(([, s]) => s));
const supportOn = async (page: Page, node: number) => (await supports(page)).find((s) => s.nodeId === node);

async function openCard(page: Page, what: 'support' | 'load') {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId(`pr-cmd-${what}s`).click();
  if (!(await page.getByTestId(`write-${what}-card`).isVisible())) await page.getByTestId(`write-${what}`).click();
  await expect(page.getByTestId(`write-${what}-card`)).toBeVisible();
}
async function target(page: Page, by: 'selection' | 'ids' | 'range' | 'kind', value?: string) {
  await page.getByTestId('load-target-by').selectOption(by);
  if (by === 'ids') await page.getByTestId('load-target-ids').fill(value!);
  if (by === 'kind') await page.getByTestId('load-target-kind').selectOption(value!);
}
/** Add from the load card; returns the loads it added. */
async function addLoad(page: Page): Promise<Load[]> {
  const before = (await loads(page)).length;
  await page.getByTestId('wl-add').click();
  await expect(page.getByTestId('wl-error')).toHaveCount(0);
  await expect(page.getByTestId('wl-done')).toBeVisible();
  return (await loads(page)).slice(before);
}
const members = (added: Load[]) => added.map((l) => l.data.elementId).sort();
const nodes = (added: Load[]) => added.map((l) => l.data.nodeId).sort();

test.describe('@smoke PRO — adding supports and loads', () => {
  test('a support goes on the selection, on numbers and on a range, and takes the place of the one there', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await openCard(page, 'support');
    await expect(page.getByTestId('write-support-card')).toContainText('Add support');
    await page.getByTestId('write-support-card').getByTestId('sup-preset-pinned').click();

    // Nothing selected: nothing is added, and the card says why.
    await page.evaluate(() => window.__stabileoActions.selectNodes([]));
    await target(page, 'selection');
    await expect(page.getByTestId('load-target-count')).toContainText('0');
    const n0 = (await supports(page)).length;
    await page.getByTestId('write-support-card-submit').click();
    await expect(page.getByTestId('write-support-card-error')).toBeVisible();
    expect((await supports(page)).length).toBe(n0);

    // The selection.
    await page.evaluate(() => window.__stabileoActions.selectNodes([5, 6]));
    await expect(page.getByTestId('load-target-count')).toContainText('2');
    await page.getByTestId('write-support-card-submit').click();
    await expect(page.getByTestId('write-support-done')).toBeVisible();
    expect((await supportOn(page, 5))?.type).toBe('pinned3d');
    expect((await supportOn(page, 6))?.type).toBe('pinned3d');

    // Numbers, with a range in them; a number that is not a node is left out.
    await page.getByTestId('write-support-card').getByTestId('sup-preset-fixed').click();
    await target(page, 'ids', '7-8, 99');
    await expect(page.getByTestId('load-target-count')).toContainText('2');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await supportOn(page, 8))?.type).toBe('fixed3d');
    expect((await supportOn(page, 7))?.type).toBe('fixed3d');
    expect((await supports(page)).length).toBe(n0 + 4);

    // Only numbers that are not nodes: nothing.
    await target(page, 'ids', '99');
    await expect(page.getByTestId('load-target-count')).toContainText('0');
    await page.getByTestId('write-support-card-submit').click();
    await expect(page.getByTestId('write-support-card-error')).toBeVisible();

    // A range of heights: the four on top, already supported, take the new one in place.
    const top = await page.evaluate(() => window.__stabileo.nodePos(5)!.z);
    await target(page, 'range');
    await page.getByTestId('load-target-axis').selectOption('Z');
    await page.getByTestId('load-target-min').fill(String(top));
    await page.getByTestId('load-target-max').fill(String(top));
    await expect(page.getByTestId('load-target-count')).toContainText('4');
    await page.getByTestId('write-support-card').getByTestId('sup-preset-pinned').click();
    const steps = await page.evaluate(() => window.__stabileo.undoCount());
    await page.getByTestId('write-support-card-submit').click();
    await expect(page.getByTestId('write-support-done')).toContainText('4');
    // One undo step for the lot.
    expect(await page.evaluate(() => window.__stabileo.undoCount())).toBe(steps + 1);
    expect((await supports(page)).length).toBe(n0 + 4);
    for (const n of [5, 6, 7, 8]) expect((await supportOn(page, n))?.type, `node ${n}`).toBe('pinned3d');

  });

  test('the context menu on a node opens the same card on that node', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await openCard(page, 'support');
    await target(page, 'ids', '1');
    await page.evaluate(() => window.__stabileoActions.openNodeContextMenu(6));
    await page.locator('.ctx-menu').getByRole('button', { name: 'Add support' }).click();
    await expect(page.getByTestId('load-target-by')).toHaveValue('selection');
    await expect(page.getByTestId('load-target-count')).toContainText('1');
    await page.getByTestId('write-support-card-submit').click();
    await expect.poll(async () => (await supportOn(page, 6))?.type).toBeTruthy();

    // Loads: a node's kind, on the selection.
    await openCard(page, 'load');
    await page.getByTestId('wl-kind-distributed').click();
    await page.evaluate(() => window.__stabileoActions.openNodeContextMenu(7));
    await page.locator('.ctx-menu').getByRole('button', { name: 'Add load' }).click();
    await expect(page.getByTestId('write-load-card')).toBeVisible();
    await expect(page.getByTestId('wl-kind-nodal')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('load-target-count')).toContainText('1');
    await page.getByTestId('wl-fz').fill('-3');
    const added = await addLoad(page);
    expect(added).toMatchObject([{ type: 'nodal3d', data: { nodeId: 7, fz: -3 } }]);
  });

  test('node loads: forces, an inclined force and displacements, on the selection and on numbers', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await openCard(page, 'load');
    await expect(page.getByTestId('write-load-card')).toContainText('Add load');

    await page.getByTestId('wl-kind-nodal').click();
    await page.getByTestId('wl-fx').fill('7');
    await page.getByTestId('wl-mz').fill('1,5');
    await page.evaluate(() => window.__stabileoActions.selectNodes([5, 6]));
    await target(page, 'selection');
    let added = await addLoad(page);
    expect(nodes(added)).toEqual([5, 6]);
    expect(added[0]).toMatchObject({ type: 'nodal3d', data: { fx: 7, mz: 1.5 } });

    await target(page, 'ids', '7-8');
    added = await addLoad(page);
    expect(nodes(added)).toEqual([7, 8]);

    // Inclined: toward node 1 from node 5 is straight down.
    await page.getByTestId('wl-inclined').check();
    await page.getByTestId('wl-inc-f').fill('10');
    await page.getByTestId('wl-inc-node').fill('1');
    await target(page, 'ids', '5');
    added = await addLoad(page);
    expect(added).toHaveLength(1);
    const d = added[0]!.data as Record<string, number>;
    expect(Math.hypot(d.fx, d.fy, d.fz)).toBeCloseTo(10, 6);
    await page.getByTestId('wl-inclined').uncheck();

    await page.getByTestId('wl-kind-displacement').click();
    await page.getByTestId('wl-dz').fill('-10');
    await page.evaluate(() => window.__stabileoActions.selectNodes([1]));
    await target(page, 'selection');
    added = await addLoad(page);
    expect(added).toMatchObject([{ type: 'displacement3d', data: { nodeId: 1, dz: -0.01 } }]);
    await target(page, 'ids', '2, 3');
    added = await addLoad(page);
    expect(nodes(added)).toEqual([2, 3]);
  });

  test('member loads: every shape and kind, on the selection and on numbers', async ({ pro: page }) => {
    const ids = await loadModel(page, '3d-portal-frame');
    const [m1, m2, m3] = ids;
    await openCard(page, 'load');

    // Distributed, trapezoid.
    await page.getByTestId('wl-kind-distributed').click();
    await page.getByTestId('wl-qzi').fill('-5');
    await target(page, 'ids', `${m1}, ${m2}`);
    let added = await addLoad(page);
    expect(members(added)).toEqual([m1, m2].sort());
    expect(added[0]).toMatchObject({ type: 'distributed3d', data: { qZI: -5, qZJ: -5 } });
    await page.evaluate((m) => window.__stabileoActions.selectElements([m]), m3!);
    await target(page, 'selection');
    added = await addLoad(page);
    expect(members(added)).toEqual([m3]);

    // Triangle: two pieces per member.
    await page.getByTestId('wl-shape').selectOption('triangle');
    await page.getByTestId('wl-peak').fill('-8');
    added = await addLoad(page);
    expect(added.length).toBe(2);
    expect(added.every((l) => l.data.elementId === m3)).toBe(true);
    await target(page, 'ids', String(m1));
    added = await addLoad(page);
    expect(added.length).toBe(2);

    // Hydrostatic on the columns, by kind of member.
    await page.getByTestId('wl-shape').selectOption('hydrostatic');
    await page.getByTestId('wl-w1').fill('10');
    await page.getByTestId('wl-w2').fill('0');
    await page.getByTestId('wl-hydro-axis').selectOption('Z');
    await target(page, 'kind', 'column');
    await expect(page.getByTestId('load-target-count')).toContainText('4');
    added = await addLoad(page);
    expect(new Set(members(added)).size).toBe(4);
    await page.getByTestId('wl-shape').selectOption('trapezoid');

    // Concentrated, by numbers and by the selection.
    await page.getByTestId('wl-kind-point').click();
    await page.getByTestId('wl-pz').fill('-12');
    await page.getByTestId('wl-pa').fill('1');
    await target(page, 'ids', String(m2));
    added = await addLoad(page);
    expect(added).toMatchObject([{ type: 'pointOnElement3d', data: { elementId: m2, pz: -12, a: 1 } }]);
    await page.evaluate((m) => window.__stabileoActions.selectElements(m), [m1!, m3!]);
    await target(page, 'selection');
    added = await addLoad(page);
    expect(members(added)).toEqual([m1, m3].sort());

    // Thermal.
    await page.getByTestId('wl-kind-thermal').click();
    await page.getByTestId('wl-dt').fill('20');
    added = await addLoad(page);
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ type: 'thermal', data: { dtUniform: 20 } });
    await target(page, 'ids', String(m2));
    added = await addLoad(page);
    expect(members(added)).toEqual([m2]);

    // Initial strain.
    await page.getByTestId('wl-kind-strain').click();
    await page.getByTestId('wl-strain').fill('0,5');
    added = await addLoad(page);
    expect(added).toMatchObject([{ type: 'thermal', data: { elementId: m2, strain: 0.0005 } }]);
    await page.evaluate((m) => window.__stabileoActions.selectElements([m]), m1!);
    await target(page, 'selection');
    added = await addLoad(page);
    expect(members(added)).toEqual([m1]);

    // Prestress.
    await page.getByTestId('wl-kind-prestress').click();
    await page.getByTestId('wl-ps-force').fill('500');
    await page.getByTestId('wl-ps-em').fill('-100');
    added = await addLoad(page);
    expect(added).toMatchObject([{ type: 'prestress3d', data: { elementId: m1, force: 500, eM: -0.1 } }]);
    await target(page, 'ids', `${m2}-${m3}`);
    added = await addLoad(page);
    expect(added.length).toBe(Math.abs(m3! - m2!) + 1);
  });

  test('slab loads: area, fluid, point and thermal, on the selection and on numbers', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    const quads = await page.evaluate(() => window.__stabileo.quadIds());
    const [q1, q2] = quads;
    await openCard(page, 'load');

    await page.getByTestId('wl-kind-surface').click();
    await page.getByTestId('wl-sq').fill('-4');
    await target(page, 'ids', `${q1}, ${q2}`);
    await expect(page.getByTestId('load-target-count')).toContainText('2');
    let added = await addLoad(page);
    expect(added.map((l) => l.data.quadId).sort()).toEqual([q1, q2].sort());
    expect(added[0]).toMatchObject({ type: 'surface3d', data: { q: -4 } });
    await page.evaluate((k) => window.__stabileoActions.selectShells([k]), `q${q1}`);
    await target(page, 'selection');
    added = await addLoad(page);
    expect(added.map((l) => l.data.quadId)).toEqual([q1]);

    // A fluid up to a level above the slab: every shell picked.
    await page.getByTestId('wl-kind-hydro').click();
    await page.getByTestId('wl-hy-level').fill('2');
    added = await addLoad(page);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((l) => l.type === 'surface3d' && l.data.quadId === q1)).toBe(true);
    await target(page, 'ids', String(q2));
    added = await addLoad(page);
    expect(added.every((l) => l.data.quadId === q2)).toBe(true);

    // A point force at the middle of the first slab, shared among its corners.
    const mid = await page.evaluate((q) => {
      const quad = (window.__stabileo.entityData('setting', 'quads') as Array<[number, { nodes: number[] }]>).find(([id]) => id === q)![1];
      const ps = quad.nodes.map((n) => window.__stabileo.nodePos(n)!);
      return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length, z: ps.reduce((s, p) => s + p.z, 0) / ps.length };
    }, q1!);
    await page.getByTestId('wl-kind-shellPoint').click();
    for (const k of ['x', 'y', 'z'] as const) await page.getByTestId(`wl-sp-${k}`).fill(String(mid[k]));
    await page.getByTestId('wl-sp-fz').fill('-10');
    await target(page, 'ids', String(q1));
    added = await addLoad(page);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((l) => l.type === 'nodal3d')).toBe(true);
    expect(added.reduce((s, l) => s + (l.data.fz as number), 0)).toBeCloseTo(-10, 6);
    await page.evaluate((k) => window.__stabileoActions.selectShells([k]), `q${q1}`);
    await target(page, 'selection');
    added = await addLoad(page);
    expect(added.reduce((s, l) => s + (l.data.fz as number), 0)).toBeCloseTo(-10, 6);

    // Thermal on the slab.
    await page.getByTestId('wl-kind-thermalQuad').click();
    await page.getByTestId('wl-tq-dt').fill('15');
    added = await addLoad(page);
    expect(added).toMatchObject([{ type: 'thermalQuad3d', data: { quadId: q1, dtUniform: 15 } }]);
    await target(page, 'ids', `${q1}, ${q2}`);
    added = await addLoad(page);
    expect(added.map((l) => l.data.quadId).sort()).toEqual([q1, q2].sort());
  });

  test('on the selection, a button turns the pointer to selecting, and nothing is added until Add', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    for (const what of ['support', 'load'] as const) {
      await openCard(page, what);
      await target(page, 'selection');
      // The old row under the choice is gone.
      await expect(page.getByTestId('pick-nodes')).toHaveCount(0);
      await page.getByTestId('pr-pan').click();
      expect(await page.evaluate(() => window.__stabileo.currentTool())).toBe('pan');
      await openCard(page, what);
      const button = page.getByTestId('load-target-activate');
      await expect(button).toBeVisible();
      // Beside the choice, on its row.
      const by = (await page.getByTestId('load-target-by').boundingBox())!;
      const b = (await button.boundingBox())!;
      expect(b.x).toBeGreaterThan(by.x + by.width - 1);
      expect(Math.abs((b.y + b.height / 2) - (by.y + by.height / 2))).toBeLessThan(6);
      const before = { loads: (await loads(page)).length, supports: (await supports(page)).length };
      await button.click();
      expect(await page.evaluate(() => window.__stabileo.currentTool())).toBe('select');
      await expect(button).toHaveCount(0);
      await page.evaluate(() => window.__stabileoActions.selectNodes([5]));
      expect((await loads(page)).length).toBe(before.loads);
      expect((await supports(page)).length).toBe(before.supports);
    }
  });

  test('what the card adds to is said beside its Add button', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    for (const [what, add] of [['support', 'write-support-card-submit'], ['load', 'wl-add']] as const) {
      await openCard(page, what);
      await target(page, 'ids', '1-3');
      const count = page.getByTestId('load-target-count');
      await expect(count).toHaveText('Goes on 3 nodes.');
      const c = (await count.boundingBox())!, a = (await page.getByTestId(add).boundingBox())!;
      expect(c.x, what).toBeGreaterThan(a.x + a.width - 1);
      expect(Math.abs((c.y + c.height / 2) - (a.y + a.height / 2)), what).toBeLessThan(6);
    }
  });

  test('self-weight from General: the whole model, members by numbers or by the selection', async ({ pro: page }) => {
    const ids = await loadModel(page, '3d-portal-frame');
    type Rule = { caseId: number; direction: string; factor: number; elements?: number[]; groupId?: number };
    const rules = () => page.evaluate(() => (window.__stabileo.analysisSettings() as { selfWeight?: Rule[] } | null)?.selfWeight ?? []);
    await openCard(page, 'load');
    await page.getByTestId('wl-kind-selfWeight').click();
    await expect(page.getByTestId('load-target-by')).toHaveValue('all');
    await expect(page.getByTestId('load-target-count')).toContainText(`${ids.length} members`);
    const caseId = await page.evaluate(() => Number(window.__stabileo.loadCases()[0]!.id));
    await page.getByTestId('write-load-case').selectOption(String(caseId));
    const before = (await rules()).length;
    await page.getByTestId('wl-add').click();
    await expect(page.getByTestId('wl-done')).toBeVisible();
    let all = await rules();
    expect(all.length).toBeLessThanOrEqual(before + 1);
    expect(all).toContainEqual({ caseId, direction: 'Z', factor: -1 });
    // The same again replaces it.
    await page.getByTestId('wl-sw-factor').fill('-1,2');
    await page.getByTestId('wl-add').click();
    await expect(page.getByTestId('wl-done')).toContainText('in place of');
    all = await rules();
    expect(all.filter((r) => r.caseId === caseId && !r.elements && r.groupId === undefined)).toEqual([{ caseId, direction: 'Z', factor: -1.2 }]);

    // Numbers.
    await target(page, 'ids', `${ids[0]}, ${ids[1]}`);
    await page.getByTestId('wl-sw-dir').selectOption('X');
    await page.getByTestId('wl-sw-factor').fill('0,1');
    await page.getByTestId('wl-add').click();
    expect((await rules()).at(-1)).toEqual({ caseId, direction: 'X', factor: 0.1, elements: [ids[0], ids[1]].sort((a, b) => a! - b!) });

    // The selection.
    await page.evaluate((m) => window.__stabileoActions.selectElements([m]), ids[2]!);
    await target(page, 'selection');
    await page.getByTestId('wl-add').click();
    expect((await rules()).at(-1)).toEqual({ caseId, direction: 'X', factor: 0.1, elements: [ids[2]] });

    // Nothing named: nothing added.
    const n = (await rules()).length;
    await target(page, 'ids', '999');
    await page.getByTestId('wl-add').click();
    await expect(page.getByTestId('wl-error')).toBeVisible();
    expect((await rules()).length).toBe(n);

    // Listed with the loads, and removed there.
    await page.getByTestId('lt-scope-all').click();
    await expect(page.getByTestId('sw-row')).toHaveCount(n);
    await page.getByTestId('sw-remove').last().click();
    await expect.poll(async () => (await rules()).length).toBe(n - 1);

    // Back to a node kind: the whole model is not offered, and member numbers are not kept as node numbers.
    await page.getByTestId('wl-kind-nodal').click();
    await expect(page.getByTestId('load-target-by').locator('option[value="all"]')).toHaveCount(0);
    await expect(page.getByTestId('load-target-ids')).toHaveValue('');
    await page.getByTestId('wl-kind-selfWeight').click();
    await target(page, 'selection');
    await page.getByTestId('wl-kind-nodal').click();
    await expect(page.getByTestId('load-target-by')).toHaveValue('selection');
  });
});
