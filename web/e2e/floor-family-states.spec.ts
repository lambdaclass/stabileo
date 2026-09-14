/**
 * The floor families say what they know, and admit what they do not.
 *
 * ── The defect on screen ───────────────────────────────────────────
 *
 * The three family tabs carried a bare number, computed as `floorRun?.slabs.length ?? 0`. On a
 * project that had never run the floor pass that number was `0`, rendered identically to a real
 * zero. So the panel told an engineer their building had **no slabs**, which reads as a fact
 * about the building and was a fact about the button.
 *
 * These run at 1280×720 — the width the PRO panel is tightest at — and assert the distinction a
 * number cannot carry: that "nobody looked" and "we looked and found none" are different states
 * with different words, and that a count which is not known is not printed as zero.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

/** Reach Design → the floors stage, through the ribbon a user has. */
async function openFloors(page: Page) {
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
  const section = page.getByTestId('floor-families');
  /*
   * Opened by testid, not by its prose.
   *
   * This used to click the first element whose text matched the purpose sentence, and F2 broke
   * it: `ProDesignTab` moved INSIDE the Diseñar stage and now renders above the floor sub-step,
   * so six elements match "slabs, walls" and `.first()` is one of them rather than the summary.
   * Every other spec that reaches this panel already addresses the disclosure directly.
   */
  if (!(await section.isVisible().catch(() => false))) {
    await page.getByTestId('floor-families-disclosure').locator('> summary').click();
  }
  await expect(section).toBeVisible();
}

const tab = (page: Page, fam: string) => page.getByTestId(`floor-family-${fam}`);

test.describe('@smoke a family with no run prints no figure', () => {
  test('the tab shows a dash and a state word, never a zero', async ({ pro: page }) => {
    await openFloors(page);
    for (const fam of ['slabs', 'walls', 'foundations']) {
      const state = await tab(page, fam).getByTestId(`floor-family-${fam}-state`).innerText();
      // Whatever the state is, it is a WORD. The old panel had only a number here.
      expect(state.trim().length, fam).toBeGreaterThan(1);
      // And where no figure can be stated, none is printed.
      const count = tab(page, fam).getByTestId(`floor-family-${fam}-count`);
      const nofig = tab(page, fam).getByTestId(`floor-family-${fam}-nofigure`);
      const hasCount = await count.count();
      const hasNofig = await nofig.count();
      expect(hasCount + hasNofig, `${fam}: exactly one of count/no-figure`).toBe(1);
      if (hasCount) {
        // A printed number must not be the fabricated zero: it only appears once a run exists.
        await expect(page.getByTestId('floor-family-state')).not.toHaveAttribute('data-state', 'notRun');
      }
    }
  });

  test('the state carries a glyph AND a word, so colour is only support', async ({ pro: page }) => {
    await openFloors(page);
    const badge = page.getByTestId('floor-state-badge');
    const text = (await badge.innerText()).trim();
    // Strip the glyph and there must still be a word left.
    expect(text.replace(/[·—○✓✕⚗]/g, '').trim().length).toBeGreaterThan(1);
  });

  test('and it explains WHY there is no figure', async ({ pro: page }) => {
    await openFloors(page);
    const why = page.getByTestId('floor-state-why');
    await expect(why).toBeVisible();
    expect((await why.innerText()).trim().length).toBeGreaterThan(30);
  });
});

test.describe('@smoke scope and next step are stated, not implied', () => {
  test('the scope says there was no run rather than printing a row of zeros',
    async ({ pro: page }) => {
      await openFloors(page);
      const scope = await page.getByTestId('floor-state-scope').innerText();
      // A run that never happened has no classified/designed/refused figures to show.
      expect(scope).not.toMatch(/\b0\b.*\b0\b/);
    });

  test('every state recommends a next action', async ({ pro: page }) => {
    await openFloors(page);
    const next = page.getByTestId('floor-state-next');
    await expect(next).toBeVisible();
    expect((await next.innerText()).trim().length).toBeGreaterThan(10);
  });

  test('the panel distinguishes Design all from Design floors', async ({ pro: page }) => {
    await openFloors(page);
    const vs = page.getByTestId('floor-scope-vs-all');
    await expect(vs).toBeVisible();
    // Both passes named, and what each one leaves alone.
    await expect(vs).toContainText(/frame|pórtico|pilares/i);
    await expect(vs).toContainText(/shell|casca|cáscara/i);
  });
});

