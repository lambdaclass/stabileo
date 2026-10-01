import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * Drawing in PRO: the bar that says what the next click does, the rings on what has been
 * picked, and the "Write …" cards that add the same things from the panel.
 *
 * The portal example: nodes 1-4 at the base, 5-8 on top; members 1-5, 2-6, 3-7, 4-8, 5-6,
 * 7-8, 5-7, 6-8.
 */

const census = (page: Page) => page.evaluate(() => window.__stabileo.modelCensus());
const click = async (page: Page, id: number) => {
  const p = (await page.evaluate((n) => window.__stabileo.nodeScreenPos(n), id))!;
  await page.mouse.click(p.x, p.y);
};
const open = async (page: Page, cmd: string) => {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId(`pr-cmd-${cmd}`).click();
};

test.beforeEach(async ({ pro: page }) => {
  await loadModel(page, '3d-portal-frame');
});

test('the bar sits under the ribbon, names the tool, and Escape leaves it', async ({ pro: page }) => {
  for (const [cmd, btn] of [['nodes', 'draw-node'], ['elements', 'draw-element'], ['supports', 'draw-support'], ['loads', 'draw-load']] as const) {
    await open(page, cmd);
    await page.getByTestId(btn).click();
    const bar = page.getByTestId('pro-draw-bar');
    await expect(bar).toBeVisible();
    const ribbon = (await page.getByTestId('pr-stage-model').boundingBox())!;
    expect((await bar.boundingBox())!.y, `${cmd}: under the top bar`).toBeGreaterThan(ribbon.y);
    await page.keyboard.press('Escape');
    await expect(bar).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__stabileo.currentTool())).toBe('select');
  }
});

test('a member: node I is ringed and named, and four clicks make two members', async ({ pro: page }) => {
  await open(page, 'elements');
  await page.getByTestId('draw-element').click();
  await page.getByTestId('draw-chain').uncheck();
  const before = (await census(page)).elements;
  await click(page, 1);
  await expect.poll(() => page.evaluate(() => window.__stabileo.drawPicked())).toEqual([1]);
  await expect(page.getByTestId('draw-step')).toContainText('1');
  await click(page, 2);
  await expect.poll(async () => (await census(page)).elements).toBe(before + 1);
  await expect.poll(() => page.evaluate(() => window.__stabileo.drawPicked())).toEqual([]);
  // The panel used to build members of its own from the selection: a third click joined
  // node 1 to node 3. Two members for four clicks, no more.
  await click(page, 3);
  await click(page, 4);
  await expect.poll(async () => (await census(page)).elements).toBe(before + 2);
});

test('chained members start where the last one ended', async ({ pro: page }) => {
  await open(page, 'elements');
  await page.getByTestId('draw-element').click();
  await page.getByTestId('draw-chain').check();
  const before = (await census(page)).elements;
  await click(page, 1);
  await expect.poll(() => page.evaluate(() => window.__stabileo.drawPicked())).toEqual([1]);
  await click(page, 2);
  await expect.poll(() => page.evaluate(() => window.__stabileo.drawPicked())).toEqual([2]);
  await click(page, 4);
  await expect.poll(async () => (await census(page)).elements).toBe(before + 2);
});

test('a plate of three nodes: corners ringed as they go, made on the last one', async ({ pro: page }) => {
  await open(page, 'shells');
  await page.getByTestId('draw-plate').click();
  await page.getByTestId('draw-corners-3').click();
  await click(page, 5);
  await click(page, 6);
  await expect.poll(() => page.evaluate(() => window.__stabileo.drawPicked())).toEqual([5, 6]);
  await expect(page.getByTestId('draw-corners')).toContainText('5');
  await expect(page.getByTestId('draw-step')).toContainText('3');
  await click(page, 8);
  await expect.poll(() => page.evaluate(() => (window.__stabileo.entityData('setting', 'plates') as unknown[]).length)).toBe(1);
  // The next one starts at once.
  await expect.poll(() => page.evaluate(() => window.__stabileo.drawPicked())).toEqual([]);
  await expect(page.getByTestId('pro-draw-bar')).toBeVisible();
});

