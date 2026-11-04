/**
 * Navigating a building from above (QA of 19-oct and 20-oct): the plan view looks at the working
 * level from overhead and takes the Pan tool, so a drag slides over it without turning the view;
 * the storeys above are cut away by the plan's own cut, and the menu's cut plane stays off; a
 * level taken on the plan's chip moves the view with it; W and S move the plan view as A and D
 * do; a right drag does not open the menu.
 */
import { test, expect, placeFrameFromGrid } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1400, height: 900 } });

const cam = (page: Page) => page.evaluate(() => window.__stabileo.cameraState()!);
async function drag(page: Page, button: 'left' | 'right', dx: number, dy: number) {
  const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
  const x = box.x + box.width * 0.62, y = box.y + box.height * 0.55;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await page.mouse.up({ button });
  await settle(page);
}
/** Until the camera stops: the orbit eases out (damping) for a while after the release. */
async function settle(page: Page) {
  let prev = JSON.stringify(await cam(page));
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const now = JSON.stringify(await cam(page));
    if (now === prev) return;
    prev = now;
  }
}

test.describe('@slow plan navigation', () => {
  test('plan view, sliding drag, level follow, keyboard and right drag', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-bays-x').fill('6; 6');
    await page.getByTestId('grid-generate-x').click();
    await page.getByTestId('grid-bays-y').fill('5; 5');
    await page.getByTestId('grid-generate-y').click();
    await page.getByTestId('grid-heights').fill('3; 3; 3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('grid-open-building').click();
    await placeFrameFromGrid(page);
    await page.getByTestId('pr-cmd-grid').click();
    // Listed from the top level down.
    const levels = page.locator('[data-testid^="grid-activate-"]');
    await expect(levels.first()).toBeVisible();
    await levels.nth(2).check(); // the first floor up

    // The plan view, from the view menu: overhead, on the working level, said on the view.
    await page.getByTestId('cam-menu').click();
    await page.getByTestId('nav-plan-view').click();
    await page.locator('.cam-backdrop').click({ position: { x: 200, y: 450 } }); // closes it: the state items keep it open
    await expect(page.getByTestId('plan-view-chip')).toContainText(/N1/);
    await expect.poll(async () => (await cam(page)).polarDeg).toBeLessThan(2);
    // Its cut is its own: the cut plane of the menu stays off, and its controls do not show.
    await expect(page.locator('.clip-controls')).toHaveCount(0);
    await expect(page.getByTestId('plan-view-cut')).toBeVisible();
    const c0 = await cam(page);

    // Entering it took the Pan tool: a left drag slides over the floor and does not turn the view.
    await expect(page.getByTestId('pointer-mode')).toHaveAttribute('aria-pressed', 'true');
    await drag(page, 'left', 160, 0);
    const c1 = await cam(page);
    expect(Math.hypot(c1.target[0] - c0.target[0], c1.target[1] - c0.target[1])).toBeGreaterThan(0.5);
    expect(c1.polarDeg).toBeLessThan(2);
    expect(c1.target[2]).toBeCloseTo(c0.target[2], 3);

    // A right drag pans too, and opens no menu.
    await drag(page, 'right', 0, 120);
    await expect(page.locator('.ctx-menu')).toHaveCount(0);

    // Another level, from the plan's chip: the view goes up with it.
    await page.getByTestId('plan-view-level').selectOption({ label: await levels.nth(0).getAttribute('data-testid').then((x) => x!.replace('grid-activate-', '')) });
    await expect.poll(async () => (await cam(page)).target[2]).toBeGreaterThan(c1.target[2] + 1);
    await expect(page.getByTestId('plan-view-chip')).not.toContainText(/N1\b/);

    // W moves the plan view as far as D does (laid flat from above, its direction had shrunk to
    // about 2 % of D's).
    await page.locator('canvas:not(.axis-gizmo)').first().hover();
    // The level picker kept the focus, and keys typed into a field do not move the view.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(600); // the level change settles
    const press = async (key: string) => {
      const a = await cam(page);
      await page.keyboard.down(key); await page.waitForTimeout(500); await page.keyboard.up(key);
      await page.waitForTimeout(300);
      const b = await cam(page);
      return Math.hypot(b.target[0] - a.target[0], b.target[1] - a.target[1]);
    };
    const byW = await press('w'), byD = await press('d');
    expect(byD).toBeGreaterThan(0);
    expect(byW / byD).toBeGreaterThan(0.4);

    // Leaving it, from the chip: the tool held before it comes back; with Pan a left drag orbits
    // again, and the menu has no «drag slides» item.
    await page.getByTestId('plan-view-exit').click();
    await expect(page.getByTestId('plan-view-chip')).toHaveCount(0);
    await expect(page.getByTestId('pointer-mode')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('pointer-mode').click();
    const o0 = await cam(page);
    await drag(page, 'left', 0, -140);
    expect(Math.abs((await cam(page)).polarDeg - o0.polarDeg)).toBeGreaterThan(3);
    await page.getByTestId('cam-menu').click();
    await expect(page.getByTestId('nav-drag-mode')).toHaveCount(0);
  });
});
