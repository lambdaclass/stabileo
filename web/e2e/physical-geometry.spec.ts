/**
 * The concrete as built, through the interface: the View panel's «Physical geometry» style, the
 * reinforcement workspace's beam-column joints with their own switch, and the IFC's column top as a
 * project setting. The geometry itself is pinned in `engine/physical/__tests__/physical-frame.test.ts`
 * and its four readers in `store/__tests__/physical-frame-consumers.test.ts`.
 *
 * The frame (`physical-joints-frame.json`) has every joint the node-to-node solids got wrong: beams
 * wider than the columns, two corners with no column, an eccentric column, and every joint at the roof.
 */
import { readFileSync } from 'node:fs';
import { test, expect, designAll, designPlace, openDocumentsStage } from './fixtures';

const FRAME = JSON.parse(readFileSync('src/lib/engine/physical/__tests__/fixtures/physical-joints-frame.json', 'utf8'));
test.use({ viewport: { width: 1400, height: 900 } });

async function load(page: import('@playwright/test').Page) {
  await page.evaluate((j) => window.__stabileoActions.loadModelData(j), FRAME);
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(16);
}

test('@smoke the View panel turns the physical geometry on and back to the lines', async ({ pro: page }) => {
  await load(page);
  // PRO chooses how the bars are drawn in one place: the cube's menu only opens the View panel.
  await page.getByTestId('cam-menu').click();
  await expect(page.getByTestId('cam-render')).toHaveCount(0);
  await page.getByTestId('cam-more-view').click();
  await expect(page.getByTestId('cam-menu-pop')).toHaveCount(0);
  const style = page.getByTestId('view-style');
  await expect(style).toBeInViewport();
  await style.selectOption('physical');
  await expect.poll(() => page.evaluate(() => window.__stabileo.renderMode3D())).toBe('physical');
  await expect(page.getByTestId('view-style-hint')).not.toBeEmpty();
  await style.selectOption('wireframe');
  await expect.poll(() => page.evaluate(() => window.__stabileo.renderMode3D())).toBe('wireframe');
});

test.describe('@slow the joints of a designed frame', () => {
  test('the workspace draws each joint once, with its own switch; the IFC takes the column top from the project', async ({ pro: page }) => {
    test.setTimeout(600_000);
    await load(page);
    await designAll(page);
    await designPlace(page, 'detailing');
    await page.getByTestId('cmd-generate-detailing').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.detailingAssemblies().length), { timeout: 120_000 }).toBeGreaterThan(0);
    await openDocumentsStage(page);

    // The IFC: columns up to the slab's soffit, kept in the project; the joints in the members' bodies.
    const panel = page.getByTestId('exchange-panel').first();
    await panel.scrollIntoViewIfNeeded();
    await panel.getByTestId('exchange-ifc-column-top').selectOption('slabSoffit');
    expect(await page.evaluate(() => window.__stabileo.serializeProject())).toContain('"ifcColumnTop":"slabSoffit"');
    const [ifc] = await Promise.all([page.waitForEvent('download'), panel.getByTestId('exchange-ifc').click()]);
    const text = readFileSync(await ifc.path(), 'utf8');
    // Six columns and ten beams; the eight joints as vertical prisms inside their owners' bodies.
    expect((text.match(/IFCCOLUMN\(/g) ?? []).length).toBe(6);
    expect((text.match(/IFCARBITRARYCLOSEDPROFILEDEF\(/g) ?? []).length).toBeGreaterThanOrEqual(8);

    // The workspace: a joint per beam-column node and per column-less corner, behind their switch.
    await page.getByTestId('doc-3d').click();
    await expect(page.getByTestId('rebar-workspace')).toBeVisible();
    type Census = { solids: Record<string, number> };
    const joints = () => page.evaluate(() => (window.__stabileo as unknown as { rebarSceneCensus(): Census | null }).rebarSceneCensus()?.solids.joint ?? -1);
    await expect.poll(joints, { timeout: 60_000 }).toBeGreaterThanOrEqual(8);
    await expect(page.getByTestId('rebar-layer-joint')).toBeVisible();
    await page.getByTestId('rebar-layer-joint').uncheck();
    await expect.poll(joints, { timeout: 60_000 }).toBe(0);
  });
});
