/**
 * F1 — the concrete flow's own stage timeline.
 *
 * What these assert, in order of how much they would have caught:
 *
 *   1. FIVE stages, numbered 1–5, matching the five disclosures. The strip this replaces drew
 *      six, the sections below it were numbered 0, 1, 4, 5, 6, and the navigation callback
 *      accepted a third list of five.
 *   2. No *Verificación* stage before *Diseñar*. A completed verification shown before anything
 *      has been designed says the reinforcement was verified, which is the one claim this
 *      branch may not make by accident.
 *   3. The strip stays put while the column scrolls. It used to scroll away, which is the same
 *      as not having it.
 *   4. Clicking a stage opens its section AND moves the keyboard there. Scrolling alone leaves
 *      focus on the strip, so the next Tab continues from the wrong place.
 *   5. Opening a section by hand moves the strip's reading marker. One state, both directions.
 */

import { test, expect, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

/** The five stages, in the order the work happens. */
const STAGES = ['model', 'codes', 'design', 'detailing', 'documents'] as const;

/** The disclosure each stage owns. Duplicated from the contract on purpose — see below. */
const DISCLOSURE: Record<(typeof STAGES)[number], string> = {
  model: 'design-overview-disclosure',
  codes: 'code-settings-disclosure',
  design: 'design-stage-disclosure',
  detailing: 'detailing-disclosure',
  documents: 'documents-disclosure',
};

const timeline = (page: Page) => page.getByTestId('rc-stage-timeline');
const stage = (page: Page, id: string) => page.getByTestId(`rc-stage-${id}`);

test.describe('the timeline is one vocabulary', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('draws exactly five stages, in pipeline order', async ({ pro: page }) => {
    await expect(timeline(page)).toBeVisible();
    const items = timeline(page).locator('li.stage');
    await expect(items).toHaveCount(5);
    for (const [i, id] of STAGES.entries()) {
      await expect(items.nth(i), `position ${i} is ${id}`)
        .toHaveAttribute('data-testid', `rc-stage-${id}`);
    }
  });

  /*
   * The numbering that used to disagree with itself. The strip numbers 1..5 and the sections
   * below carry the same numbers in the same order — 0, 1, 4, 5, 6 for five things is what was
   * there before.
   */
  test('numbers the stages 1 to 5, and the sections agree', async ({ pro: page }) => {
    for (const [i, id] of STAGES.entries()) {
      const mark = stage(page, id).locator('.mark');
      const text = (await mark.innerText()).trim();
      // A completed stage shows a tick instead of its number; on a fresh project none is.
      expect(text, `${id} shows its position`).toBe(String(i + 1));
    }
    /*
     * Addressed by the five stage ids rather than by a `$="-disclosure"` suffix. The floor pass
     * is a sub-step inside DISEÑAR and its testid ends the same way, so the suffix selector
     * counted six — and a sub-step has no pipeline number to check, which is the whole reason it
     * does not use `StageSection`.
     */
    for (const [i, id] of STAGES.entries()) {
      const marker = page.getByTestId(DISCLOSURE[id]).locator('> summary > .marker');
      expect((await marker.innerText()).trim(), `section ${i + 1} is ${id}`).toBe(String(i + 1));
    }
  });

  /*
   * The duplication above is deliberate and this is what makes it safe: if the contract and
   * this spec ever disagree about which `<details>` a stage owns, the click lands nowhere and
   * the assertion fails. A spec that imported the map could not catch a wrong map.
   */
  test('every stage lands on its own disclosure, and no two share one', async ({ pro: page }) => {
    const seen = new Set<string>();
    for (const id of STAGES) {
      await stage(page, id).locator('button').click();
      const target = page.getByTestId(DISCLOSURE[id]);
      await expect(target, `${id} opens ${DISCLOSURE[id]}`).toHaveAttribute('open', '');
      expect(seen.has(DISCLOSURE[id]), `${DISCLOSURE[id]} is claimed once`).toBe(false);
      seen.add(DISCLOSURE[id]);
    }
    expect(seen.size).toBe(5);
  });

  /*
   * The semantic correction. `demands`, `check` and `floors` were ids of the old lists; none of
   * them may resolve to anything, and no stage may be named "verification" before Diseñar.
   */
  test('has no verification stage, and none of the orphaned ids', async ({ pro: page }) => {
    for (const orphan of ['demands', 'check', 'floors', 'verification']) {
      await expect(stage(page, orphan), `${orphan} is not a stage`).toHaveCount(0);
    }
    const labels = (await timeline(page).locator('.label').allInnerTexts())
      .map((s) => s.trim().toLowerCase());
    const designIdx = labels.findIndex((l) => /dise|design|projet/.test(l));
    expect(designIdx, 'the design stage is on screen').toBeGreaterThanOrEqual(0);
    for (const [i, l] of labels.entries()) {
      if (i < designIdx) {
        expect(l, `"${l}" precedes design and must not claim verification`)
          .not.toMatch(/verif/i);
      }
    }
  });
});

