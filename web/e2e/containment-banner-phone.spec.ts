/**
 * The containment notice on a phone: one line over the top of the model, its full text a tap
 * away, and never between the user and the member they tap.
 */
import { test, expect } from './fixtures';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('@smoke on a phone the second-order notice is one line, opens on a tap, and leaves the beam to tap', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 60_000 }).toBe(true);
  await page.getByTestId('rb-cmd-solve').tap();
  const notice = page.getByTestId('containment-notice');
  await expect(notice).toContainText('#1551', { timeout: 30_000 });
  await page.evaluate(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')));
  const toggle = page.getByTestId('containment-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await notice.boundingBox())!.height).toBeLessThan(56);

  const beam = await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    const h = window.__stabileo as unknown as { elementIds(): number[]; elementEnds(id: number): { i: number; j: number } | null; nodeScreenPos(id: number): { x: number; y: number } | null };
    let best: { x: number; y: number } | null = null, len = -1;
    for (const id of h.elementIds()) {
      const e = h.elementEnds(id)!, a = h.nodeScreenPos(e.i)!, b = h.nodeScreenPos(e.j)!;
      const l = Math.hypot(a.x - b.x, a.y - b.y);
      if (l > len) { len = l; best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    }
    return best!;
  });
  const box = (await notice.boundingBox())!;
  await page.screenshot({ path: test.info().outputPath('collapsed.png') });
  expect(beam.y < box.y || beam.y > box.y + box.height || beam.x < box.x || beam.x > box.x + box.width, `the beam at ${JSON.stringify(beam)} is under the notice ${JSON.stringify(box)}`).toBe(true);

  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect((await notice.boundingBox())!.height).toBeGreaterThan(56);
  await expect(notice.locator('p').first()).toBeVisible();
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
