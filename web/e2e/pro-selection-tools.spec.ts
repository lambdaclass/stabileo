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

/*
 * Every operation of the panel answers in the kind armed above it. They used to answer in
 * members (like, parallel, walk) or in every kind at once (loaded in case, previous) whatever
 * was armed, so a Delete after them reached things the panel did not say it was selecting.
 */
test.describe('@smoke the selection panel works on the kind armed above it', () => {
  test('supports: like by type, walk through them, and no member operation on offer', async ({ pro: page }) => {
    await openSelection(page, 'supports');
    await expect(page.getByTestId('sel-like-parallel')).toHaveCount(0);
    await expect(page.getByTestId('sel-like-kind')).toBeDisabled();
    await expect(page.getByTestId('sel-parallel-go')).toBeDisabled();
    await expect(page.getByTestId('sel-loaded-go')).toBeDisabled();

    const supports = await page.evaluate(() => window.__stabileo.supportCount?.() ?? null);
    await page.getByTestId('sel-id-text').fill('1');
    await page.getByTestId('sel-id-go').click();
    await expect.poll(() => sel(page)).toEqual({ nodes: [], elements: [], supports: [1], loads: [] });
    await page.getByTestId('sel-like-kind').click();
    const s = await sel(page);
    expect(s.supports.length).toBeGreaterThan(1);
    expect(s.elements).toEqual([]);
    if (supports !== null) expect(s.supports.length).toBeLessThanOrEqual(supports);

    await page.getByTestId('sel-walk').click();
    await expect(page.getByTestId('sel-walk-at')).toContainText(`1 / ${s.supports.length}`);
    await expect.poll(async () => (await sel(page)).supports.length).toBe(1);
  });

  test('by id names supports and loads, plates as one kind, and arms what it names', async ({ pro: page }) => {
    await openSelection(page, 'elements');
    const kinds = await page.getByTestId('sel-id-kind').locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(kinds).toEqual(['elements', 'nodes', 'shells', 'supports', 'loads']);
    await page.getByTestId('sel-id-kind').selectOption('loads');
    await page.getByTestId('sel-id-text').fill('1, 3');
    await page.getByTestId('sel-id-go').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.armedKinds())).toEqual(['loads']);
    await expect.poll(() => sel(page)).toEqual({ nodes: [], elements: [], supports: [], loads: [1, 3] });
    // Armed again from above, the list follows.
    await page.getByTestId('select-mode-nodes').click();
    await expect(page.getByTestId('sel-id-kind')).toHaveValue('nodes');
  });

  test('previous selection gives back the armed kind, not another', async ({ pro: page }) => {
    await openSelection(page, 'elements');
    await page.getByTestId('sel-all').click();
    const members = (await sel(page)).elements;
    expect(members.length).toBeGreaterThan(0);
    await page.getByTestId('select-mode-supports').click();
    await page.getByTestId('sel-all').click();
    await expect.poll(async () => (await sel(page)).elements).toEqual([]);
    await page.getByTestId('select-mode-elements').click();
    await page.getByTestId('sel-none').click();
    await page.getByTestId('sel-previous').click();
    await expect.poll(() => sel(page)).toEqual({ nodes: [], elements: members, supports: [], loads: [] });
  });

  test('loaded in case, with nodes armed, takes the loaded nodes only', async ({ pro: page }) => {
    await openSelection(page, 'nodes');
    await page.getByTestId('sel-loaded-case').selectOption({ index: 0 });
    await page.getByTestId('sel-loaded-go').click();
    await expect.poll(() => sel(page)).toEqual({ nodes: [5], elements: [], supports: [], loads: [] });
  });
});
