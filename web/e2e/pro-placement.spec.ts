/**
 * Placement in PRO: copy, paste with a ghost that follows the pointer, rotate and place with a
 * click, one undo step; Esc leaves the model as it was. The transforms and welds are pinned in
 * `store/__tests__/placement.test.ts`; this checks the keys and the viewport drive them.
 */
import { test, expect } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

/** The model canvas's point (x, y), in page coordinates. */
async function at(page: import('@playwright/test').Page, x: number, y: number) {
  const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
  return { x: box.x + x, y: box.y + y };
}

test.describe('@smoke placement', () => {
  test('copy, paste with the ghost, rotate, click to place, undo in one step', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      window.__stabileoActions.selectElements([1, 2, 3]);
    });
    const census = () => page.evaluate(() => window.__stabileo.modelCensus());
    const before = await census();
    let p = await at(page, 300, 300);
    await page.mouse.move(p.x, p.y);
    await page.keyboard.press(`${mod}+c`);
    await page.keyboard.press(`${mod}+v`);
    await expect(page.getByTestId('placement-hud')).toBeVisible();
    await page.keyboard.press('r');
    await expect(page.getByTestId('placement-rotation')).toContainText('90');
    // The model is untouched while the ghost moves.
    p = await at(page, 420, 520);
    await page.mouse.move(p.x, p.y, { steps: 4 });
    expect((await census()).elements).toBe(before.elements);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId('placement-hud')).toBeHidden();
    const after = await census();
    expect(after.elements).toBe(before.elements + 3);
    await page.keyboard.press(`${mod}+z`);
    expect((await census()).elements).toBe(before.elements);
  });

  test('Esc cancels and typed coordinates place exactly', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      window.__stabileoActions.selectElements([1]);
    });
    const census = () => page.evaluate(() => window.__stabileo.modelCensus());
    const before = await census();
    const p = await at(page, 300, 300);
    await page.mouse.move(p.x, p.y);
    await page.keyboard.press(`${mod}+c`);
    await page.keyboard.press(`${mod}+v`);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('placement-hud')).toBeHidden();
    expect(await census()).toEqual(before);

    await page.keyboard.press(`${mod}+v`);
    await page.getByTestId('placement-x').fill('50');
    await page.getByTestId('placement-y').fill('0');
    await page.getByTestId('placement-z').fill('0');
    await page.getByTestId('placement-x').press('Enter');
    await expect(page.getByTestId('placement-hud')).toBeHidden();
    expect((await census()).nodes).toBe(before.nodes + 2);
  });

  test('move by two points, typed, moves the selection; a group places a copy', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      window.__stabileoActions.selectElements([1]);
    });
    const census = () => page.evaluate(() => window.__stabileo.modelCensus());
    const before = await census();
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-transform').click();
    await page.getByTestId('tp-mode-move').click();
    await page.getByTestId('tp-two-points').click();
    const typeAt = async (x: string, y: string, z: string) => {
      await page.getByTestId('placement-x').fill(x);
      await page.getByTestId('placement-y').fill(y);
      await page.getByTestId('placement-z').fill(z);
      await page.getByTestId('placement-x').press('Enter');
    };
    await typeAt('0', '0', '0');
    await expect(page.getByTestId('placement-hud')).toBeVisible();
    await typeAt('0', '0', '1');
    await expect(page.getByTestId('placement-hud')).toBeHidden();
    // Moved in place: nothing added.
    expect(await census()).toEqual(before);

    await page.getByTestId('pr-cmd-groups').click();
    await page.getByTestId('gp-name').fill('Uno');
    await page.getByTestId('gp-create').click();
    await page.locator('[data-testid^="gp-place-"]').first().click();
    await typeAt('60', '0', '0');
    await expect(page.getByTestId('placement-hud')).toBeHidden();
    expect((await census()).elements).toBe(before.elements + 1);
  });
});
