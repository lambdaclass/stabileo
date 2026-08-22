/**
 * H1-C — the documents stage, on a fixture that actually reaches its states.
 *
 * H1-A measured this stage at 24 nodes and reported it clean. It had measured `.documents`, which
 * is ONE CARD inside the stage, and it had never built a document — so "clean" meant "nothing was
 * looked at". This is the real pass.
 *
 * ── The chain, and the one thing that was wrong with it ────────────
 *
 * state → export → review → acceptance → issue. The document is built LAZILY, by the first
 * export: before that the stage says "No document built yet" while the three export buttons are
 * enabled, and clicking one builds the model and updates the panel. That is deliberate and it
 * works — `doc-xlsx` downloads `detailing-rev1.xlsx` and `doc-readiness` appears.
 *
 * What was wrong: `Record review` had no `disabled` and no explanation. Clicking it with an
 * unaccepted provisional calculation called `detailingStore.review`, which refuses — but only
 * after `retireDocument()` has already run. So a click that accomplished nothing SUPERSEDED the
 * document the user had just built. The three refusals are now stated before the click, in the
 * store's own words and from the same locale keys.
 *
 * The store's ordering is still wrong and is reported in
 * `docs/handoffs/h1c-documents-audit.md` §3 — a store read by fourteen components is not H1's to
 * reorder. These assertions make the refusal unreachable from this panel, which is the part that
 * is.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

/** Detailing generated, documents open, and nothing built yet. */
async function toDocuments(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() =>
      (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
        .detailingAssemblies().length), { timeout: 60_000 })
    .toBeGreaterThan(0);
  await openDocumentsStage(page);
  await expect(page.getByTestId('documents-stage')).toBeVisible();
}

/** …and one export run, so a document exists. */
async function withDocument(page: Page) {
  await toDocuments(page);
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByTestId('doc-xlsx').click();
  const file = await download;
  await expect(page.getByTestId('doc-readiness')).toBeVisible();
  return file;
}

test.describe('@slow the export builds the document, and says so', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('before any export the stage states the absence rather than showing a figure',
    async ({ pro: page }) => {
      await toDocuments(page);
      await expect(page.getByTestId('doc-none')).toBeVisible();
      await expect(page.getByTestId('doc-readiness')).toHaveCount(0);
      // The exports are enabled on purpose: the first one is what builds the model.
      for (const id of ['doc-report', 'doc-dxf', 'doc-xlsx', 'doc-3d']) {
        await expect(page.getByTestId(id), `${id} is offered`).toBeEnabled();
      }
    });

  test('an export produces a real file and the panel picks up the revision',
    async ({ pro: page }) => {
      const file = await withDocument(page);
      /*
       * A real download, named after the revision it belongs to. Asserted because the first probe
       * of this looked for a download from `doc-report` — which uses `window.open` + `print()`,
       * not a download — and concluded the export was a silent no-op. It is not; the signal was
       * the wrong one.
       */
      expect(await file.suggestedFilename()).toMatch(/^detailing-rev\d+\.xlsx$/);
      await expect(page.getByTestId('doc-none')).toHaveCount(0);
      await expect(page.getByTestId('doc-revision')).toContainText(/1/);
      await expect(page.getByTestId('doc-error')).toHaveCount(0);
    });
});