test.describe('the state block follows the selected family', () => {
  test('switching tabs changes the state that is described', async ({ pro: page }) => {
    await openFloors(page);
    const shown = async () => page.getByTestId('floor-family-state').getAttribute('data-state');

    await tab(page, 'slabs').click();
    const slabState = await shown();
    await tab(page, 'foundations').click();
    const foundState = await shown();

    // Both are real states, and the block is not stuck on the first family.
    for (const s of [slabState, foundState]) {
      expect(['error', 'notRun', 'noElements', 'skipped', 'designed', 'refused', 'provisional'])
        .toContain(s);
    }
    // A model with no footings and shells present must differ between the two.
    const perFamilyStatesDiffer = slabState !== foundState;
    const bothNoElements = slabState === 'noElements' && foundState === 'noElements';
    expect(perFamilyStatesDiffer || bothNoElements).toBe(true);
  });
});

test.describe('layout and accessibility at 1280×720', () => {
  test('nothing in the panel overflows its width', async ({ pro: page }) => {
    await openFloors(page);
    // Measured, not eyeballed — the same rule PR20's own spec uses for this panel.
    const overflow = await page.getByTestId('floor-families').evaluate((el) => {
      const bad: string[] = [];
      for (const n of [el, ...el.querySelectorAll('*')]) {
        const e = n as HTMLElement;
        if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) {
          bad.push(`${e.tagName}.${e.className}`.slice(0, 60));
        }
      }
      return bad;
    });
    expect(overflow).toEqual([]);
  });

  test('the tabs keep their roles and selected state', async ({ pro: page }) => {
    await openFloors(page);
    for (const fam of ['slabs', 'walls', 'foundations']) {
      await expect(tab(page, fam)).toHaveAttribute('role', 'tab');
    }
    await tab(page, 'walls').click();
    await expect(tab(page, 'walls')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'slabs')).toHaveAttribute('aria-selected', 'false');
  });

  test('the no-figure marker explains itself on hover as well as in the block',
    async ({ pro: page }) => {
      await openFloors(page);
      const nofig = tab(page, 'slabs').getByTestId('floor-family-slabs-nofigure');
      if (await nofig.count()) {
        // A title is not the only explanation — the block below carries it too — but the
        // marker must not be a bare dash with no account of itself.
        expect(await nofig.getAttribute('title')).toBeTruthy();
      }
    });
});

for (const [locale, words] of [
  ['es', { notRun: /sin ejecutar|sin elementos/i, why: /no se corrió|no tiene elementos/i }],
  ['pt', { notRun: /não executado|sem elementos/i, why: /não foi executado|não tem elementos/i }],
] as const) {
  test.describe(`the states are legible in ${locale}`, () => {
    test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });

    test('state word and reason are translated', async ({ pro: page }) => {
      await openFloors(page);
      await expect(page.getByTestId('floor-state-badge')).toContainText(words.notRun);
      await expect(page.getByTestId('floor-state-why')).toContainText(words.why);
    });

    test('the Design-all distinction is translated too', async ({ pro: page }) => {
      await openFloors(page);
      const vs = await page.getByTestId('floor-scope-vs-all').innerText();
      // A cheap tripwire for a key that fell back to English rather than being translated.
      expect(vs).not.toMatch(/^"Design all"/);
      expect(vs.trim().length).toBeGreaterThan(60);
    });
  });
}
