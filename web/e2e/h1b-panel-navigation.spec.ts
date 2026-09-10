/**
 * H1-B — the right-hand panel: heading order, focus, Escape, and long content.
 *
 * H1-A deferred all four of these on purpose: it measured screens at rest and said so. These
 * assert them, and three of the four turned out to be things that already WORK — which is worth
 * pinning precisely because nothing was protecting them.
 *
 * The fourth is a defect in a file H1 does not own, so it is marked `test.fail()` rather than
 * quietly asserted away. See the last describe.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

async function design(page: Page, model = 'rc-design-qa-8') {
  await loadModel(page, model);
  await designAll(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
}

async function generateDetailing(page: Page) {
  const d = page.getByTestId('detailing-disclosure');
  if (await d.getAttribute('open') === null) await d.locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() =>
      (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
        .detailingAssemblies().length), { timeout: 60_000 })
    .toBeGreaterThan(0);
}

/** The heading levels inside a subtree, in document order. */
const headings = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const root = document.querySelector(s);
    if (!root) return null;
    return [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent ?? '').trim().slice(0, 30) }));
  }, sel);

function jumps(list: Array<{ level: number; text: string }>) {
  const out: string[] = [];
  for (let i = 1; i < list.length; i++) {
    if (list[i].level - list[i - 1].level > 1) {
      out.push(`h${list[i - 1].level} → h${list[i].level} at "${list[i].text}"`);
    }
  }
  return out;
}

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`@slow heading order in ${locale}`, () => {
    test.slow();
    test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });

    test('the design panel skips no level', async ({ pro: page }) => {
      await design(page);
      const h = await headings(page, '.pro-panel');
      expect(h, 'the panel must be on screen').not.toBeNull();
      /*
       * `h3 → h5` at "Engineer review" was the jump H1-A found, in all three languages. Both
       * headings live in `DocumentsSection`, so the fix was internal to one file: a reader
       * navigating by heading could not tell whether the review was a sibling of the documents
       * or a part of them.
       */
      expect(jumps(h!), 'no level is skipped').toEqual([]);
    });

    test('the workspace rail skips no level', async ({ pro: page }) => {
      await design(page);
      await generateDetailing(page);
      await openDocumentsStage(page);
      const before = await page.evaluate(() =>
        (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds());
      await page.getByTestId('doc-3d').click();
      await expect(page.getByTestId('rebar-workspace')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() =>
          (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds()),
          { timeout: 120_000 })
        .toBeGreaterThan(before);

      const h = await headings(page, '[data-testid="rebar-workspace"]');
      // `h2 → h4` at "Layers": the overlay's title is the h2, so a rail panel is its child.
      expect(jumps(h!), 'no level is skipped').toEqual([]);
      expect(h![0].level, 'the overlay still opens at h2').toBe(2);
    });
  });
}

test.describe('@slow focus and Escape', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the overlay takes focus on open and gives it back on Escape',
    async ({ pro: page }) => {
      await design(page);
      await generateDetailing(page);
      await openDocumentsStage(page);

      /*
       * This already worked, and nothing was checking it. `RebarWorkspace` uses `captureFocus`
       * from `lib/utils/dialog-focus.ts` and its comment explains why: the opener is a button
       * this overlay COVERS, so without the restore, Escape returned the user to `<body>`.
       * Pinned here so a future refactor of the overlay cannot lose it silently.
       */
      const opener = page.getByTestId('doc-3d');
      await opener.focus();
      await opener.click();
      await expect(page.getByTestId('rebar-workspace')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() =>
          (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds()),
          { timeout: 120_000 })
        .toBeGreaterThan(0);

      expect(await page.evaluate(() =>
        document.querySelector('[data-testid="rebar-workspace"]')!
          .contains(document.activeElement)),
        'focus lands inside the overlay').toBe(true);

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
      expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
        'and returns to the control the user left').toBe('doc-3d');
    });

  test('opening a stage from the strip leaves focus on the strip, which is where it belongs',
    async ({ pro: page }) => {
      await design(page);
      /*
       * Measured rather than assumed to be a defect. Clicking a stage in the strip opens the
       * matching `<details>` and focus stays on the strip button — which is correct for a
       * non-modal disclosure: the user pressed a button, the button is still there, and moving
       * focus into freshly revealed content is the behaviour a modal owes and a disclosure does
       * not.
       *
       * Recorded so that "improving" it later is a decision rather than a drift.
       */
      await page.getByTestId('pr-stage-design').click();
      expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
        .toBe('pr-stage-design');

      const d = page.getByTestId('detailing-disclosure');
      await d.locator('> summary').click();
      const onSummary = await page.evaluate(() =>
        document.activeElement?.tagName.toLowerCase());
      expect(onSummary, 'clicking the summary focuses the summary').toBe('summary');
    });

  test('Escape does NOT close a stage section, and the overlay is the only modal',
    async ({ pro: page }) => {
      await design(page);
      const d = page.getByTestId('detailing-disclosure');
      if (await d.getAttribute('open') === null) await d.locator('> summary').click();
      expect(await d.getAttribute('open'), 'the section is open').not.toBeNull();

      await page.keyboard.press('Escape');
      /*
       * Asserted as it is, not as it might be nicer. A `<details>` is not a dialog and Escape
       * has no native meaning on one; the overlay closes on Escape because it IS modal. Making
       * a disclosure close on Escape would be a new convention, and inventing one here would
       * make the two behaviours look like a pair when only one of them is standard.
       *
       * Reported to Bauti as a question rather than settled in a test.
       */
      expect(await d.getAttribute('open'), 'a disclosure ignores Escape').not.toBeNull();
    });
});