test.describe('@slow review is gated by the reasons the store would give', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('it is disabled with the refusals stated, and enables as each is met',
    async ({ pro: page }) => {
      await withDocument(page);
      const submit = page.getByTestId('review-submit');
      const blockers = page.getByTestId('review-blockers');

      // Two refusals up front: no named engineer, and an unaccepted provisional calculation.
      await expect(submit).toBeDisabled();
      await expect(blockers).toBeVisible();
      const both = await blockers.innerText();
      expect(both.length, 'the reasons are sentences, not a grey button')
        .toBeGreaterThan(40);

      await page.getByTestId('review-engineer').fill('Bautista Chesta');
      await expect(submit, 'still blocked by the provisional').toBeDisabled();
      expect((await blockers.innerText()).length, 'one reason fewer')
        .toBeLessThan(both.length);

      const acks = page.locator('[data-testid^="ack-"]');
      const n = await acks.count();
      expect(n, 'this fixture has a provisional calculation to accept').toBeGreaterThan(0);
      for (let i = 0; i < n; i++) await acks.nth(i).check();

      await expect(submit, 'every refusal met').toBeEnabled();
      await expect(blockers).toHaveCount(0);
      // And the document survived being blocked, which is the whole point.
      await expect(page.getByTestId('doc-readiness')).toBeVisible();
    });

  test('and once recorded, the review succeeds and issue opens', async ({ pro: page }) => {
    await withDocument(page);
    await page.getByTestId('review-engineer').fill('Bautista Chesta');
    const acks = page.locator('[data-testid^="ack-"]');
    for (let i = 0; i < await acks.count(); i++) await acks.nth(i).check();
    await page.getByTestId('review-submit').click();

    await expect(page.getByTestId('review-record')).toBeVisible();
    await expect(page.getByTestId('review-error'), 'no refusal').toHaveCount(0);
    await expect(page.getByTestId('issue-submit'), 'issue is now reachable').toBeEnabled();
    /*
     * `doc-readiness` goes on a SUCCESSFUL review too, and that is correct: the store's comment
     * says a review changes the readiness a document may claim, so the previous one is no longer
     * current. Asserted so the two cases are not confused — this one is by design, the refusal
     * path was not.
     */
    await expect(page.getByTestId('doc-none')).toBeVisible();
  });

  test('the issue blockers shrink as the conditions are met, and name what is left',
    async ({ pro: page }) => {
      await withDocument(page);
      const blockers = page.getByTestId('issue-blockers');
      const before = await blockers.innerText();
      expect(before, 'both conditions named').toMatch(/review/i);

      await page.getByTestId('review-engineer').fill('Bautista Chesta');
      const acks = page.locator('[data-testid^="ack-"]');
      for (let i = 0; i < await acks.count(); i++) await acks.nth(i).check();
      expect((await blockers.innerText()).length, 'the accepted condition is gone')
        .toBeLessThan(before.length);
      await expect(page.getByTestId('issue-submit')).toBeDisabled();
    });
});

/**
 * Legibility, not fit.
 *
 * The stage fits at both widths in all three languages — measured, and it does. So the interesting
 * assertion is the other one: that every sentence on it clears its contrast bar against the
 * ground it actually sits on. "The container fits" and "the information is legible" are different
 * claims and only the second one matters to a reader.
 */
const AUDIT = `(sel) => {
  const root = document.querySelector(sel);
  if (!root) return null;
  const lum = (c) => {
    const m = c.match(/\\d+(\\.\\d+)?/g); if (!m) return null;
    const f = m.slice(0, 3).map(Number).map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ground = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const a = bg.match(/rgba?\\([^)]*?([\\d.]+)\\)/);
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && (!a || Number(a[1]) > 0.5)) return bg;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const bad = [];
  let counted = 0;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    const need = (px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700)) ? 3 : 4.5;
    const a = lum(cs.color), b = lum(ground(el));
    if (a === null || b === null) continue;
    counted += 1;
    const [x, y] = a > b ? [a, b] : [b, a];
    const ratio = (x + 0.05) / (y + 0.05);
    if (ratio < need) {
      bad.push(ratio.toFixed(2) + '/' + need + ' .'
        + (el.className || '').toString().split(' ')[0] + ' ' + px + 'px "'
        + (el.textContent || '').trim().slice(0, 24) + '"');
    }
  }
  return { counted, overflow: root.scrollWidth - root.clientWidth, bad };
}`;

for (const locale of ['en', 'es', 'pt'] as const) {
  for (const [w, h] of [[1280, 720], [1024, 700]] as const) {
    test.describe(`@slow the documents stage in ${locale} at ${w}×${h}`, () => {
      test.slow();
      test.use({ appLocale: locale, viewport: { width: w, height: h } });

      test('every sentence on it is legible, and it fits', async ({ pro: page }) => {
        await withDocument(page);
        const r = await page.evaluate(
          new Function('return ' + AUDIT)() as never, '[data-testid="documents-stage"]',
        ) as { counted: number; overflow: number; bad: string[] } | null;

        expect(r, 'the stage must be on screen').not.toBeNull();
        expect(r!.counted, 'text was actually measured').toBeGreaterThan(5);
        expect(r!.bad, 'copy under its contrast bar').toEqual([]);
        expect(r!.overflow, 'and the stage fits').toBeLessThanOrEqual(1);
        test.info().annotations.push(
          { type: 'coverage', description: `${r!.counted} text nodes` });
      });

      test('the review refusals are translated, not English fallbacks',
        async ({ pro: page }) => {
          await withDocument(page);
          const blockers = page.getByTestId('review-blockers');
          await expect(blockers).toBeVisible();
          const text = await blockers.innerText();
          expect(text.length, 'a real sentence').toBeGreaterThan(40);
          if (locale !== 'en') {
            // A cheap tripwire for a key that fell through to English rather than being
            // translated: the English refusal opens with this exact phrase.
            expect(text).not.toContain('The reviewing engineer must be named');
          }
        });
    });
  }
}
