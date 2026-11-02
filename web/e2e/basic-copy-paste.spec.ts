/**
 * Copy and paste in Basic, 2D and 3D: what is selected and nothing more, a ghost that follows the
 * pointer, a bar to type where it goes, and the right plane across the two workspaces.
 */
import { test, expect, type Page } from '@playwright/test';

type P = { x: number; y: number; z: number };
const nodes = (page: Page) => page.evaluate(() => {
  const s = window.__stabileo;
  return s.nodeIds().map((id: number) => ({ id, ...s.nodePosition(id)! })) as Array<P & { id: number }>;
});
const elementCount = (page: Page) => page.evaluate(() => window.__stabileo.elementIds().length);
const added = (before: Array<{ id: number }>, after: Array<P & { id: number }>) =>
  after.filter((n) => !before.some((b) => b.id === n.id)).map(({ x, y, z }) => [x, y, z]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!);

async function portal2D(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(4);
}

async function copyNodes(page: Page, ids: number[]) {
  await page.evaluate((n) => window.__stabileoActions.selectNodes(n), ids);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('placement-hud')).toBeVisible();
}

test.describe('@smoke copy and paste in Basic', () => {
  test('2D: nodes alone come without their members, placed by the bar at typed coordinates', async ({ page }) => {
    await portal2D(page);
    const before = await nodes(page);
    await copyNodes(page, [1, 2, 3]);
    const hud = page.getByTestId('placement-hud');
    await expect(hud.getByTestId('placement-z')).toHaveCount(0);
    await expect(hud.locator('label', { hasText: /^Z/ })).toHaveCount(1);
    await hud.getByTestId('placement-x').fill('10');
    await hud.getByTestId('placement-y').fill('2');
    await hud.getByTestId('placement-y').press('Enter');
    await expect(hud).toHaveCount(0);
    expect(await elementCount(page)).toBe(3);
    expect(added(before, await nodes(page))).toEqual([[10, 2, 0], [10, 6, 0], [16, 6, 0]]);
  });

  test('2D: the ghost follows the pointer and a click puts it there, members included', async ({ page }) => {
    await portal2D(page);
    const before = await nodes(page);
    const elementsBefore = await elementCount(page);
    await page.evaluate(() => window.__stabileoActions.selectElements([1, 2]));
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect(page.getByTestId('placement-hud')).toBeVisible();
    // Screen from model, through three of the frame's nodes: (0,0), (6,0) and (0,4).
    const [o, ex, ey] = await page.evaluate(() => [1, 4, 2].map((id) => window.__stabileo.nodeScreenPos(id)!));
    const at = (x: number, y: number) => ({ x: o!.x + (x / 6) * (ex!.x - o!.x) + (y / 4) * (ey!.x - o!.x), y: o!.y + (x / 6) * (ex!.y - o!.y) + (y / 4) * (ey!.y - o!.y) });
    const p = at(9, 0);
    await page.mouse.move(p.x - 20, p.y - 20);
    await page.mouse.move(p.x, p.y, { steps: 4 });
    await expect(page.getByTestId('placement-x')).toHaveValue(/^9(\.0+)?$/);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('placement-hud')).toHaveCount(0);
    expect(await elementCount(page)).toBe(elementsBefore + 2);
    expect(added(before, await nodes(page))).toEqual([[9, 0, 0], [9, 4, 0], [15, 4, 0]]);
  });

  test('2D: Esc leaves the model as it was', async ({ page }) => {
    await portal2D(page);
    const before = await nodes(page);
    await copyNodes(page, [1, 2]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('placement-hud')).toHaveCount(0);
    expect(await nodes(page)).toEqual(before);
  });

  test('3D: a copy made in 2D stands in X–Z when pasted, as the model does', async ({ page }) => {
    await portal2D(page);
    await page.evaluate(() => window.__stabileoActions.selectNodes([1, 2, 3]));
    await page.keyboard.press('Control+c');
    await page.getByTestId('rb-cmd-dim').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.cameraState() !== null), { timeout: 15_000 }).toBe(true);
    const before = await nodes(page);
    await page.mouse.move(400, 300);
    await page.keyboard.press('Control+v');
    const hud = page.getByTestId('placement-hud');
    await expect(hud).toBeVisible();
    await expect(hud.getByTestId('placement-z')).toBeVisible();
    await hud.getByTestId('placement-x').fill('10');
    await hud.getByTestId('placement-y').fill('0');
    await hud.getByTestId('placement-z').fill('0');
    await hud.getByTestId('placement-z').press('Enter');
    await expect(hud).toHaveCount(0);
    const after = await nodes(page);
    for (const n of after) expect(n.y, `node ${n.id} stays in X–Z`).toBe(0);
    expect(added(before, after)).toEqual([[10, 0, 0], [10, 0, 4], [16, 0, 4]]);
  });

  test('3D: the ghost follows the pointer and a click puts the anchor there', async ({ page }) => {
    await portal2D(page);
    await page.getByTestId('rb-cmd-dim').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.cameraState() !== null), { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(800);
    const before = await nodes(page);
    await page.evaluate(() => window.__stabileoActions.selectElements([1, 2]));
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect(page.getByTestId('placement-hud')).toBeVisible();
    const p = (await page.evaluate(() => window.__stabileo.worldScreenPos(3, 0, 0)))!;
    await page.mouse.move(p.x - 15, p.y - 15);
    await page.mouse.move(p.x, p.y, { steps: 4 });
    await expect(page.getByTestId('placement-x')).toHaveValue(/^3(\.0+)?$/);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('placement-hud')).toHaveCount(0);
    expect(added(before, await nodes(page))).toEqual([[3, 0, 0], [3, 0, 4], [9, 0, 4]]);
  });

  test('3D: copied and pasted in 3D, nodes alone, placed by typed coordinates', async ({ page }) => {
    await portal2D(page);
    await page.getByTestId('rb-cmd-dim').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.cameraState() !== null), { timeout: 15_000 }).toBe(true);
    const before = await nodes(page);
    const elementsBefore = await elementCount(page);
    await copyNodes(page, [1, 2, 3]);
    const hud = page.getByTestId('placement-hud');
    await hud.getByTestId('placement-x').fill('0');
    await hud.getByTestId('placement-y').fill('5');
    await hud.getByTestId('placement-z').fill('0');
    await hud.getByTestId('placement-z').press('Enter');
    await expect(hud).toHaveCount(0);
    expect(await elementCount(page)).toBe(elementsBefore);
    expect(added(before, await nodes(page))).toEqual([[0, 5, 0], [0, 5, 4], [6, 5, 4]]);
  });
});
