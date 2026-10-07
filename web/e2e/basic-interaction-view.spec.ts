/**
 * Basic's interaction and view, as a user meets them:
 *  - a member drawn over one already there is not refused: the editor asks
 *    whether to delete the new one or keep both, in the connection queue;
 *  - clicking again on the same spot reaches the member under the first one;
 *  - a click on a table row selects what the row is;
 *  - hide or isolate from the context menu, and the chip that brings it back;
 *  - the supports switch and the label size, in Settings.
 */
import { test, expect, type Page } from './fixtures';

async function boot(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
}
const census = (page: Page) => page.evaluate(() => {
  const c = window.__stabileo.modelCensus();
  return { nodes: c.nodes, members: c.elements };
});
const selected = (page: Page) => page.evaluate(() => window.__stabileo.selectionByKind());

/** A beam drawn twice over the same two points, single-line mode. */
async function drawTwice(page: Page) {
  await page.getByTestId('rb-cmd-element').click();
  await page.getByTestId('member-mode-single').click();
  const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
  const at = (fx: number, fy: number) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await at(0.2, 0.55); await at(0.6, 0.55);
  await expect.poll(() => census(page)).toEqual({ nodes: 2, members: 1 });
  await at(0.2, 0.55); await at(0.6, 0.55);
  await expect.poll(() => census(page)).toEqual({ nodes: 2, members: 2 });
  return { box, at };
}

test.describe('@smoke Basic interaction and view', () => {
  test('a member drawn over another: the card offers to delete it', async ({ page }) => {
    await boot(page);
    await drawTwice(page);
    const prompt = page.getByTestId('connection-prompt');
    await expect(prompt).toContainText(/repite|repeats/);
    await page.getByTestId('connection-accept').click();
    await expect(prompt).toHaveCount(0);
    await expect.poll(() => census(page)).toEqual({ nodes: 2, members: 1 });
  });

  test('kept both: a second click on the same spot selects the other one', async ({ page }) => {
    await boot(page);
    const { at } = await drawTwice(page);
    await page.getByTestId('connection-decline').click();
    await expect.poll(() => census(page)).toEqual({ nodes: 2, members: 2 });
    await page.keyboard.press('Escape');
    await page.getByTestId('rb-cmd-select').click();
    await at(0.4, 0.55);
    await expect.poll(async () => (await selected(page)).elements).toEqual([1]);
    await at(0.4, 0.55);
    await expect.poll(async () => (await selected(page)).elements).toEqual([2]);
    await at(0.4, 0.55);
    await expect.poll(async () => (await selected(page)).elements).toEqual([1]);
  });

  test('a click on a table row selects the member', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('rb-cmd-element').click();
    await page.locator('td.id-cell', { hasText: /^2$/ }).first().click();
    await expect.poll(async () => (await selected(page)).elements).toEqual([2]);
  });

  test('hide and isolate from the context menu, and the chip shows all again', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.evaluate(() => window.__stabileoActions.selectElements([1]));
    const canvas = page.locator('canvas:not(.axis-gizmo)').first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + 20, { button: 'right' });
    await page.getByTestId('ctx-view-hide').click();
    const chip = page.getByTestId('hidden-items-chip');
    await expect(chip).toBeVisible();
    await page.getByTestId('hidden-items-show-all').click();
    await expect(chip).toHaveCount(0);
  });

  test('supports switch and label size live in Settings; the size is remembered', async ({ page }) => {
    await boot(page);
    await page.getByTestId('rb-settings').click();
    const supports = page.getByTestId('cfg-show-supports');
    await expect(supports).toBeChecked();
    await supports.uncheck();
    await expect(supports).not.toBeChecked();
    await page.getByTestId('cfg-label-size').fill('1.5');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('stabileo-label-scale'))).toBe('1.5');
  });

  test('panel scrollbars are on by default and switch off; node style is remembered', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('3d-portal-frame'));
    await page.getByTestId('rb-settings').click();
    const panel = page.getByTestId('basic-panel');
    await expect(panel).toHaveClass(/bp-scrollbars/);
    await page.getByTestId('cfg-panel-scrollbars').uncheck();
    await expect(panel).not.toHaveClass(/bp-scrollbars/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('stabileo-panel-scrollbars'))).toBe('0');
    const style = page.getByTestId('cfg-node-style');
    await expect(style).toHaveValue('auto');
    await style.selectOption('points');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('stabileo-node-style-3d'))).toBe('points');
  });

  test('loads: the row creates; selecting one turns it into the editor, with its own bin', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('rb-cmd-load').click();
    await expect(page.getByTestId('tool-mode-create')).toBeVisible();
    // No create row under the table any more.
    await expect(page.locator('.add-row')).toHaveCount(0);
    await page.locator('td.id-cell:visible').first().click();
    await expect(page.getByTestId('tool-mode-edit')).toBeVisible();
    await expect(page.getByTestId('tool-mode-create')).toHaveCount(0);
    // One bin: the editor's, not the large one as well.
    await expect(page.getByTestId('edit-delete')).toBeVisible();
    await expect(page.getByTestId('selection-delete')).toHaveCount(0);
    await page.getByTestId('edit-done').click();
    await expect(page.getByTestId('tool-mode-create')).toBeVisible();
  });

  test('self-weight sits first in the combinations fold, with the case it goes in', async ({ page }) => {
    await boot(page);
    await page.getByTestId('rb-cmd-load').click();
    await page.locator('.combos-fold > summary').click();
    await page.getByTestId('selfweight-toggle').check();
    await expect(page.getByTestId('selfweight-case')).toBeEnabled();
  });
});

