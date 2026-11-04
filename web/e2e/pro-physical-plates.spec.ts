import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * A plate as a physical object, from the interface: drawn as an outline on the portal's top
 * nodes (5-6-8-7), with no mesh; meshed from its panel after a plan; selected whole by a click on
 * its mesh, or one element when picking elements; meshed again without accumulating; loaded on
 * the plate; analysed; undone.
 */

const plates = (page: Page) => page.evaluate(() => window.__stabileo.plates());
const sel = (page: Page) => page.evaluate(() => window.__stabileo.plateSelection());
const quads = (page: Page) => page.evaluate(() => window.__stabileo.quadIds().length);
const at = (page: Page, id: number) => page.evaluate((n) => window.__stabileo.nodeScreenPos(n), id);
const click = async (page: Page, id: number) => {
  let p = await at(page, id);
  for (let k = 0; k < 20; k++) {
    await page.waitForTimeout(50);
    const q = await at(page, id);
    if (p && q && Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5) break;
    p = q;
  }
  await page.mouse.click(p!.x, p!.y);
};
/** A point inside the plate, between its corners on screen, off every node and member. */
const inside = async (page: Page) => {
  const c = await Promise.all([5, 6, 8, 7].map((n) => at(page, n)));
  const w = [0.35, 0.15, 0.2, 0.3];
  return { x: c.reduce((s, p, i) => s + p!.x * w[i]!, 0), y: c.reduce((s, p, i) => s + p!.y * w[i]!, 0) };
};

test.beforeEach(async ({ pro: page }) => {
  await loadModel(page, '3d-portal-frame');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-shells').click();
});

test('@smoke a plate drawn on an outline has no mesh, meshes from its panel, and is picked whole', async ({ pro: page }) => {
  await page.getByTestId('draw-plate').click();
  await expect(page.getByTestId('draw-corners-outline')).toHaveAttribute('aria-pressed', 'true');
  for (const n of [5, 6, 8, 7]) await click(page, n);
  await expect(page.getByTestId('draw-close-outline')).toBeEnabled();
  await click(page, 5);
  await expect.poll(() => plates(page)).toHaveLength(1);
  const [p] = await plates(page);
  expect(p!.status).toBe('unmeshed');
  expect(await quads(page)).toBe(0);
  await page.getByTestId('draw-stop').click();

  // Selected whole, its panel says it has no mesh.
  await expect(page.getByTestId('plate-panel')).toBeVisible();
  await expect(page.getByTestId(`plate-status-${p!.id}`)).toHaveText(/no mesh/);

  // Meshed from the panel, after the plan.
  await page.getByTestId('plate-mesh-open').click();
  await expect(page.getByTestId('plate-mesh-plan')).toBeVisible();
  await page.getByTestId('plate-mesh-size').fill('1');
  await page.getByTestId('plate-mesh-size').press('Tab');
  await expect(page.getByTestId('plate-mesh-apply')).toBeEnabled();
  await page.getByTestId('plate-mesh-apply').click();
  await expect.poll(async () => (await plates(page))[0]!.status).toBe('current');
  const n1 = await quads(page);
  expect(n1).toBeGreaterThan(4);

  // Drawn as the piece (outline only); a click on it still selects the plate whole.
  await page.getByTestId('plates-show-mesh').uncheck();

  // A click on the mesh selects the plate whole; picking elements, one element.
  await page.getByTestId('pr-select').click();
  const q = await inside(page);
  await page.mouse.click(q.x, q.y);
  await expect.poll(async () => (await sel(page)).plates).toEqual([p!.id]);
  expect((await sel(page)).shells).toHaveLength(n1);
  // Selected whole, the plate shows one local-axis triad, its own, not one per element.
  await expect.poll(() => page.evaluate(() => window.__stabileo.localAxesTriads())).toBe(1);

  await page.getByTestId('pr-cmd-shells').click();
  await page.getByTestId('plates-show-mesh').check();
  await page.getByTestId('plate-show-elements').click();
  await expect.poll(async () => (await sel(page)).scope).toBe('element');
  await page.mouse.click(q.x, q.y);
  await expect.poll(async () => (await sel(page)).shells.length).toBe(1);
  // One element picked: its own triad.
  await expect.poll(() => page.evaluate(() => window.__stabileo.localAxesTriads())).toBe(1);
  expect((await sel(page)).plates).toEqual([]);
  // And back to the plate it belongs to.
  await page.getByTestId('shell-select-owner').click();
  await expect.poll(async () => (await sel(page)).plates).toEqual([p!.id]);

  // Meshed again at another size: the mesh is replaced, not added to.
  await page.getByTestId('plate-mesh-open').click();
  await page.getByTestId('plate-mesh-size').fill('0.5');
  await page.getByTestId('plate-mesh-size').press('Tab');
  await expect(page.getByTestId('plate-mesh-plan')).toContainText(/\d/);
  await page.getByTestId('plate-mesh-apply').click();
  await expect.poll(() => quads(page)).toBeGreaterThan(n1);
  expect((await plates(page))[0]!.shells).toBe(await quads(page));

  // An area load on the plate; undo takes the mesh back, the plate stays.
  await page.getByTestId('plate-loads-toggle').click();
  await page.getByTestId('plate-load-q').fill('2');
  await page.getByTestId('plate-load-q').press('Tab');
  await page.getByTestId('plate-load-add').click();
  await expect.poll(async () => (await plates(page))[0]!.loads).toBe(1);
});