test.describe('@slow long content', () => {
  test.slow();

  for (const [w, h] of [[1280, 720], [1024, 700]] as const) {
    test(`an 80-character label wraps instead of widening the panel at ${w}×${h}`,
      async ({ pro: page }) => {
        await page.setViewportSize({ width: w, height: h });
        await design(page);
        /*
         * H1-A measured the fixture's own text lengths and said it had not measured synthetic
         * ones. This is that: a member label a real project can produce, injected into six
         * labels at once, which is worse than any single one.
         */
        const r = await page.evaluate(() => {
          const panel = document.querySelector('.pro-panel') as HTMLElement;
          const before = panel.scrollWidth - panel.clientWidth;
          const victims = [...panel.querySelectorAll('.label, .fstate, dt, dd')]
            .slice(0, 6) as HTMLElement[];
          const saved = victims.map((v) => v.textContent);
          const long = 'Viga continua de hormigon armado sobre apoyos elasticos - nivel +12.40';
          victims.forEach((v) => { v.textContent = long; });
          const after = panel.scrollWidth - panel.clientWidth;
          const grew = victims.map((v) => Math.round(v.getBoundingClientRect().height));
          victims.forEach((v, i) => { v.textContent = saved[i]; });
          return { before, after, n: victims.length, grew };
        });

        expect(r.n, 'labels were found to lengthen').toBeGreaterThan(0);
        expect(r.after, 'the panel does not widen').toBeLessThanOrEqual(r.before + 1);
        // And they DID grow, so the wrap is real rather than the text being clipped away.
        expect(Math.max(...r.grew), 'the labels wrapped').toBeGreaterThan(20);
      });
  }
});

test.describe('@slow the workflow strip', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the strip itself never scrolls sideways', async ({ pro: page }) => {
    await design(page);
    for (const w of [1280, 1024, 900, 820]) {
      await page.setViewportSize({ width: w, height: 720 });
      const over = await page.getByTestId('workflow-stages').locator('ol')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over, `no sideways scroll at ${w}`).toBeLessThanOrEqual(1);
    }
  });

  test('no wrapped row ends in a chevron pointing at nothing', async ({ pro: page }) => {
    /*
     * `test.fail()` INSIDE the body, not at describe scope.
     *
     * At describe scope it marks every test in the block, and the first version did exactly
     * that: Playwright reported "Expected to fail, but passed" against the sideways-scroll test
     * above, which passes and should. One misplaced line turned a green assertion into a red
     * one and would have hidden this one entirely.
     */
    test.fail();
    /**
     * PR20 reported "the workflow strip wraps at 1280×720 with a dangling chevron". H1-A found
     * no OVERFLOW and said that was a different claim needing a different measurement. This is
     * it, and the claim is CONFIRMED:
     *
     *   `ol` is `flex-wrap: wrap`, and at 1280, 1024, 900 and 820 it makes the same two rows —
     *   five stages, then `stage-documents` alone. The chevron comes from
     *   `.stage:not(:last-child)::after`, so `stage-detailing` draws one and it is the last item
     *   on row 1: a `›` pointing at the end of the line.
     *
     *   It is width-independent because the strip lives in the fixed-width PRO sidebar, so it
     *   is not a narrow-viewport problem at all.
     *
     * `test.fail()` because `WorkflowStages.svelte` is shared PRO chrome — M1's metallic flow
     * renders inside the same strip — and H1 does not edit it unilaterally. Marked rather than
     * skipped, so the day someone fixes it Playwright reports this as an unexpected PASS and the
     * marker comes off. A test that asserted the defect would have to be inverted instead.
     */
    const rows = await page.getByTestId('workflow-stages').locator('ol').evaluate((ol) => {
      const items = [...ol.children] as HTMLElement[];
      const byTop = new Map<number, HTMLElement[]>();
      for (const li of items) {
        const t = Math.round(li.getBoundingClientRect().top);
        if (!byTop.has(t)) byTop.set(t, []);
        byTop.get(t)!.push(li);
      }
      // A row ends in a chevron when its last item is not the last item overall.
      return [...byTop.values()].map((row) => ({
        ids: row.map((li) => li.getAttribute('data-testid')),
        endsWithChevron: row[row.length - 1] !== items[items.length - 1],
      }));
    });
    expect(rows.filter((r) => r.endsWithChevron), 'rows ending in a dangling chevron')
      .toEqual([]);
  });
});
