/**
 * The viewer's two standing notices, on a building that actually has both — F6 §6.
 *
 * `viewer-notices.test.ts` proves the fold's bookkeeping without a browser, and `f6-viewer.spec.ts`
 * proves that a zero count renders nothing. What only the 7-storey building can show is the thing
 * F6 is about: both notices present at once, what they COST in vertical space, and that folding
 * gives that space back without giving up the claim.
 *
 * The numbers these tests were written against, measured on this building at 1280×720 before the
 * fold existed:
 *
 *     provisional notice   48 px, 5 members,   0 buttons
 *     torsion notice       48 px, 119 members, 0 buttons
 *     canvas               569 px of a 720 px window
 *
 * 96 px — 13 % of the window — held permanently by two paragraphs, above the geometry the user
 * opened the viewer to look at, with no way to put either away.
 */

import { test, expect, openPreparedWorkspace } from './prepared-building';
import type { Page } from '@playwright/test';

const NOTICES = [
  { kind: 'provisional', testid: 'rebar-provisional-banner' },
  { kind: 'torsion', testid: 'rebar-torsion-banner' },
] as const;

function heightOf(page: Page, testid: string): Promise<number> {
  return page.getByTestId(testid).evaluate(
    (el) => Math.round(el.getBoundingClientRect().height));
}

function canvasHeight(page: Page): Promise<number> {
  return page.getByTestId('rebar-canvas').evaluate(
    (el) => Math.round(el.getBoundingClientRect().height));
}

