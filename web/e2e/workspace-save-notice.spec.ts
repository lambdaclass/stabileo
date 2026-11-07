import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';

for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }]] as const) {
  test.describe(label, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test(`@smoke on a ${label} a refused workspace save shows a notice that fits and saves the session to a file`, async ({ page }) => {
      await page.addInitScript(() => {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
          if (key === 'stabileo-workspace') throw new DOMException('quota', 'QuotaExceededError');
          return setItem.call(this, key, value);
        };
      });
      await page.clock.install();
      await page.goto('/app/basic?e2e=1');
      await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 30_000 });
      await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));

      const notice = page.getByTestId('workspace-save-notice');
      await expect(notice).toHaveCount(0);
      await page.clock.fastForward(31_000);
      await expect(notice).toBeVisible();
      await expect(notice).toHaveAttribute('role', 'alert');

      const layout = await notice.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const p = el.querySelector('p')!;
        const button = el.querySelector('button')!.getBoundingClientRect();
        return {
          left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          textClipped: p.scrollWidth > p.clientWidth + 1,
          fontSize: parseFloat(getComputedStyle(p).fontSize),
          buttonHeight: button.height,
          buttonInside: button.left >= r.left && button.right <= r.right && button.bottom <= r.bottom,
        };
      });
      await page.screenshot({ path: test.info().outputPath(`${label}.png`) });
      expect(layout.left).toBeGreaterThanOrEqual(16 - 0.5);
      expect(layout.right).toBeLessThanOrEqual(viewport.width - 16 + 0.5);
      expect(layout.top).toBeGreaterThanOrEqual(0);
      expect(layout.bottom, 'the notice leaves most of the screen to the model').toBeLessThan(viewport.height / 3);
      expect(layout.pageOverflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);
      expect(layout.textClipped).toBe(false);
      expect(layout.fontSize).toBeGreaterThanOrEqual(12);
      expect(layout.buttonHeight).toBeGreaterThanOrEqual(44);
      expect(layout.buttonInside).toBe(true);

      const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('workspace-save-session').tap()]);
      const session = JSON.parse(readFileSync((await download.path())!, 'utf8'));
      expect(session.type).toBe('session');
      expect(session.tabs[0].modelSnapshot.nodes.length).toBeGreaterThan(0);
      await expect(notice, 'still not autosaved: still shown').toBeVisible();
    });
  });
}
