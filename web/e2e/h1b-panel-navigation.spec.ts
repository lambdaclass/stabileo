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

import { test, expect, designAll, loadModel, openDocumentsStage, designPlace } from './fixtures';
import type { Page } from '@playwright/test';

async function design(page: Page, model = 'rc-design-qa-8') {
  await loadModel(page, model);
  await designAll(page);
  await designPlace(page, 'list');
}

async function generateDetailing(page: Page) {
  await designPlace(page, 'detailing');
  const d = page.getByTestId('desk-detailing');
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

    test('the design places skip no level', async ({ pro: page }) => {
      await design(page);
      // Each place of design in turn, the way the classic column held them (interface A).
      for (const place of ['list', 'detailing', 'documents'] as const) {
      await designPlace(page, place);
      const h = await headings(page, '.dd-canvas-body');
      expect(h, 'the place must be on screen').not.toBeNull();
      /*
       * `h3 → h5` at "Engineer review" was the jump H1-A found, in all three languages. Both
       * headings live in `DocumentsSection`, so the fix was internal to one file: a reader
       * navigating by heading could not tell whether the review was a sibling of the documents
       * or a part of them.
       */
      expect(jumps(h!), `no level is skipped in ${place}`).toEqual([]);
      }
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

  test('entering Design leaves focus on the stage; pressing a step moves it into its places',
    async ({ pro: page }) => {
      await design(page);
      await page.getByTestId('pr-stage-model').click();
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

      // A step is a navigation within design: the keyboard follows it into the step's places.
      await page.getByTestId('desk-step-detail').click();
      expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="desk-rail"]') !== null),
        'pressing a step focuses its places').toBe(true);
    });

  test('Escape leaves design for the stage it came from',
    async ({ pro: page }) => {
      await design(page);
      await page.getByTestId('pr-stage-model').click();
      await page.getByTestId('pr-stage-design').click();
      await designPlace(page, 'detailing');

      await page.keyboard.press('Escape');
      /*
       * Interface A: design is a stage of its own, not a section, and Escape is its way out on a
       * keyboard (C1b of the interaction contracts). The modal surfaces above it (the 3-D view,
       * the «Size…» dialog) take their own Escape first.
       */
      await expect(page.getByTestId('design-desk')).toBeHidden();
      await expect(page.getByTestId('pr-stage-model')).toHaveClass(/active/);
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
          const panel = document.querySelector('.dd-canvas-body') as HTMLElement;
          const before = panel.scrollWidth - panel.clientWidth;
          const victims = [...panel.querySelectorAll('.label, .fstate, dt, dd')]
            .slice(0, 6) as HTMLElement[];
          const saved = victims.map((v) => v.textContent);
          // Three times the 80 characters a member label reaches: the canvas under the viewer is
          // wider than the classic column was, so one label of 80 fits on a line there.
          const long = 'Viga continua de hormigon armado sobre apoyos elasticos - nivel +12.40 '.repeat(3);
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

test.describe('@slow the steps of design', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the steps never scroll sideways', async ({ pro: page }) => {
    await design(page);
    for (const w of [1280, 1024, 900, 820]) {
      await page.setViewportSize({ width: w, height: 720 });
      const over = await page.getByTestId('desk-process').locator('ol')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over, `no sideways scroll at ${w}`).toBeLessThanOrEqual(1);
    }
  });

  test('the steps are one row, so no chevron can point at nothing', async ({ pro: page }) => {
    /**
     * PR20 reported "the workflow strip wraps at 1280x720 with a dangling chevron". H1-A found
     * no OVERFLOW and said that was a different claim needing a different measurement. H1-B made
     * that measurement and CONFIRMED it: `WorkflowStages`'s `ol` is `flex-wrap: wrap`, and at
     * 1280, 1024, 900 and 820 it made the same two rows — five stages, then `stage-documents`
     * alone — with `.stage:not(:last-child)::after` drawing a chevron at the end of row one.
     *
     * It was marked `test.fail()` because `WorkflowStages.svelte` is shared PRO chrome that the
     * metallic flow renders, and H1 did not edit it unilaterally.
     *
     * F1 closes it for the concrete flow by a different route: the RC tab has its own strip, and
     * that strip does not wrap. Five stages on one line, and a row that scrolls sideways rather
     * than growing a second one — a sticky element cannot be allowed to double its own height.
     *
     * `WorkflowStages` itself is UNCHANGED and the metallic flow still wraps. That remains an
     * integration item in `h1-shared-chrome-proposal.md`; it is simply no longer reachable from
     * here, which is why the marker comes off rather than the test.
     */
    for (const w of [1280, 1024, 900, 820]) {
      await page.setViewportSize({ width: w, height: 720 });
      const tops = await page.getByTestId('desk-process').locator('ol')
        .evaluate((ol) => [...ol.children]
          .filter((li) => !li.classList.contains('dp-sep'))
          .map((li) => Math.round(li.getBoundingClientRect().top)));
      expect(new Set(tops).size, `one row at ${w}`).toBe(1);
    }
  });
});
