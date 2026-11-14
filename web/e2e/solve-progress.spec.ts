import { test, expect } from './fixtures';

/**
 * Pressing Solve says what it is doing: a card at the viewer's foot follows the solve step by step,
 * counts the load cases as they finish, and once it ends says how it went, with the way to the
 * diagnostics when it left any, until Done closes it.
 */
test.describe('@smoke solve progress', () => {
  test('a PRO solve with combinations goes through its steps and ends with Done', async ({ pro: page }) => {
    await page.evaluate(() => window.__stabileoActions.loadExample('rc-design-qa-8'));
    await page.waitForFunction(() => window.__stabileo.solverReady(), null, { timeout: 60_000 });
    await page.evaluate(() => {
      const w = window as unknown as { phases: string[] };
      w.phases = [];
      new MutationObserver(() => {
        const ph = document.querySelector('[data-testid="solve-progress"]')?.getAttribute('data-phase');
        if (ph && w.phases[w.phases.length - 1] !== ph) w.phases.push(ph);
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-phase'] });
    });
    await page.evaluate(() => window.__stabileoActions.solve());
    const card = page.getByTestId('solve-progress');
    await expect(card).toHaveAttribute('data-phase', 'done');
    const phases = await page.evaluate(() => (window as unknown as { phases: string[] }).phases);
    expect(phases).toContain('cases');
    expect(phases[phases.length - 1]).toBe('done');
    await card.getByTestId('solve-progress-done').click();
    await expect(card).toHaveCount(0);
  });

  test('a solve that cannot finish says why on the card', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
    await page.goto('/app/basic?e2e=1');
    await page.evaluate(() => window.__stabileoActions.loadExample('hidden-mechanism'));
    await page.waitForFunction(() => window.__stabileo.solverReady(), null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.solve());
    const card = page.getByTestId('solve-progress');
    await expect(card).toHaveAttribute('data-phase', 'failed');
    await expect(card.getByTestId('solve-progress-error')).not.toBeEmpty();
    await card.getByTestId('solve-progress-done').click();
    await expect(card).toHaveCount(0);
  });
});
