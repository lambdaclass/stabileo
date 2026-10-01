import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * The selection tools in PRO, driven through the 3D viewport.
 *
 * Loads were the broken kind: a click in loads mode selected nothing (3D had no load picking),
 * a drag missed every nodal load (the 3D load types fell through to the member-load branch),
 * a selected load was not drawn any differently, and All, Invert and "loaded in case" only knew
 * nodes, members and shells.
 *
 * The portal example carries a nodal load (id 3) on node 5 and distributed loads (ids 1, 2) on
 * members 5 and 6.
 */

const sel = (page: Page) => page.evaluate(() => window.__stabileo.selectionByKind());
const nodeAt = async (page: Page, id: number) => {
  const p = await page.evaluate((n) => window.__stabileo.nodeScreenPos(n), id);
  expect(p, `node ${id} on screen`).not.toBeNull();
  return p!;
};

async function openSelection(page: Page, kind: string) {
  await page.getByTestId('pr-select').click();
  await page.getByTestId(`select-mode-${kind}`).click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.armedKinds())).toEqual([kind]);
}

test.beforeEach(async ({ pro: page }) => {
  await loadModel(page, '3d-portal-frame');
});

test('a click on a nodal load selects that load, and only it', async ({ pro: page }) => {
  await openSelection(page, 'loads');
  const at = await nodeAt(page, 5);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => sel(page)).toEqual({ nodes: [], elements: [], supports: [], loads: [3] });
  // A click on empty space clears it.
  await page.mouse.click(60, 860);
  await expect.poll(async () => (await sel(page)).loads).toEqual([]);
});

test('a click on a distributed load selects it, never the member under it', async ({ pro: page }) => {
  await openSelection(page, 'loads');
  const at = await page.evaluate(() => window.__stabileo.loadScreenPos(1));
  expect(at).not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
  await expect.poll(() => sel(page)).toEqual({ nodes: [], elements: [], supports: [], loads: [1] });
});

test('a crossing drag over the loaded node takes the nodal load', async ({ pro: page }) => {
  await openSelection(page, 'loads');
  const at = await nodeAt(page, 5);
  // Right to left: a crossing.
  await page.mouse.move(at.x + 15, at.y + 15);
  await page.mouse.down();
  await page.mouse.move(at.x - 15, at.y - 15, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await sel(page)).loads).toContain(3);
});

test('All, Invert, None and Previous reach loads and supports', async ({ pro: page }) => {
  await openSelection(page, 'loads');
  await page.getByTestId('sel-all').click();
  await expect.poll(async () => (await sel(page)).loads).toEqual([1, 2, 3]);
  await page.getByTestId('sel-none').click();
  await expect.poll(async () => (await sel(page)).loads).toEqual([]);
  await page.getByTestId('sel-previous').click();
  await expect.poll(async () => (await sel(page)).loads).toEqual([1, 2, 3]);

  await page.getByTestId('select-mode-supports').click();
  await page.getByTestId('sel-all').click();
  const s = await sel(page);
  expect(s.supports.length).toBeGreaterThan(0);
  expect(s.loads).toEqual([]);
  await page.getByTestId('sel-invert').click();
  await expect.poll(async () => (await sel(page)).supports).toEqual([]);
});

test('loaded in case takes the loads themselves while loads are armed', async ({ pro: page }) => {
  await openSelection(page, 'loads');
  await page.getByTestId('sel-loaded-go').click();
  await expect.poll(async () => (await sel(page)).loads).toEqual([1, 2, 3]);
  await page.getByTestId('select-mode-elements').click();
  await page.getByTestId('sel-loaded-go').click();
  const s = await sel(page);
  expect(s.loads).toEqual([]);
  expect(s.elements).toEqual([5, 6]);
});

test('every other kind still selects by click', async ({ pro: page }) => {
  await openSelection(page, 'nodes');
  const n1 = await nodeAt(page, 1);
  await page.mouse.click(n1.x, n1.y);
  await expect.poll(async () => (await sel(page)).nodes).toEqual([1]);

  await page.getByTestId('select-mode-supports').click();
  await page.mouse.click(n1.x, n1.y);
  await expect.poll(async () => (await sel(page)).supports.length).toBe(1);

  await page.getByTestId('select-mode-elements').click();
  const e = await page.evaluate(() => window.__stabileo.entityData('element', 1) as { nodeI: number; nodeJ: number });
  const a = await nodeAt(page, e.nodeI), b = await nodeAt(page, e.nodeJ);
  await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
  await expect.poll(async () => (await sel(page)).elements).toEqual([1]);
});

test('a click on a node keeps the results, even with a pixel of jitter', async ({ pro: page }) => {
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-solve').click();
  await expect(page.getByTestId('pr-cmd-axial')).toBeEnabled();
  const undo = await page.evaluate(() => window.__stabileo.undoCount());
  await openSelection(page, 'nodes');
  const at = await nodeAt(page, 5);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 2, at.y + 1);
  await page.mouse.up();
  await expect.poll(async () => (await sel(page)).nodes).toEqual([5]);
  // Not a drag: nothing moved, nothing went on the undo stack, the results stayed.
  expect(await page.evaluate(() => window.__stabileo.undoCount())).toBe(undo);
  await page.getByTestId('pr-stage-analyse').click();
  await expect(page.getByTestId('pr-cmd-axial')).toBeEnabled();
});
