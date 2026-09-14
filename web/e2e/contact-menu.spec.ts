/**
 * The editor's contact menu — the header's, not the landing's.
 *
 * The landing's corner panel is covered in `landing.spec.ts`. This is the
 * same five channels offered from inside the application, and it is here for
 * the two things that are specific to being in the header:
 *
 *   1. it is BETWEEN the assistant and Settings. That is the request and it is
 *      also the argument — the corner holds the controls that act on the
 *      application rather than on the model — and nothing else would notice if
 *      a later edit dropped it somewhere else in the row.
 *
 *   2. the row still fits on a phone. It did not, the first time: at 390px the
 *      header was already exactly as wide as the window, so adding a button
 *      pushed Settings off the right edge — present in the DOM, focusable, and
 *      untouchable. That is invisible on a laptop and total on a phone.
 *
 * One test, deliberately: this suite runs every spec through a single browser
 * and has wedged before on the last few tests of a long run, so a new file
 * pays for itself once, not three times.
 */
import { test, expect } from '@playwright/test';

test('@smoke the header offers a way to reach us, and still fits a phone', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await expect(page.getByTestId('contact-open')).toBeVisible();

  // Between the assistant and Settings, in that order.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('.header-actions > *')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => e.className.split(' ')[0])
  );
  expect(order.indexOf('contact-anchor')).toBe(order.indexOf('btn-ai') + 1);
  expect(order.indexOf('contact-anchor')).toBeLessThan(order.length - 1);

  await page.getByTestId('contact-open').click();
  const rows = page.locator('[data-testid="contact-menu"] li');
  await expect(rows).toHaveCount(5);
  // Every row says which languages that account answers in — the whole point
  // of listing them rather than linking one.
  for (const text of await rows.allTextContents()) {
    expect(text.trim(), text).toMatch(/\b(EN|ES|PT)(\/(EN|ES|PT))*$/);
  }
  // It closes without reloading anything.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="contact-menu"]')).toHaveCount(0);

  // And on a phone every control in the row is still on screen. Waiting for
  // the phone's own mode selector rather than for a duration: the header
  // swaps layout on a resize, and measuring before it has is measuring the
  // desktop row at a phone's width.
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.locator('.mode-select-mobile')).toBeVisible();
  const edges = await page.evaluate(() =>
    [...document.querySelectorAll('.header-actions > *')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => Math.round(r.right))
  );
  for (const right of edges) expect(right, `a header control ends at ${right}px of 360`).toBeLessThanOrEqual(360);
});