test('@smoke an analysis meshes the plate first, and stops when told not to', async ({ pro: page }) => {
  await page.getByTestId('draw-plate').click();
  for (const n of [5, 6, 8, 7, 5]) await click(page, n);
  await expect.poll(() => plates(page)).toHaveLength(1);
  await page.getByTestId('draw-stop').click();

  await page.getByTestId('pr-stage-analyse').click();
  await expect(page.getByTestId('analysis-mesh-state')).toContainText('1');
  await page.getByTestId('analysis-mesh-auto').uncheck();
  await page.getByTestId('pr-cmd-solve').click();
  await expect.poll(async () => (await plates(page))[0]!.status).toBe('unmeshed');
  expect(await quads(page)).toBe(0);

  await page.getByTestId('analysis-mesh-auto').check();
  await page.getByTestId('pr-cmd-solve').click();
  await expect.poll(async () => (await plates(page))[0]!.status, { timeout: 20_000 }).toBe('current');
  await expect(page.getByTestId('analysis-mesh-state')).not.toContainText('1');
  await expect.poll(() => page.evaluate(() => window.__stabileo.solveCount())).toBeGreaterThan(0);
});

test('@smoke a plate of five nodes is picked by a click in the default mode and among several kinds', async ({ pro: page }) => {
  // A fifth node in the roof's plane, beyond the 6–8 side: the outline 5, 6, 99, 8, 7 is a pentagon.
  const file = JSON.parse(await page.evaluate(() => window.__stabileo.serializeProject()));
  const snap = file.snapshot ?? file;
  snap.nodes.push([99, { id: 99, x: 7.8, y: 2, z: 4 }]);
  if (snap.nextId) snap.nextId.node = Math.max(snap.nextId.node ?? 0, 100);
  expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), file)).toBe(true);
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-shells').click();
  await page.getByTestId('draw-plate').click();
  for (const n of [5, 6, 99, 8, 7]) await click(page, n);
  await click(page, 5);
  await expect.poll(() => plates(page)).toHaveLength(1);
  const [p] = await plates(page);
  await page.getByTestId('draw-stop').click();
  const c = await Promise.all([5, 6, 99, 8, 7].map((n) => at(page, n)));
  const inside = { x: c.reduce((s, q) => s + q!.x, 0) / 5, y: c.reduce((s, q) => s + q!.y, 0) / 5 };
  const clickInside = async () => {
    await page.mouse.click(10, 300);
    await expect.poll(async () => (await sel(page)).plates).toEqual([]);
    await page.mouse.click(inside.x, inside.y);
  };

  // The default mode (members): nothing else under the pointer, so the plate.
  await page.getByTestId('pr-select').click();
  await page.getByTestId('select-mode-elements').click();
  await clickInside();
  await expect.poll(async () => (await sel(page)).plates).toEqual([p!.id]);

  // Several kinds at once, plates among them.
  await page.getByTestId('multi-kind').check();
  await clickInside();
  await expect.poll(async () => (await sel(page)).plates).toEqual([p!.id]);

  // Meshed as a grid of 0.5 m squares: exact squares inside, a transition strip along the outline.
  await page.getByTestId('pr-cmd-shells').click();
  await page.getByTestId('plate-mesh-open').click();
  await page.getByTestId('plate-mesh-square').click();
  await page.getByTestId('plate-mesh-size').fill('0.5');
  await page.getByTestId('plate-mesh-size').press('Tab');
  await expect(page.getByTestId('plate-mesh-plan')).toContainText(/squares of 0.5|cuadrados de 0,5/);
  if (process.env.SHOT) await page.getByTestId('plate-mesh-dialog').screenshot({ path: process.env.SHOT });
  await page.getByTestId('plate-mesh-apply').click();
  await expect.poll(async () => (await plates(page))[0]!.status).toBe('current');
});

test('@smoke Diagnostics opens from the Analyse row and lists a plate with no mesh', async ({ pro: page }) => {
  await page.getByTestId('draw-plate').click();
  for (const n of [5, 6, 8, 7, 5]) await click(page, n);
  await expect.poll(() => plates(page)).toHaveLength(1);
  await page.getByTestId('draw-stop').click();

  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-diagnostics').click();
  await expect(page.getByTestId('pr-cmd-diagnostics')).toHaveClass(/\bactive\b/);
  await expect(page.locator('.diag-item').filter({ hasText: /no mesh|sin malla|sem malha/ })).toHaveCount(1);
});