test.describe('@slow the standing notices, on the building that carries both', () => {
  test('both are present, and each names its own count', async (
    { preparedPage: page, preparedProject },
  ) => {
    test.setTimeout(240_000);
    await openPreparedWorkspace(page, preparedProject);

    for (const n of NOTICES) {
      const el = page.getByTestId(n.testid);
      await expect(el, `${n.kind} is on screen`).toBeVisible();
      /**
       * The count as DATA as well as words.
       *
       * `data-count` is what the fold is keyed on, so a notice whose attribute disagreed with its
       * sentence would fold against a number the reader never saw.
       */
      const attr = await el.getAttribute('data-count');
      expect(Number(attr), `${n.kind} carries a real count`).toBeGreaterThan(0);
      await expect(el, 'and the figure is rendered, not only stored')
        .toContainText(String(attr));
    }
  });

  test('folding gives the window back, and keeps the claim', async (
    { preparedPage: page, preparedProject },
  ) => {
    test.setTimeout(240_000);
    await openPreparedWorkspace(page, preparedProject);

    const canvasBefore = await canvasHeight(page);
    const before: Record<string, number> = {};
    const claims: Record<string, string> = {};
    for (const n of NOTICES) {
      before[n.kind] = await heightOf(page, n.testid);
      // The label, without the paragraph — this is what must survive the fold verbatim.
      claims[n.kind] = (await page.getByTestId(n.testid).locator('strong').innerText()).trim();
      expect(before[n.kind], `${n.kind} starts as a paragraph`).toBeGreaterThan(30);
    }

    for (const n of NOTICES) {
      await page.getByTestId(`${n.testid}-fold`).click();
    }

    for (const n of NOTICES) {
      const el = page.getByTestId(n.testid);
      await expect(el, `${n.kind} is still on screen — a fold is not a dismissal`).toBeVisible();
      await expect(el).toHaveAttribute('data-folded', 'true');

      /**
       * The claim, word for word.
       *
       * This is the whole reason the fold collapses to a chip rather than removing the notice.
       * `ProvisionalBanner` records why: "the whole risk of drawing provisional steel is that it
       * looks exactly like the real thing from across a desk". A control that could take the
       * sentence away would be a control for making the drawing look finished.
       */
      expect((await el.locator('strong').innerText()).trim(),
        `${n.kind} keeps its label`).toBe(claims[n.kind]);
      await expect(el.getByTestId(`${n.testid}-count`),
        'and its count').toBeVisible();

      const after = await heightOf(page, n.testid);
      expect(after, `${n.kind} folded to a row`).toBeLessThan(before[n.kind]);
    }

    const canvasAfter = await canvasHeight(page);
    expect(canvasAfter, 'the geometry got the space the paragraphs were holding')
      .toBeGreaterThan(canvasBefore);
  });

  test('a fold survives closing and reopening the workspace', async (
    { preparedPage: page, preparedProject },
  ) => {
    test.setTimeout(240_000);
    await openPreparedWorkspace(page, preparedProject);

    await page.getByTestId('rebar-provisional-banner-fold').click();
    await expect(page.getByTestId('rebar-provisional-banner'))
      .toHaveAttribute('data-folded', 'true');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rebar-workspace')).toBeHidden();
    await page.getByTestId('cmd-open-3d').click();
    await expect(page.getByTestId('rebar-workspace')).toBeVisible();

    /**
     * "Persistent for the session" is what F6 asks for, and closing the overlay is exactly the
     * gesture it has to survive: the workspace unmounts on close, so a fold held in the component
     * would be gone. `rebar-workspace.svelte.ts` states the same policy about the layer switches.
     */
    await expect(page.getByTestId('rebar-provisional-banner'),
      'the fold is session state, not component state')
      .toHaveAttribute('data-folded', 'true');
    /* And the other notice was not folded along with it — they are separate facts. */
    await expect(page.getByTestId('rebar-torsion-banner'))
      .toHaveAttribute('data-folded', 'false');
  });

  test('unfolding brings the explanation back', async (
    { preparedPage: page, preparedProject },
  ) => {
    test.setTimeout(240_000);
    await openPreparedWorkspace(page, preparedProject);

    const full = (await page.getByTestId('rebar-torsion-banner').innerText()).length;
    await page.getByTestId('rebar-torsion-banner-fold').click();
    const folded = (await page.getByTestId('rebar-torsion-banner').innerText()).length;
    expect(folded, 'the paragraph went away').toBeLessThan(full);

    await page.getByTestId('rebar-torsion-banner-fold').click();
    await expect(page.getByTestId('rebar-torsion-banner'))
      .toHaveAttribute('data-folded', 'false');
    expect((await page.getByTestId('rebar-torsion-banner').innerText()).length,
      'and came back whole').toBe(full);
  });

  /**
   * The state the restore used to lose, which is what made the two readings disagree.
   *
   * Measured on this building, restored: the status panel offered `rebar-status-MODELLED` and
   * nothing else — `MODELLED 203` — while the provisional notice on the same screen said 5
   * members carry a proposal that may not be built. `verificationStore` is runtime-only, so a
   * reopened project has no design outcome for any member, and `statusOf` read "steel, no
   * outcome" as MODELLED for all of them.
   *
   * The document's own record survives, so it is what the state comes from now. This is the
   * end-to-end half of that fix; `element-status.test.ts` pins the function.
   */
  test('a restored proposal is a PROVISIONAL member, not a finished one', async (
    { preparedPage: page, preparedProject },
  ) => {
    test.setTimeout(240_000);
    await openPreparedWorkspace(page, preparedProject);

    const declared = Number(
      await page.getByTestId('rebar-provisional-banner').getAttribute('data-count'));
    expect(declared, 'this building carries proposals').toBeGreaterThan(0);

    const filter = page.getByTestId('rebar-status-PROVISIONAL');
    await expect(filter, 'the state the notice announces is offered as a filter').toBeVisible();
    await expect(filter, 'and its count is the same count').toContainText(String(declared));

    /**
     * And it is a ROUTE, not only a label: pressing it narrows the scene to those members, so a
     * reader told "5 members carry a proposal" can find the five. Through
     * `rebarWorkspace.statusFilter` — the channel that already existed — and not a second one.
     */
    await filter.click();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => page.locator('[data-testid^="rebar-element-"][data-testid]').count())
      .toBeLessThan(preparedProject.elements);
  });
});
