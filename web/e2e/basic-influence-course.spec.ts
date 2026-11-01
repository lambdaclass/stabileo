import { test, expect } from './fixtures';

const SHOTS = process.env.IL_SHOTS;

/**
 * Influence lines and envelopes from Basic's Advanced panel: a section at x = 0 on a support, its
 * rotation line, the line loaded for its extremes, the envelope along the members, the explained
 * document, and the load cases and envelopes entry.
 */
test.describe('@slow influence lines and envelopes in Basic', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('liveCalc', 'false');
      localStorage.setItem('stabileo-basic-panel-width', '290');
    });
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('continuous-beam'));
  });

  test('a section at x = 0 on a support, its rotation line, the loaded line and the envelopes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByTestId('rb-cmd-advanced').click();
    await page.locator('button.adv-btn', { hasText: /^Influence line$/ }).click();
    await expect(page.getByTestId('il-panel')).toBeVisible();

    await page.getByTestId('il-q-M').click();
    const near = await page.evaluate(() => {
      const h = window.__stabileo as unknown as { elementEnds(id: number): { i: number; j: number } | null; nodeScreenPos(id: number): { x: number; y: number } | null };
      const e = h.elementEnds(1)!;
      const a = h.nodeScreenPos(e.i)!, b = h.nodeScreenPos(e.j)!;
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      return { x: a.x + ((b.x - a.x) / l) * 4, y: a.y + ((b.y - a.y) / l) * 4 };
    });
    await page.mouse.click(near.x, near.y);
    await expect(page.getByTestId('il-end-note')).toBeVisible();
    await expect(page.getByTestId('il-x0')).toHaveClass(/on/);
    await expect(page.getByTestId('il-support-reaction')).toBeVisible();

    await page.getByTestId('il-q-ry').click();
    await expect(page.getByTestId('il-what')).toContainText('Rotation θ');
    await expect(page.getByTestId('il-peaks')).toContainText('rad/kN');
    const ordinates = await page.evaluate(() => (window.__stabileo as unknown as { influenceLine?(): { quantity: string; targetPosition?: number } | null }).influenceLine?.() ?? null);
    if (ordinates) expect(ordinates).toMatchObject({ quantity: 'ry', targetPosition: 0 });

    await page.getByTestId('il-x').fill('20');
    await page.getByTestId('il-x').press('Enter');
    await expect(page.getByTestId('il-x-error')).toBeVisible();

    await page.getByTestId('il-q-M').click();
    await page.getByTestId('il-panel').getByRole('button', { name: 'L/2' }).click();
    await expect(page.getByTestId('il-x')).toHaveValue(/\d/);
    await page.getByTestId('il-loading').locator('summary').click();
    await expect(page.getByTestId('il-max')).toContainText('kN·m');
    await expect(page.getByTestId('il-max').locator('.ill-check')).toHaveClass(/ok/);
    await page.getByTestId('il-envelope').click();
    await expect(page.getByTestId('il-envelope')).toHaveClass(/on/);
    if (SHOTS) await page.getByTestId('basic-panel').screenshot({ path: `${SHOTS}/il-panel.png` });

    await page.getByTestId('il-explain').click();
    await expect(page.getByTestId('steps-doc')).toBeVisible();
    await expect(page.getByTestId('steps-doc')).toContainText('Influence line');
    if (SHOTS) await page.getByTestId('basic-panel').screenshot({ path: `${SHOTS}/il-doc.png` });
    await page.getByTestId('steps-back').click();
    await expect(page.getByTestId('il-panel')).toBeVisible();

    await page.getByTestId('adv-close').click();
    await page.getByTestId('adv-load-states').click();
    await expect(page.getByTestId('load-states-panel')).toBeVisible();
    const enable = page.getByTestId('load-states-enable');
    if (await enable.isVisible()) await enable.click();
    await expect(page.getByTestId('load-states-table')).toBeVisible();
    await page.getByTestId('load-states-table').locator('summary').click();
    if (SHOTS) await page.getByTestId('basic-panel').screenshot({ path: `${SHOTS}/load-states.png` });
    await page.getByTestId('load-states-il').click();
    await expect(page.getByTestId('il-panel')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
