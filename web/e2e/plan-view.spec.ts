import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1400, height: 900 } });

async function enterPlan(page: import('@playwright/test').Page) {
  await loadModel(page, 'rc-design-qa-8');
  await page.getByTestId('cam-menu').click();
  await page.getByTestId('nav-plan-view').click();
  await expect(page.getByTestId('plan-view-chip')).toBeVisible();
  await page.locator('.cam-backdrop').click({ position: { x: 420, y: 460 } });
  await expect(page.getByTestId('cam-menu-pop')).toHaveCount(0);
}

const census = (page: import('@playwright/test').Page) => page.evaluate(() => window.__stabileo.planCutCensus());

test.describe('@smoke the plan view', () => {
  test('looks straight down, stays orthographic and turns by quarters', async ({ pro: page }) => {
    await enterPlan(page);
    await page.getByTestId('cam-menu').click();
    await expect(page.getByTestId('cam-projection-perspective')).toBeDisabled();
    await expect(page.getByTestId('cam-projection-orthographic')).toHaveAttribute('aria-checked', 'true');
    const plan = (await page.evaluate(() => window.__stabileo.cameraState()))!;
    expect(plan.polarDeg).toBeLessThan(0.001);

    await page.locator('.cam-backdrop').click({ position: { x: 420, y: 460 } });
    await page.getByTestId('plan-view-rotate-right').click();
    const turned = (await page.evaluate(() => window.__stabileo.cameraState()))!;
    expect(turned.polarDeg).toBeLessThan(0.001);
    const off = [turned.pos[0] - turned.target[0], turned.pos[1] - turned.target[1]];
    expect(off[0], 'the camera leans to +X, so −X reads up').toBeGreaterThan(0);
    expect(Math.abs(off[1])).toBeLessThan(Math.abs(off[0]) * 1e-6);
    expect(turned.target[0]).toBeCloseTo(plan.target[0], 6);
    expect(turned.target[1]).toBeCloseTo(plan.target[1], 6);

    await page.getByTestId('plan-view-exit').click();
    const left = (await page.evaluate(() => window.__stabileo.cameraState()))!;
    expect(left.polarDeg, 'tipped off the pole again, so an orbit does not spin').toBeGreaterThan(0.5);
  });

  test('fits its controls in one row and steps the cut by 5 cm', async ({ pro: page }) => {
    await enterPlan(page);
    const chip = page.getByTestId('plan-view-chip');
    const [height, tallest] = await chip.evaluate((el) => [el.getBoundingClientRect().height, Math.max(...[...el.children].map((c) => c.getBoundingClientRect().height))]);
    expect(height, 'one row').toBeLessThan(tallest * 1.8);
    await expect(page.getByTestId('plan-view-cut')).toHaveValue('0.15');
    await page.getByTestId('plan-view-cut-up').click();
    await expect(page.getByTestId('plan-view-cut')).toHaveValue('0.20');
    await page.getByTestId('plan-view-cut').focus();
    await page.keyboard.press('Shift+ArrowUp');
    await expect(page.getByTestId('plan-view-cut')).toHaveValue('0.70');
    await page.getByTestId('plan-view-cut-down').click();
    await expect(page.getByTestId('plan-view-cut')).toHaveValue('0.65');
  });

  test('without levels offers to define them, and with them picks the storey by name and heights', async ({ pro: page }) => {
    await enterPlan(page);
    await expect(page.getByTestId('plan-view-level')).toHaveCount(0);
    await page.getByTestId('plan-view-define-levels').click();
    await expect(page.getByTestId('grid-heights')).toBeFocused();
    await page.getByTestId('grid-heights').fill('3.2');
    await page.getByTestId('grid-generate-levels').click();
    const level = page.getByTestId('plan-view-level');
    await expect(page.getByTestId('plan-view-define-levels')).toHaveCount(0);
    await expect(level.locator('option:checked')).toContainText('(+0.00 → +3.20 m)');
    await expect(page.getByTestId('plan-view-cut'), 'the storey up to its ceiling').toHaveValue('3.20');
    await level.selectOption({ index: 0 });
    await expect(level.locator('option:checked')).toContainText('(+3.20 m)');
    await expect(page.getByTestId('plan-view-cut'), 'the top level has no ceiling').toHaveValue('0.15');
  });

  test('hides what lies under the level, or shows it faded; the cut moves without hiding the level', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-heights').fill('3.2');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('cam-menu').click();
    await page.getByTestId('nav-plan-view').click();
    await page.locator('.cam-backdrop').click({ position: { x: 420, y: 460 } });
    await expect.poll(async () => (await census(page)).hidden).toBe(0);
    expect((await census(page)).supports, 'the supports go while what is below is hidden').toBeGreaterThan(0);
    await page.getByTestId('plan-view-up').click();
    await expect(page.getByTestId('plan-view-below')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => { const c = await census(page); return c.hidden + c.supports; }).toBeGreaterThan(0);
    const atLevel = (await census(page)).hidden;
    await page.getByTestId('plan-view-cut').fill('1,5');
    await page.getByTestId('plan-view-cut').press('Enter');
    await expect(page.getByTestId('plan-view-cut')).toHaveValue('1.50');
    expect((await census(page)).hidden, 'a higher cut hides nothing more').toBe(atLevel);
    const gone = await census(page);
    await page.getByTestId('plan-view-below').click();
    await expect(page.getByTestId('plan-view-below')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await census(page)).ghost, 'what was hidden, the supports under the floor too, comes back faded').toBe(gone.hidden + gone.supports);
    expect((await census(page)).hidden).toBe(0);
    expect((await census(page)).supports, 'and come back with it').toBe(0);
    await page.getByTestId('plan-view-exit').click();
    await expect.poll(async () => census(page)).toEqual({ hidden: 0, ghost: 0, overhead: 0, supports: 0 });
  });
});
