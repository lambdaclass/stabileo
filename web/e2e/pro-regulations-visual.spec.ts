/**
 * Project regulations: the section that looked like a different program.
 *
 * ── What was wrong, and why each is testable ───────────────────────
 *
 * Every defect was a token that was never used, and each leaves a measurable trace:
 *
 * - `select` and `input` carried nothing but padding, so the browser painted them white on a dark
 *   panel. Measured as a computed background that is not the page's own.
 * - `h3` was 0.95rem inside a section whose stage title is 0.85rem — the section's own title was
 *   visually SMALLER than the text inside it. Measured as two font sizes.
 * - Nine `opacity: 0.75…0.85` stood in for text colour, so "dimmer" was the only hierarchy.
 * - Not one `:focus-visible` rule existed in the file. Measured by focusing and reading the
 *   outline the browser actually paints.
 * - `.role-name { min-width: 11rem }` plus `select { min-width: 15rem }` is 26rem of un-shrinkable
 *   content in a panel about 34rem wide, and the advanced disclosure was indented a further
 *   11.4rem on top. Measured as `scrollWidth > clientWidth`.
 * - `@media (max-width: 820px)` asked the WINDOW while the panel is ~540px, so the stacked
 *   fallback never fired where it was needed.
 *
 * The overflow test runs in all three languages, because the German-length problem in this app is
 * Portuguese: `regulations.rolePurpose.*` is a sentence per role and the longest of them decide
 * whether the row fits.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function openRegulations(page: Page) {
  const d = page.getByTestId('code-settings-disclosure');
  if (await d.getAttribute('open') === null) await d.locator('> summary').click();
  await expect(page.getByTestId('project-regulations')).toBeVisible();
}

test.describe('@smoke Project regulations is on the Stabileo visual system', () => {
  test('G1 — no control is painted by the browser instead of by us', async ({ pro: page }) => {
    await openRegulations(page);

    const controls = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="project-regulations"]')!;
      return [...root.querySelectorAll('select, input[type="text"], button')].map((el) => {
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          background: cs.backgroundColor,
          border: cs.borderTopWidth,
          color: cs.color,
        };
      });
    });

    expect(controls.length, 'the section has controls').toBeGreaterThan(3);
    for (const c of controls) {
      // White (or transparent-over-white) is the browser default this section used to show.
      expect(c.background, `${c.tag} is not a default white control`)
        .not.toBe('rgba(0, 0, 0, 0)');
      expect(c.background, `${c.tag} is not white`).not.toBe('rgb(255, 255, 255)');
      expect(c.border, `${c.tag} carries a border of ours`).not.toBe('0px');
    }
  });

  test('G2 — the stage title is never smaller than the text inside it', async ({ pro: page }) => {
    await openRegulations(page);

    const sizes = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="code-settings-disclosure"]')!;
      const title = stage.querySelector(':scope > summary .title')
        ?? stage.querySelector(':scope > summary');
      const body = document.querySelector('[data-testid="project-regulations"]')!;
      const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
      const inner = [...body.querySelectorAll('*')]
        .filter((el) => el.textContent && el.textContent.trim().length > 0)
        .map(px);
      return { title: px(title!), maxInner: Math.max(...inner) };
    });

    expect(sizes.maxInner, 'nothing inside the section outranks its own title')
      .toBeLessThanOrEqual(sizes.title);
  });

  test('G3 — every control takes a visible focus ring from the keyboard', async ({ pro: page }) => {
    await openRegulations(page);

    for (const id of ['regs-jurisdiction', 'regs-adoption', 'role-select-concrete']) {
      const outline = await page.getByTestId(id).evaluate((el) => {
        (el as HTMLElement).focus();
        const cs = getComputedStyle(el);
        return { width: cs.outlineWidth, style: cs.outlineStyle };
      });
      expect(outline.style, `${id} shows a focus ring`).not.toBe('none');
      expect(parseFloat(outline.width), `${id}'s ring is visible`).toBeGreaterThan(0);
    }
  });

  test('G4 — each role states what it decides and what is in force', async ({ pro: page }) => {
    await openRegulations(page);
    // The selector was a bare noun. A role now carries a purpose, and a bound one its value.
    await expect(page.getByTestId('role-purpose-concrete')).toBeVisible();
    expect((await page.getByTestId('role-purpose-concrete').innerText()).trim().length)
      .toBeGreaterThan(20);
    await expect(page.getByTestId('role-value-concrete')).toBeVisible();
  });

  test('G5 — the title is not printed twice', async ({ pro: page }) => {
    await openRegulations(page);
    // `StageSection` already prints it above. The in-panel copy is kept for the landmark and
    // hidden, so a screen reader still has a target and the eye sees it once.
    const visible = await page.evaluate(() => {
      const h = document.querySelector('#regs-title') as HTMLElement | null;
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(visible, 'the heading still exists for aria-labelledby').not.toBeNull();
    expect(visible!.w * visible!.h, 'and it does not repeat the stage title on screen')
      .toBeLessThan(100);
  });
});

test.describe('Project regulations fits the panel in the three languages', () => {
  for (const locale of ['en', 'es', 'pt'] as const) {
    test(`G6 ${locale} — nothing overflows the panel horizontally at 1280x720`, async (
      { pro: page },
    ) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.getByTestId('lang-select').selectOption(locale);
      await openRegulations(page);
      // Open the advanced disclosure too: it used to be indented 11.4rem past a 26rem row.
      const adv = page.getByTestId('role-concrete').locator('details.advanced > summary');
      if (await adv.count() > 0) await adv.first().click();

      const overflow = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="project-regulations"]') as HTMLElement;
        const panel = document.querySelector('.rc-workflow') as HTMLElement;
        return {
          section: root.scrollWidth - root.clientWidth,
          panel: panel.scrollWidth - panel.clientWidth,
        };
      });

      expect(overflow.section, 'the section fits its own box').toBeLessThanOrEqual(1);
      expect(overflow.panel, 'and the panel does not scroll sideways').toBeLessThanOrEqual(1);
    });
  }
});
