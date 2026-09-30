/**
 * Cmd/Ctrl+C copies the text selected on the page. Basic took the keys for
 * the model's own clipboard unconditionally, so text could only be copied
 * from the context menu.
 */
import { test, expect } from './fixtures';

test.describe('@smoke copying text', () => {
  test('selected text reaches the clipboard with the keyboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.evaluate(() => navigator.clipboard.writeText('nothing'));
    const picked = await page.evaluate(() => {
      const el = document.querySelector('[data-testid=model-state]') ?? document.querySelector('.rb-label, button');
      const range = document.createRange();
      range.selectNodeContents(el!);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      return sel.toString().replace(/\s+/g, ' ').trim().toLowerCase();
    });
    expect(picked.length).toBeGreaterThan(0);
    // (Compared in lower case: CSS may upper-case what is shown, not what is copied.)
    await page.keyboard.press('ControlOrMeta+c');
    await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\s+/g, ' ').trim().toLowerCase())).toBe(picked);
  });
});
