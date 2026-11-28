import { BUILD_FEATURES } from './build-features';
import { test, expect } from './fixtures';
if (BUILD_FEATURES.proPlatesUnified) {

  /**
   * Pressing Solve says what it is doing: a card at the viewer's foot follows the solve step by step,
   * counts the load cases as they finish, and once it ends says how it went, with the way to the
   * diagnostics when it left any, until Done closes it.
   */
  test.describe('@smoke solve progress', () => {
    test('a PRO solve with combinations goes through its steps and ends with Done', async ({ pro: page }) => {
      await page.evaluate(() => window.__stabileoActions.loadExample('rc-design-qa-8'));
      await page.waitForFunction(() => window.__stabileo.solverReady());
      await page.evaluate(() => {
        const w = window as unknown as { phases: string[]; unnamed: number; live: string[] };
        w.phases = [];
        w.unnamed = 0;
        w.live = [];
        new MutationObserver(() => {
          const card = document.querySelector('[data-testid="solve-progress"]');
          const ph = card?.getAttribute('data-phase');
          if (ph && w.phases[w.phases.length - 1] !== ph) w.phases.push(ph);
          w.unnamed += card?.querySelectorAll('progress:not([aria-label])').length ?? 0;
          if (card) {
            const spoken = [...card.querySelectorAll('*')].filter((el) => !el.closest('[aria-hidden="true"]') && el.childElementCount === 0).map((el) => el.textContent).join('|');
            if (w.live[w.live.length - 1] !== spoken) w.live.push(spoken);
          }
        }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-phase', 'value'] });
      });
      await page.evaluate(() => window.__stabileoActions.solve());
      const card = page.getByTestId('solve-progress');
      await expect(card).toHaveAttribute('data-phase', 'done');
      const seen = await page.evaluate(() => { const w = window as unknown as { phases: string[]; unnamed: number; live: string[] }; return { phases: w.phases, unnamed: w.unnamed, live: w.live }; });
      expect(seen.phases).toContain('cases');
      expect(seen.phases[seen.phases.length - 1]).toBe('done');
      expect(seen.unnamed, 'every progress bar has a name').toBe(0);
      expect(seen.live.every((text) => !/\d+[.,]\d s/.test(text)), 'the elapsed time is not read out').toBe(true);
      await expect(card.getByTestId('solve-progress-elapsed')).toHaveAttribute('aria-hidden', 'true');
      await card.getByTestId('solve-progress-done').click();
      await expect(card).toHaveCount(0);
    });

    test('Basic counts its notices in the singular or plural and sends the reader to the results table', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
      await page.goto('/app/basic?e2e=1');
      await page.evaluate(() => window.__stabileoActions.loadExample('portal-second-order'));
      await page.waitForFunction(() => window.__stabileo.solverReady());
      await page.evaluate(() => window.__stabileoActions.solve());
      const card = page.getByTestId('solve-progress');
      await expect(card).toHaveAttribute('data-phase', 'done');
      const count = card.getByTestId('solve-progress-warnings');
      await expect(count).toHaveText(/^(1 notice|(?!1 )\d+ notices) to review in the results table$/);
      await expect(card.getByTestId('solve-progress-diagnostics')).toHaveCount(0);
    });

    test('a solve that cannot finish says why on the card', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
      await page.goto('/app/basic?e2e=1');
      await page.evaluate(() => window.__stabileoActions.loadExample('hidden-mechanism'));
      await page.waitForFunction(() => window.__stabileo.solverReady());
      await page.evaluate(() => window.__stabileoActions.solve());
      const card = page.getByTestId('solve-progress');
      await expect(card).toHaveAttribute('data-phase', 'failed');
      await expect(card.getByTestId('solve-progress-error')).not.toBeEmpty();
      await card.getByTestId('solve-progress-done').click();
      await expect(card).toHaveCount(0);
    });
  });
}