test.describe('the strip stays where it can be read', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('does not scroll away with the column', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    /*
     * DISEÑAR, because it is the tall one: the design table and its command bar live inside it.
     *
     * An earlier version clicked every stage in turn to fill the column, which stopped working
     * when navigation began opening exactly one section at a time — the last click left only
     * Documentos open and the column no longer overflowed, so the scroll under test never
     * happened and the assertion measured nothing.
     */
    await stage(page, 'design').locator('button').click();
    await expect(page.getByTestId('pro-design-tab')).toBeVisible();

    const before = await timeline(page).boundingBox();
    const column = page.locator('.rc-workflow');
    await expect
      .poll(() => column.evaluate((el) => el.scrollHeight - el.clientHeight),
        { message: 'the column has something to scroll' })
      .toBeGreaterThan(0);
    await column.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(async () => (await column.evaluate((el) => el.scrollTop)))
      .toBeGreaterThan(0);

    const after = await timeline(page).boundingBox();
    expect(before, 'the strip has a box').not.toBeNull();
    expect(after, 'and still has one after scrolling').not.toBeNull();
    /*
     * The whole point of `position: sticky`: the strip's own top does not move when its
     * siblings do. A tolerance of 2 px, because sub-pixel layout is not the thing under test.
     */
    expect(Math.abs(after!.y - before!.y), 'the strip held its position').toBeLessThanOrEqual(2);
    await expect(timeline(page)).toBeInViewport();
  });

  /*
   * It must not eat the panel. A sticky strip is a permanent tax on every screen below it, and
   * at 700 px there is not much to spend.
   */
  test('stays compact at 1024x700', async ({ pro: page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    const box = await timeline(page).boundingBox();
    expect(box!.height, 'the strip is a strip, not a panel').toBeLessThan(90);
    // One row, not two. The shared strip wraps its six stages and leaves the last one alone.
    const tops = await timeline(page).locator('li.stage')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'every stage sits on one line').toBe(1);
  });

  test('the column never scrolls sideways at either size', async ({ pro: page }) => {
    for (const vp of [{ width: 1280, height: 720 }, { width: 1024, height: 700 }]) {
      await page.setViewportSize(vp);
      const over = await page.locator('.rc-workflow').evaluate(
        (el) => el.scrollWidth - el.clientWidth);
      expect(over, `no horizontal overflow at ${vp.width}`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('navigation goes both ways, and there is one state', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  /*
   * Focus, not just scroll. Scrolling moves the eye and leaves the keyboard on the strip, so
   * the next Tab continues from a button five sections away from what the user is reading.
   */
  test('clicking a stage moves the keyboard into its section', async ({ pro: page }) => {
    await stage(page, 'detailing').locator('button').click();
    const summary = page.getByTestId('detailing-disclosure').locator('> summary');
    await expect(summary).toBeFocused();
  });

  test('and the strip marks what is being read', async ({ pro: page }) => {
    await stage(page, 'detailing').locator('button').click();
    await expect(stage(page, 'detailing')).toHaveAttribute('data-open', 'true');
    await expect(page.getByTestId('rc-stage-open')).toBeVisible();
  });

  /*
   * The other direction, and the reason the tab derives the open stage from the disclosures
   * rather than storing it: opening a section by hand must move the marker, or the strip and
   * the sections are two states that can disagree.
   */
  test('opening a section by hand moves the marker', async ({ pro: page }) => {
    await page.getByTestId('documents-disclosure').locator('> summary').click();
    await expect(stage(page, 'documents')).toHaveAttribute('data-open', 'true');
    await expect(stage(page, 'model')).not.toHaveAttribute('data-open', 'true');
  });

  /*
   * `aria-current` marks where the PROJECT is; `data-open` marks what you are READING. They are
   * different questions and collapsing them would mean scrolling to a finished stage moved the
   * "you are here" marker onto it.
   */
  test('the reading marker and the "you are here" marker are separate', async ({ pro: page }) => {
    await stage(page, 'documents').locator('button').click();
    await expect(stage(page, 'documents')).toHaveAttribute('data-open', 'true');
    const current = timeline(page).locator('button[aria-current="step"]');
    await expect(current, 'exactly one stage is current').toHaveCount(1);
    await expect(stage(page, 'model').locator('button'), 'and it is still MODELADO')
      .toHaveAttribute('aria-current', 'step');
  });

  /*
   * Escape does not close a `<details>` — that is standard and documented in the QA guide as a
   * non-bug. What matters is that it does not do something ELSE either: the section stays open
   * and focus stays where the user put it.
   */
  test('Escape leaves the open section and the focus alone', async ({ pro: page }) => {
    await stage(page, 'detailing').locator('button').click();
    const disclosure = page.getByTestId('detailing-disclosure');
    await expect(disclosure).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(disclosure, 'still open').toHaveAttribute('open', '');
    await expect(disclosure.locator('> summary'), 'still focused').toBeFocused();
  });

  test('every stage button is reachable and named by the keyboard', async ({ pro: page }) => {
    for (const id of STAGES) {
      const btn = stage(page, id).locator('button');
      const name = (await btn.evaluate((el) => (el.textContent ?? '').trim()));
      expect(name.length, `${id} has an accessible name`).toBeGreaterThan(1);
      await btn.focus();
      await expect(btn).toBeFocused();
    }
  });
});

test.describe('the stages say what they are waiting for', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  /*
   * §1 requires MODELADO to explain the model's readiness, not just whether one exists. The
   * three reachable states have different remedies and must read differently.
   */
  test('an empty project says there is no model', async ({ pro: page }) => {
    const r = page.getByTestId('rc-stage-readiness');
    await expect(r).toBeVisible();
    await expect(r).toHaveAttribute('data-readiness', 'empty');
  });

  test('a loaded but unsolved model says so instead', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    const r = page.getByTestId('rc-stage-readiness');
    await expect(r).toHaveAttribute('data-readiness', 'unsolved');
    await expect(page.getByTestId('rc-stage-next')).toBeVisible();
  });

  test('and a solved one stops saying anything about readiness', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await expect(page.getByTestId('rc-stage-readiness')).toHaveCount(0);
    await expect(stage(page, 'model')).toHaveAttribute('data-state', 'complete');
  });

  /*
   * The five states, and the two that are easy to get wrong. `documents` is optional and never
   * blocked; on an empty project everything downstream is genuinely unreachable rather than
   * merely not-yet.
   */
  test('an empty project blocks what cannot start, and marks Documentos optional',
    async ({ pro: page }) => {
      await expect(stage(page, 'model')).toHaveAttribute('data-state', 'current');
      await expect(stage(page, 'design')).toHaveAttribute('data-state', 'blocked');
      await expect(stage(page, 'documents')).toHaveAttribute('data-state', 'optional');
    });

  test('a project under way is pending rather than blocked', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await expect(stage(page, 'detailing')).toHaveAttribute('data-state', 'pending');
  });

  /*
   * An example model carries no ExportRecord and no manual-edit list — it predates both — and
   * loading one must neither fail nor make the app claim anything about them.
   */
  test('a model with no export or retouch history loads and designs normally',
    async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      await solveModel(page);
      await expect(timeline(page)).toBeVisible();
      await expect(stage(page, 'model')).toHaveAttribute('data-state', 'complete');
    });
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`in ${locale}`, () => {
    test.use({ appLocale: locale, viewport: { width: 1024, height: 700 } });

    test('every stage is named, and none of the names is a key', async ({ pro: page }) => {
      for (const id of STAGES) {
        const label = (await stage(page, id).locator('.label').innerText()).trim();
        expect(label.length, `${id} is named`).toBeGreaterThan(1);
        expect(label, `${id} is translated, not a key`).not.toMatch(/^design\./);
      }
      const hint = (await page.getByTestId('rc-stage-next').innerText()).trim();
      expect(hint.length).toBeGreaterThan(5);
      expect(hint).not.toMatch(/^design\./);
    });

    test('and the strip still fits on one line', async ({ pro: page }) => {
      const tops = await timeline(page).locator('li.stage')
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size, `one line in ${locale}`).toBe(1);
    });
  });
}
