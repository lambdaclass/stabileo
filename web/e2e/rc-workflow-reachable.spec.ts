/**
 * An enabled command must be reachable by a real pointer.
 *
 * ── The defect this pins ────────────────────────────────────────────
 *
 * `.rc-workflow` was a flex column at `height: 100%` with `overflow: hidden`, and each of its
 * disclosures may claim up to 55vh or 70vh when open. Two open therefore exceed the viewport,
 * and with the overflow hidden and no scroll path everything past 100% became UNREACHABLE.
 *
 * That is not a cosmetic problem. Measured with the disclosures open at 1280×720, the Generate
 * detailing button reported a bounding box at y = 874 — outside the viewport — and
 * `document.elementFromPoint` at its centre returned null. Playwright still called it visible
 * and enabled, so `click()` dispatched at coordinates where no element exists and NOTHING
 * happened: no run, no revision change, no error. A programmatic `.click()`, which bypasses
 * hit-testing, worked. A real user in that state clicks and the app silently does nothing.
 *
 * ── Which of these two tests actually discriminates ─────────────────
 *
 * Stated plainly, because it would be easy to over-claim:
 *
 *   RW2 is the discriminating test. It pins the INVARIANT — the column's computed `overflow-y`
 *   must be scrollable — and it fails against the unfixed stylesheet on both branches. That is
 *   the property whose absence made the control unreachable.
 *
 *   RW1 is a forward guard, not a reproduction of this defect. The failure depended on a
 *   specific geometry: with only the detailing disclosure open, the command landed in a dead
 *   band just past the clip. With every disclosure open — what RW1 sets up — Playwright's
 *   click can still reach the control by scrolling the disclosure's own inner scroller, so RW1
 *   passes with and without the fix at that viewport. It is kept because it asserts the thing
 *   that matters behaviourally and will catch a future layout change that breaks reachability
 *   more broadly.
 *
 * The faithful reproductions of THIS defect are the four inherited journeys it broke — D2c,
 * D19 and both document-supersession journeys — which are already in the suite and which the
 * fix restores.
 *
 * Neither test asserts "the button is visible": that assertion was true throughout the defect,
 * which is precisely why it caught nothing.
 */

import { test, expect, designAll, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

type Json = Record<string, unknown>;

/** `detailingAssemblies()` reads `modelStore.model.detailing` — the persisted list. */
function persisted(page: Page): Promise<Json[]> {
  return page.evaluate(() =>
    (window.__stabileo as unknown as { detailingAssemblies(): Json[] }).detailingAssemblies());
}

async function maxRevision(page: Page): Promise<number> {
  const list = await persisted(page);
  return list.length === 0 ? 0 : Math.max(...list.map((a) => Number(a.detailingRevision)));
}

/** Open every sibling disclosure the RC tab offers on this branch. */
async function openEveryDisclosure(page: Page): Promise<string[]> {
  const opened: string[] = [];
  for (const id of ['code-settings-disclosure', 'detailing-disclosure',
    'floor-families-disclosure', 'seismic-disclosure']) {
    const d = page.getByTestId(id);
    // The seismic disclosure exists only once PR19 is in the tree; this spec is meaningful on
    // either branch and must not depend on the count.
    if (await d.count() === 0) continue;
    if (await d.evaluate((el) => !(el as HTMLDetailsElement).open)) {
      await d.locator('> summary').click();
    }
    await expect(d).toHaveJSProperty('open', true);
    opened.push(id);
  }
  return opened;
}

test.describe('@smoke the RC command surface stays reachable', () => {
  test('RW1 — with every disclosure open, a REAL click on Regenerate still runs it',
    async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      await designAll(page);

      const opened = await openEveryDisclosure(page);
      // At least the three PR18 disclosures; four once seismic is present. Two open already
      // exceed the viewport, which is the condition under test.
      expect(opened.length, `opened: ${opened.join(', ')}`).toBeGreaterThanOrEqual(3);

      const button = page.getByTestId('cmd-generate-detailing');
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();

      /*
       * The assertion is BEHAVIOURAL, and deliberately not "is it visible".
       *
       * "Visible and enabled" was true throughout the defect — that is the assertion that
       * passed while a user could not click the thing. Nor is the position asserted: a command
       * below the fold is not a defect, it is a long panel.
       *
       * What was false is that clicking DID something. Playwright's `click()` scrolls the
       * target into view and dispatches a real pointer event; when the layout leaves the
       * control outside every scrollable rect, that event lands on empty space and the
       * command silently no-ops — no run, no revision, no error. So the assertion is that the
       * PERSISTED revision advances, which only happens if the command actually ran.
       */
      const before = await maxRevision(page);
      expect(before, 'design must already have produced detailing').toBeGreaterThan(0);
      await button.click();
      await expect.poll(() => maxRevision(page), { timeout: 30_000 })
        .toBeGreaterThan(before);

      // And the control is genuinely under the pointer once scrolled to, rather than merely
      // having a box somewhere. `elementFromPoint` is the ground truth for hit-testing.
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      expect(box, 'the command must have a layout box').not.toBeNull();
      const receiver = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
      }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
      expect(receiver,
        'a real pointer event at the command centre must reach the command, not empty space')
        .toBe('cmd-generate-detailing');
    });

  test('RW2 — the workflow column can be scrolled to whatever it cannot fit',
    async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      await designAll(page);
      await openEveryDisclosure(page);

      // The invariant behind RW1: content that overflows the column must be reachable by
      // scrolling rather than clipped away. A container that cannot scroll and hides its
      // overflow is how an enabled control ends up outside every pointer's reach.
      const scrollable = await page.evaluate(() => {
        const col = document.querySelector('.rc-workflow');
        if (!col) return null;
        const style = getComputedStyle(col);
        return {
          overflowY: style.overflowY,
          canScroll: col.scrollHeight > col.clientHeight,
          reachable: style.overflowY === 'auto' || style.overflowY === 'scroll',
        };
      });
      expect(scrollable, 'the RC workflow column must exist').not.toBeNull();
      expect(scrollable!.reachable,
        `overflow-y is "${scrollable!.overflowY}"; overflowing commands would be unreachable`)
        .toBe(true);
    });
});
