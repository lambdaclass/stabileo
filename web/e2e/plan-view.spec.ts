import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1400, height: 900 } });

async function enterPlan(page: import('@playwright/test').Page) {
  await loadModel(page, 'rc-design-qa-8');
  await page.getByTestId('cam-menu').click();
  await page.getByTestId('nav-plan-view').click();
  await expect(page.getByTestId('plan-view-chip')).toBeVisible();
}

const census = (page: import('@playwright/test').Page) => page.evaluate(() => window.__stabileo.planCutCensus());

test.describe('@smoke the plan view', () => {
  test('looks straight down, stays orthographic and turns by quarters', async ({ pro: page }) => {
    await enterPlan(page);
    await expect(page.getByTestId('cam-projection-perspective')).toBeDisabled();
    await expect(page.getByTestId('cam-projection-orthographic')).toHaveAttribute('aria-checked', 'true');
    const plan = (await page.evaluate(() => window.__stabileo.cameraState()))!;
    expect(plan.polarDeg).toBeLessThan(0.001);

    await page.mouse.click(30, 870);
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

  test('hides what lies under the level, or shows it faded', async ({ pro: page }) => {
    await enterPlan(page);
    await page.mouse.click(30, 870);
    const cut = page.getByTestId('plan-view-cut');
    await cut.evaluate((el: HTMLInputElement) => {
      el.value = String(Number(el.max) - 0.4);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.getByTestId('plan-view-below')).toHaveValue('hidden');
    await expect.poll(async () => (await census(page)).hidden).toBeGreaterThan(0);
    const hidden = (await census(page)).hidden;
    await page.getByTestId('plan-view-below').selectOption('ghost');
    await expect.poll(async () => (await census(page)).ghost).toBe(hidden);
    expect((await census(page)).hidden).toBe(0);
    await page.getByTestId('plan-view-exit').click();
    await expect.poll(async () => census(page)).toEqual({ hidden: 0, ghost: 0 });
  });
});
