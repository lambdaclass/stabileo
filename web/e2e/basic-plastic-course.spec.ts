/**
 * Plastic collapse as the course works it: run the collapse, read a step and
 * the λ–δ diagram, see the collapse mechanism, then place the hinges of the
 * sway mechanism on the canvas and get its λ and the admissibility verdict.
 */
import { test, expect, type Page } from './fixtures';

const SHOTS = process.env.PLASTIC_SHOTS;

/** A tap at fraction t of the way from node a to node b. */
async function tapAt(page: Page, a: number, b: number, t: number) {
  const [p, q] = await page.evaluate(([i, j]) => [window.__stabileo.nodeScreenPos(i), window.__stabileo.nodeScreenPos(j)], [a, b]);
  await page.mouse.click(p!.x + (q!.x - p!.x) * t, p!.y + (q!.y - p!.y) * t);
}

test.describe('@slow plastic collapse, explained', () => {
  test('collapse, λ–δ, mechanism and a sway mechanism chosen by hand', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('rb-cmd-advanced').click();
    await page.locator('button.adv-btn', { hasText: /Plastic collapse|Colapso plástico|Colapso plástico/ }).click();
    await expect(page.getByTestId('plastic-verdict')).toContainText('71.296');

    const trace = page.getByTestId('plastic-trace');
    await trace.locator('summary').click();
    await expect(page.getByTestId('plastic-trace-formula').first()).toContainText('Δλ');

    const curve = page.getByTestId('plastic-curve');
    await curve.locator('summary').click();
    await expect(page.getByTestId('plastic-curve-chart')).toBeVisible();
    await expect(page.getByTestId('plastic-curve-chart').locator('circle.pt')).toHaveCount(await page.getByTestId('plastic-step').textContent().then((s) => Number(s!.split('/')[1]) + 1));
    const download = page.waitForEvent('download');
    await page.getByTestId('plastic-curve-csv').click();
    expect((await download).suggestedFilename()).toBe('lambda-curve.csv');
    if (SHOTS) await page.getByTestId('adv-running').locator('xpath=..').screenshot({ path: `${SHOTS}/panel-steps-curve.png` });

    const mech = page.getByTestId('plastic-mechanism');
    await mech.locator('summary').click();
    await page.getByTestId('plastic-mechanism-draw').click();
    await expect(page.getByTestId('plastic-mechanism-vw')).toContainText('71.296');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/mechanism.png` });

    const user = page.getByTestId('plastic-user');
    await user.locator('summary').click();
    await page.getByTestId('plastic-user-pick').click();
    for (const [a, b, t] of [[1, 2, 0.05], [1, 2, 0.95], [4, 3, 0.05], [4, 3, 0.95]]) await tapAt(page, a, b, t);
    await expect(page.getByTestId('plastic-user-hinges').locator('li')).toHaveCount(4);
    await expect(page.getByTestId('plastic-user-lambda')).toContainText('168.750');
    const verdict = page.getByTestId('plastic-user-admissible');
    await expect(verdict).toContainText(/Mp/);
    await expect(page.getByTestId('plastic-user-verdict')).toContainText(/upper bound|cota superior|limite superior/);
    await page.getByTestId('plastic-user-show-moments').click();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/user-mechanism.png` });

    // Two hinges are not a mechanism, and it says so.
    await tapAt(page, 4, 3, 0.05);
    await tapAt(page, 4, 3, 0.95);
    await expect(page.getByTestId('plastic-user-verdict')).toContainText(/GH \+ 1 = 4/);
    expect(errors).toEqual([]);
  });
});
