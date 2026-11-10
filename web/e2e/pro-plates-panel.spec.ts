/**
 * The plates panel of PRO on the seven-storey building: a list that says what each plate is and
 * whether a mesher meshed it, a batch of plates meshed from the editor under the list, and the
 * panel switched to the mesh's elements and back with the selection carried over.
 */
import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test('@smoke plates are listed by level with their kind and mesh, meshed in a batch, and the panel switches to their elements and back', async ({ pro: page }) => {
  await loadModel(page, 'pro-edificio-7p');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-shells').click();
  const plates = await page.evaluate(() => window.__stabileo.plates());
  const slabs = plates.filter((p) => p.name.startsWith('L'));
  expect(plates.filter((p) => p.name.startsWith('M')).length).toBeGreaterThan(0);

  const first = page.getByTestId(`plate-row-${slabs[0]!.id}`);
  await expect(first).toContainText('Slab');
  await expect(page.getByTestId(`plate-state-${slabs[0]!.id}`)).toHaveText(/not meshed · 1 element as modelled/);

  await page.getByTestId('plate-filter-wall').click();
  await expect(first).toHaveCount(0);
  await page.getByTestId('plate-filter-all').click();

  await first.click();
  await page.getByTestId(`plate-row-${slabs[1]!.id}`).click({ modifiers: ['Shift'] });
  await expect.poll(() => page.evaluate(() => window.__stabileo.plateSelection().plates)).toEqual([slabs[0]!.id, slabs[1]!.id].sort((a, b) => a - b));
  await expect(page.getByTestId('plate-panel-title')).toHaveText('2 plates');

  await page.getByTestId('plate-mesh-open').click();
  await expect(page.getByTestId('plate-mesh-plan')).toBeVisible();
  await page.getByTestId('plate-mesh-apply').click();
  await expect(page.getByTestId('plate-mesh-dialog')).toHaveCount(0);
  for (const s of slabs.slice(0, 2)) await expect(page.getByTestId(`plate-state-${s.id}`)).toHaveText(/^meshed · \d+ elements of 0\.5 m$/);
  await expect(page.getByTestId(`plate-state-${slabs[2]!.id}`)).toHaveText(/not meshed/);

  await page.getByTestId('plates-scope-element').click();
  await expect(page.locator('.data-table')).toHaveCount(1);
  await expect(page.getByTestId('plate-list')).toHaveCount(0);
  expect((await page.evaluate(() => window.__stabileo.plateSelection())).plates).toEqual([]);
  await page.getByTestId('plates-scope-plate').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.plateSelection().plates)).toEqual([slabs[0]!.id, slabs[1]!.id].sort((a, b) => a - b));
});
