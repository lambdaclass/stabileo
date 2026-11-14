/**
 * A plate's mesh and shape in PRO, on the seven-storey building: the mesh dialog draws the kind
 * of element asked for and which way sides a and b run; holes are cut by marking cells of the
 * plate's drawing; a side is curved by its sagitta, which another plate does not inherit; the
 * plate's area loads open in the Loads tab with that plate as their target.
 */
import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

async function openSlab(page: import('@playwright/test').Page) {
  await loadModel(page, 'pro-edificio-7p');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-shells').click();
  const plates = await page.evaluate(() => window.__stabileo.plates());
  const slabs = plates.filter((p) => p.name.startsWith('L'));
  await page.getByTestId(`plate-row-${slabs[1]!.id}`).click();
  await expect(page.getByTestId('plate-panel-title')).toHaveText(slabs[1]!.name);
  return { slab: slabs[1]!, other: slabs[0]! };
}

test('@smoke the mesh dialog draws triangles when asked, and the directions of sides a and b on a grid', async ({ pro: page }) => {
  await openSlab(page);
  await page.getByTestId('plate-mesh-open').click();
  await page.getByTestId('plate-mesh-tri').click();
  await expect(page.getByTestId('plate-mesh-plan')).toContainText('triangles');
  const drawing = page.getByTestId('plate-mesh-drawing');
  await expect.poll(() => drawing.locator('polygon').evaluateAll((ps) => ps.every((p) => (p.getAttribute('points') ?? '').trim().split(' ').length === 3))).toBe(true);
  await expect(page.getByTestId('plate-mesh-first-side')).toBeVisible();

  await page.getByTestId('plate-mesh-quad').click();
  await page.getByTestId('plate-mesh-rect').click();
  await page.getByTestId('plate-mesh-size-v').fill('1');
  await page.getByTestId('plate-mesh-size-v').press('Enter');
  await expect(page.getByTestId('plate-mesh-plan')).toContainText(/rectangles of 0\.5 × 1 m/);
  await expect(page.getByTestId('plate-mesh-axes')).toContainText('a (u)');
  await expect(page.getByTestId('plate-mesh-axes')).toContainText('b (v)');
  await page.getByTestId('plate-mesh-apply').click();
  await expect(page.getByTestId('plate-mesh-dialog')).toHaveCount(0);
});

test('@smoke a hole is cut by marking cells on the plate\'s drawing, a side is curved by its sagitta, and the next plate starts clean', async ({ pro: page }) => {
  const { slab, other } = await openSlab(page);
  await page.getByTestId('plate-shape-open-holes').click();
  await expect(page.getByTestId('plate-shape-planned')).toBeVisible();
  const box = (await page.getByTestId('plate-shape-drawing').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height * 0.36);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('plate-shape-cut')).not.toHaveText(/\(0\)/);
  await page.getByTestId('plate-shape-cut').click();
  await expect(page.getByTestId('plate-shape-message')).toContainText('Cells taken out');
  await expect(page.getByTestId('plate-shape-hole-row-0')).toBeVisible();
  const cut = (await page.evaluate(() => window.__stabileo.plates())).find((p) => p.id === slab.id)!;
  expect(cut.holes).toBe(1);
  expect(cut.status).toBe('current');
  expect(cut.minAngle).toBeCloseTo(90, 3);

  await page.getByTestId('plate-shape-sides').click();
  await page.getByTestId('plate-shape-side-0').click({ force: true });
  await page.getByTestId('plate-shape-sagitta').fill('0.8');
  await page.getByTestId('plate-shape-sagitta').press('Enter');
  await page.getByTestId('plate-shape-curve').click();
  await expect(page.getByTestId('plate-shape-message')).toHaveText('Side curved.');
  await page.getByTestId('plate-shape-close').click();
  await expect(page.getByTestId('plate-curved-side-0')).toContainText('sagitta 0.8 m');
  expect((await page.evaluate(() => window.__stabileo.plates())).find((p) => p.id === slab.id)!.curvedSides).toBe(1);

  await page.getByTestId(`plate-row-${other.id}`).click();
  await page.getByTestId('plate-shape-open-sides').click();
  await page.getByTestId('plate-shape-side-0').click({ force: true });
  await expect(page.getByTestId('plate-shape-sagitta')).toHaveValue('0');
  await page.getByTestId('plate-shape-close').click();

  await page.getByTestId(`plate-row-${slab.id}`).click();
  if (!(await page.getByTestId('plate-open-loads').isVisible())) await page.getByTestId('plate-loads-toggle').click();
  await page.getByTestId('plate-open-loads').click();
  await expect(page.getByTestId('fl-target')).toHaveValue(`g:${slab.id}`);
});

test('@smoke two plates selected whole are one target in Loads, and each takes its own definition', async ({ pro: page }) => {
  await loadModel(page, 'pro-edificio-7p');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-shells').click();
  const plates = await page.evaluate(() => window.__stabileo.plates());
  const [a, b] = plates.filter((p) => p.name.startsWith('L'));
  await page.getByTestId(`plate-row-${a!.id}`).click();
  await page.getByTestId(`plate-row-${b!.id}`).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('plate-panel-title')).toHaveText('2 plates');
  await page.getByTestId('pr-cmd-loads').click();
  await page.getByTestId('load-tab-floor').click();
  await expect(page.getByTestId('fl-target')).toHaveValue('plates');
  await expect(page.getByTestId('fl-target').locator('option:checked')).toHaveText('Selected plates (2)');
  await page.getByTestId('fl-apply').click();
  const after = await page.evaluate(() => window.__stabileo.plates());
  expect(after.find((p) => p.id === a!.id)!.loads).toBe(a!.loads + 1);
  expect(after.find((p) => p.id === b!.id)!.loads).toBe(b!.loads + 1);
});
