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

test('@smoke a batch meshed from its dialog shows its progress at the viewer\'s foot, and the analysis keeps that mesh', async ({ pro: page }) => {
  await loadModel(page, 'pro-edificio-7p');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-shells').click();
  const slabs = (await page.evaluate(() => window.__stabileo.plates())).filter((p) => p.name.startsWith('L'));
  await page.getByTestId('plate-filter-slab').click();
  await page.getByTestId('plate-select-all').check();
  await expect.poll(() => page.evaluate(() => window.__stabileo.plateSelection().plates.length)).toBe(slabs.length);
  const chosen = slabs.length;

  await page.getByTestId('plate-mesh-open').click();
  await expect(page.getByTestId('plate-mesh-plan')).toBeVisible();
  await expect(page.getByTestId('plate-mesh-remesh-note')).toHaveCount(0);
  // The card can come and go between two looks of Playwright: what it showed is recorded as it shows.
  await page.evaluate(() => {
    const w = window as unknown as { cardSaid: string[] };
    w.cardSaid = [];
    new MutationObserver(() => { const c = document.querySelector('[data-testid="mesh-progress-card"]'); if (c) w.cardSaid.push(c.textContent ?? ''); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.getByTestId('plate-mesh-apply').click();
  await expect(page.getByTestId('plate-mesh-dialog')).toHaveCount(0);
  await expect(page.getByTestId('mesh-progress-card')).toHaveCount(0, { timeout: 30_000 });
  const said = await page.evaluate(() => (window as unknown as { cardSaid: string[] }).cardSaid);
  expect(said.some((x) => x.includes('Meshing plates') && x.includes(`of ${chosen} plates`))).toBe(true);
  await expect(page.locator('.toast').filter({ hasText: `${chosen} plates meshed` })).toBeVisible();

  await page.getByTestId('plate-mesh-open').click();
  await expect(page.getByTestId('plate-mesh-remesh-note')).toContainText(`The ${chosen} plates are already meshed`);
  await page.getByTestId('plate-mesh-dialog').getByRole('button', { name: 'Close' }).click();

  await page.getByTestId('pr-stage-analyse').click();
  const all = (await page.evaluate(() => window.__stabileo.plates())).length;
  const pending = Number(await page.getByTestId('analysis-mesh-state').getAttribute('data-pending'));
  expect(pending).toBeGreaterThan(0);
  expect(pending).toBeLessThanOrEqual(all - chosen);
  await expect(page.getByTestId('analysis-mesh-state')).toHaveText(`Mesh: ${pending} to mesh · ${all - pending} kept`);
  await expect(page.getByTestId('analysis-mesh-state')).toHaveAttribute('title', `Mesh: ${pending} of ${all} plates meshed at the analysis · ${all - pending} keep their mesh`);
});