test.describe('@smoke Basic 3D loads and members, and units', () => {
  const memberMid = (page: Page, id: number) => page.evaluate((e) => {
    const ends = window.__stabileo.elementEnds(e)!;
    const a = window.__stabileo.nodeScreenPos(ends.i)!, b = window.__stabileo.nodeScreenPos(ends.j)!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }, id);
  const loadsOn = (page: Page, id: number) => page.evaluate((e) =>
    window.__stabileo.allLoads().filter((l) => (l.data as { elementId?: number }).elementId === e), id);

  test('the load tool catches a member beside the pointer: distributed (global) and point loads', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('3d-portal-frame'));
    await page.getByTestId('rb-cmd-load').click();
    await page.getByRole('button', { name: /Distributed/ }).first().click();
    const m = await memberMid(page, 5);
    const before = (await loadsOn(page, 5)).length;
    await page.mouse.click(m.x + 4, m.y + 4);
    await expect.poll(async () => (await loadsOn(page, 5)).length).toBe(before + 1);
    const dist = (await loadsOn(page, 5)).at(-1)!;
    expect(dist.type).toBe('distributed3d');
    expect(dist.data.frame).toBe('global');
    // A point load where the click lands on the member, not only on a node.
    await page.getByRole('button', { name: /^Point/ }).first().click();
    await page.mouse.click(m.x + 3, m.y - 3);
    await expect.poll(async () => (await loadsOn(page, 5)).filter((l) => l.type === 'pointOnElement3d').length).toBe(1);
  });

  test('the member tool joins nodes clicked a few pixels beside them', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('3d-portal-frame'));
    await page.getByTestId('rb-cmd-element').click();
    const [n1, n2] = await page.evaluate(() => [window.__stabileo.nodeScreenPos(1)!, window.__stabileo.nodeScreenPos(2)!]);
    const before = await census(page);
    await page.mouse.click(n1.x + 10, n1.y + 6);
    await page.mouse.click(n2.x - 8, n2.y + 9);
    await expect.poll(async () => (await census(page)).members).toBe(before.members + 1);
  });

  test('units: the load bar is typed in the chosen system and stored in SI', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('rb-settings').click();
    await page.getByTestId('cfg-units').selectOption('MKS');
    await page.getByTestId('rb-cmd-load').click();
    await page.getByRole('button', { name: /Distributed/ }).first().click();
    const bar = page.getByTestId('tool-options');
    await expect(bar.locator('.ft-unit').first()).toHaveText('tf/m');
    const qI = bar.locator('input[type=number]').first();
    await qI.fill('-1');
    await bar.locator('input[type=number]').nth(1).fill('-1');
    const m = await memberMid(page, 2);
    const before = (await loadsOn(page, 2)).length;
    await page.mouse.click(m.x, m.y);
    await expect.poll(async () => (await loadsOn(page, 2)).length).toBe(before + 1);
    const q = (await loadsOn(page, 2)).at(-1)!.data as { qI: number };
    // One tonne-force per metre is 9.80665 kN/m.
    expect(Math.abs(q.qI)).toBeCloseTo(9.80665, 3);
  });
});

test.describe('@smoke Basic selection panel: every option works on the kinds armed above', () => {
  test('supports and loads are selected by all, by number, like the selection and walked through', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('rb-cmd-select').click();
    // The PRO-only rows are not here.
    for (const id of ['sel-like-kind', 'sel-like-level', 'sel-like-plane', 'sel-like-frame', 'sel-loaded-go', 'sel-parallel-go', 'sel-id-kind']) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    // One kind armed: loads.
    await page.getByTestId('select-mode-loads').click();
    await page.getByTestId('sel-all').click();
    await expect.poll(() => selected(page)).toMatchObject({ elements: [], nodes: [], supports: [], loads: [1, 2] });
    // Two kinds armed: supports and loads.
    await page.getByTestId('multi-kind').click();
    await page.getByTestId('select-mode-supports').click();
    await page.getByTestId('sel-none').click();
    await page.getByTestId('sel-id-text').fill('1, 9');
    await page.getByTestId('sel-id-go').click();
    await expect.poll(() => selected(page)).toMatchObject({ supports: [1], loads: [1] });
    await expect(page.getByTestId('sel-id-note')).toContainText('9');
    // Like the selection: every member is connected to the loaded ones, so every support and load.
    await page.getByTestId('sel-like-connected').click();
    await expect.poll(() => selected(page)).toMatchObject({ elements: [], supports: [1, 2], loads: [1, 2] });
    await page.getByTestId('sel-previous').click();
    await expect.poll(() => selected(page)).toMatchObject({ supports: [1], loads: [1] });
    // Walking steps through each one, in its own kind.
    await page.getByTestId('sel-walk').click();
    await expect(page.getByTestId('sel-walk-at')).toHaveText('1 / 2');
    await expect.poll(() => selected(page)).toMatchObject({ supports: [1], loads: [] });
    await page.getByTestId('sel-walk-next').click();
    await expect.poll(() => selected(page)).toMatchObject({ supports: [], loads: [1] });
  });
});

test.describe('@smoke Basic on a phone: create and edit in the sheet', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('selecting a support edits it in the row under the tool buttons', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('rb-cmd-model').tap();
    await page.getByTestId('dt-tab-supports').tap();
    const row = page.getByTestId('dt-tool-options');
    await expect(row.getByTestId('tool-mode-edit')).toHaveCount(0);
    await page.locator('td.id-cell:visible').first().tap();
    await expect(row.getByTestId('tool-mode-edit')).toBeVisible();
    await expect(row.getByTestId('edit-delete')).toBeVisible();
    await expect(page.getByTestId('selection-delete')).toHaveCount(0);
    await row.getByTestId('edit-done').tap();
    await expect(row.getByTestId('tool-mode-edit')).toHaveCount(0);
  });
});