test('a drawn support and a drawn load take what the bar says', async ({ pro: page }) => {
  await open(page, 'supports');
  await page.getByTestId('draw-support').click();
  await page.getByTestId('draw-support-type').selectOption('pinned3d');
  await click(page, 5);
  await expect.poll(() => page.evaluate(() =>
    (window.__stabileo.entityData('setting', 'supports') as Array<[number, { nodeId: number; type: string }]>)
      .find(([, s]) => s.nodeId === 5)?.[1].type)).toBe('pinned3d');

  await open(page, 'loads');
  await page.getByTestId('draw-load').click();
  await page.getByTestId('draw-load-nodal').click();
  await page.getByTestId('draw-load-fz').fill('0');
  await page.getByTestId('draw-load-fz').dispatchEvent('change');
  await page.getByTestId('draw-load-fx').fill('7');
  await page.getByTestId('draw-load-fx').dispatchEvent('change');
  const loads = (await census(page)).loads;
  await click(page, 6);
  await expect.poll(async () => (await census(page)).loads).toBe(loads + 1);
  const last = await page.evaluate(() => {
    const l = (window.__stabileo.entityData('setting', 'loads') as Array<{ type: string; data: Record<string, number> }>).at(-1)!;
    return { type: l.type, fx: l.data.fx, fz: l.data.fz, nodeId: l.data.nodeId };
  });
  expect(last).toEqual({ type: 'nodal3d', fx: 7, fz: 0, nodeId: 6 });
});

test('Write node, member and support add from the panel, Enter by Enter', async ({ pro: page }) => {
  await open(page, 'nodes');
  await page.getByTestId('write-node').click();
  await page.getByTestId('write-node-x').fill('10');
  await page.getByTestId('write-node-y').fill('0');
  await page.getByTestId('write-node-z').fill('4');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await census(page)).nodes).toBe(9);
  expect(await page.evaluate(() => window.__stabileo.nodePos(9))).toEqual({ x: 10, y: 0, z: 4 });
  // The X field takes the focus again for the next node.
  await expect(page.getByTestId('write-node-x')).toBeFocused();

  // Drawing and writing exclude each other.
  await page.getByTestId('draw-node').click();
  await expect(page.getByTestId('write-node-card')).toHaveCount(0);
  await page.getByTestId('write-node').click();
  await expect(page.getByTestId('pro-draw-bar')).toHaveCount(0);

  await open(page, 'elements');
  await page.getByTestId('write-element').click();
  await page.getByTestId('write-element-i').fill('6');
  await page.getByTestId('write-element-j').fill('9');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await census(page)).elements).toBe(9);
  // The next member starts where this one ended.
  await expect(page.getByTestId('write-element-i')).toHaveValue('9');

  await open(page, 'supports');
  await page.getByTestId('write-support').click();
  await page.getByTestId('write-support-type').selectOption('pinned3d');
  await page.getByTestId('write-support-nodes').fill('5, 7-8');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await census(page)).supports).toBe(7);
});

test('the next member is described where it is made: section, material and ends, named and one width', async ({ pro: page }) => {
  await open(page, 'elements');
  // No separate "next member" line in the panel any more.
  await expect(page.locator('.pro-elems > [data-testid="next-member"]')).toHaveCount(0);

  await page.getByTestId('write-element').click();
  const card = page.getByTestId('write-element-card');
  for (const id of ['nm-section', 'nm-material', 'nm-end-i', 'nm-end-j']) await expect(card.getByTestId(id)).toBeVisible();
  // Each picker says what it picks, and shows the model's own name rather than a placeholder.
  await expect(card.getByText('Section', { exact: true })).toBeVisible();
  await expect(card.getByText('Material', { exact: true })).toBeVisible();
  await expect(card.getByTestId('nm-section').locator('option:checked')).not.toHaveText(/default/i);
  const widths = await Promise.all(['nm-section', 'nm-material', 'nm-end-i', 'nm-end-j']
    .map(async (id) => Math.round((await card.getByTestId(id).boundingBox())!.width)));
  expect(new Set(widths).size, `widths ${widths}`).toBe(1);

  await card.getByTestId('nm-end-j').selectOption('pinned');
  await page.getByTestId('write-element-i').fill('5');
  await page.getByTestId('write-element-j').fill('7');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await census(page)).elements).toBe(9);
  const made = await page.evaluate(() => window.__stabileo.entityData('element', 9) as { releaseI?: { my?: boolean }; releaseJ?: { my?: boolean; mz?: boolean } });
  expect(made.releaseJ).toMatchObject({ my: true, mz: true });
  expect(made.releaseI?.my ?? false).toBe(false);

  // Drawing offers the same four, in the bar, and a truss is not asked for its ends.
  await page.getByTestId('draw-element').click();
  const bar = page.getByTestId('pro-draw-bar');
  await expect(bar.getByTestId('nm-end-j')).toHaveValue('pinned');
  await bar.getByRole('button', { name: 'Truss' }).click();
  await expect(bar.getByTestId('nm-end-i')).toHaveCount(0);
  await expect(bar.getByTestId('nm-section')).toBeVisible();
});

test('the tables add rows by writing, not by a footer button', async ({ pro: page }) => {
  await open(page, 'nodes');
  await expect(page.getByTestId('pro-add-node')).toHaveCount(0);
  await expect(page.getByTestId('write-node')).toBeVisible();
  await open(page, 'elements');
  await expect(page.getByTestId('pro-add-element')).toHaveCount(0);
  await expect(page.getByTestId('write-element')).toBeVisible();
});
