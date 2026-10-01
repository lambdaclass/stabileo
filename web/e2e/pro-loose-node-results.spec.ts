import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * One click in empty space with the node tool left a node no member holds. The solve failed on
 * it (singular stiffness), the results were cleared and every diagram button stayed disabled,
 * which read as results that could not be selected. The node is now left out of the solve and
 * still reported by the diagnostics.
 */
test('a stray node from the draw tool does not take the results away', async ({ pro: page }) => {
  await loadModel(page, '3d-portal-frame');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-nodes').click();
  await page.getByTestId('draw-node').click();
  const before = await page.evaluate(() => window.__stabileo.nodeIds().length);
  await page.mouse.click(420, 420);
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeIds().length)).toBe(before + 1);

  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-solve').click();
  const axial = page.getByTestId('pr-cmd-axial');
  await expect(axial).toBeEnabled();
  await axial.click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.diagramMembers())).toBeGreaterThan(0);
});
