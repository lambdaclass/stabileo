/** H1-B — the design places: heading order, focus and Escape. */

import { test, expect, designAll, loadModel, designPlace } from './fixtures';
import type { Page } from '@playwright/test';

async function design(page: Page, model = 'rc-design-qa-8') {
  await loadModel(page, model);
  await designAll(page);
  await designPlace(page, 'steel');
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
      for (const place of ['steel', 'sheets'] as const) {
      await designPlace(page, place);
      const h = await headings(page, '.dd-canvas-body');
      expect(h, 'the place must be on screen').not.toBeNull();
      expect(jumps(h!), `no level is skipped in ${place}`).toEqual([]);
      }
    });
  });
}

test.describe('@slow focus and Escape', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('entering Design leaves focus on the stage',
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
    });

  test('Escape leaves design for the stage it came from',
    async ({ pro: page }) => {
      await design(page);
      await page.getByTestId('pr-stage-model').click();
      await page.getByTestId('pr-stage-design').click();
      await designPlace(page, 'steel');

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
