/**
 * One product, or four? A sweep over every control in the PRO right panel.
 *
 * ── Why a sweep and not another per-section test ───────────────────
 *
 * Points 2 and 5 fixed Project regulations and the detailing panel by hand, and each got its own
 * spec. That leaves the same class of defect free to survive in every section nobody happened to
 * open — and it did: `FloorFamiliesPanel` and `FoundationsPanel` declared
 * `button { font: inherit; cursor: pointer }` as their entire button style, so Chrome painted
 * them white on a dark panel, and `DesignFamilyPanel` used a hardcoded blue that appears nowhere
 * else in PRO plus two variables outside the `--st-*` system, each with a hex fallback that would
 * silently win if the variable were ever undefined.
 *
 * A per-section test would have to be written once per section, forever. This walks whatever is
 * on screen, so a section added tomorrow is covered the day it appears.
 *
 * ── What it deliberately does not check ────────────────────────────
 *
 * Not "is this pretty". Four properties that are objectively wrong when they are wrong: a control
 * the browser styled instead of us, a control with no accessible name, a focus ring that does not
 * exist, and content wider than the panel that holds it.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/** Open every stage, so the sweep sees the whole panel rather than three closed summaries. */
async function openEverything(page: Page) {
  for (const id of [
    'design-overview-disclosure', 'code-settings-disclosure',
    'floor-families-disclosure', 'detailing-disclosure', 'documents-disclosure',
  ]) {
    const d = page.getByTestId(id);
    if (await d.count() === 0) continue;
    if (await d.getAttribute('open') === null) await d.locator('> summary').click();
  }
}

interface Control {
  testid: string;
  tag: string;
  text: string;
  bg: string;
  border: string;
  name: string;
}

async function controls(page: Page): Promise<Control[]> {
  return page.evaluate(() => {
    const panel = document.querySelector('.rc-workflow');
    if (!panel) return [];
    const out: Control[] = [];
    for (const el of panel.querySelectorAll('button, select, input[type="text"], textarea')) {
      const r = el.getBoundingClientRect();
      // Only what is actually on screen: a control inside a closed disclosure is not a defect.
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      out.push({
        testid: el.getAttribute('data-testid') ?? `<${el.tagName.toLowerCase()}>`,
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? '').trim(),
        bg: cs.backgroundColor,
        border: cs.borderTopWidth,
        name: (el.getAttribute('aria-label') ?? el.getAttribute('title')
          ?? (el as HTMLInputElement).placeholder ?? (el.textContent ?? '')).trim(),
      });
    }
    return out;
  });
}

test.describe('@smoke the PRO panel reads as one product', () => {
  test('C1 — no control is left to the browser to paint', async ({ pro: page }) => {
    await openEverything(page);
    const found = await controls(page);
    expect(found.length, 'the sweep found controls').toBeGreaterThan(10);

    const offSystem = found.filter((c) =>
      // Transparent is fine only when the control also carries a border of ours; a control with
      // neither is the untouched UA default this test exists for.
      (c.bg === 'rgba(0, 0, 0, 0)' && c.border === '0px')
      || c.bg === 'rgb(255, 255, 255)');

    expect(offSystem.map((c) => `${c.testid} (${c.tag}, bg=${c.bg}, border=${c.border})`))
      .toEqual([]);
  });

  test('C2 — every control has a name a screen reader can read', async ({ pro: page }) => {
    await openEverything(page);
    const found = await controls(page);
    const unnamed = found.filter((c) => c.name.length === 0);
    expect(unnamed.map((c) => `${c.testid} (${c.tag})`)).toEqual([]);
  });

  test('C3 — every control takes a focus ring from the KEYBOARD', async ({ pro: page }) => {
    await openEverything(page);

    /**
     * Tabbed, not focused from script — and that distinction is the test.
     *
     * The first version of this called `el.focus()` on each control and reported 26 failures,
     * including controls this pass had just given an explicit `:focus-visible` rule. Chromium does
     * not match `:focus-visible` for a programmatic focus on a button: the pseudo-class exists
     * precisely to tell a mouse click apart from a keyboard stop. So the script was measuring its
     * own method, not the product. (Project regulations' G3 passed only because `<select>` and
     * `<input type=text>` DO match on programmatic focus — the same bug, hidden by the element.)
     *
     * Tab is what a keyboard user presses, so Tab is what this presses.
     */
    const bad: string[] = [];
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        if (!el.closest('.rc-workflow')) return { inPanel: false, id: '', ok: true };
        const cs = getComputedStyle(el);
        const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        // A visible box-shadow is an acceptable ring too; some controls use one.
        const shadow = cs.boxShadow !== 'none';
        return {
          inPanel: true,
          id: el.getAttribute('data-testid') ?? `<${el.tagName.toLowerCase()}>`,
          ok: ring || shadow,
        };
      });
      if (!stop || !stop.inPanel) continue;
      seen += 1;
      if (!stop.ok && !bad.includes(stop.id)) bad.push(stop.id);
    }

    expect(seen, 'the sweep reached the panel by keyboard').toBeGreaterThan(5);
    expect(bad).toEqual([]);
  });

  test('C4 — no section is wider than the panel that holds it', async ({ pro: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openEverything(page);

    const wide = await page.evaluate(() => {
      const panel = document.querySelector('.rc-workflow') as HTMLElement;
      const out: { id: string; over: number }[] = [];
      for (const el of panel.querySelectorAll('[data-testid]')) {
        const h = el as HTMLElement;
        const over = h.scrollWidth - h.clientWidth;
        // A container that scrolls itself on purpose — a wide table, the schedule — is allowed.
        const cs = getComputedStyle(h);
        const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
        if (over > 1 && !scrolls) out.push({ id: h.getAttribute('data-testid')!, over });
      }
      return { out, panelOver: panel.scrollWidth - panel.clientWidth };
    });

    expect(wide.panelOver, 'the panel itself never scrolls sideways').toBeLessThanOrEqual(1);
    expect(wide.out).toEqual([]);
  });
});

test.describe('the PRO panel is consistent across the three languages', () => {
  for (const locale of ['en', 'es', 'pt'] as const) {
    test(`C5 ${locale} — nothing overflows and nothing is left untranslated`, async (
      { pro: page },
    ) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.getByTestId('lang-select').selectOption(locale);
      await openEverything(page);

      const panelOver = await page.evaluate(() => {
        const p = document.querySelector('.rc-workflow') as HTMLElement;
        return p.scrollWidth - p.clientWidth;
      });
      expect(panelOver, 'no horizontal overflow in this language').toBeLessThanOrEqual(1);

      /**
       * A missing key renders as the key itself, which is the one translation defect a test can
       * catch without a dictionary: `design.families.state.notRun` on screen is unmistakable and
       * is exactly what a role list with a wrong key produced during this pass.
       */
      const raw = await page.evaluate(() => {
        const p = document.querySelector('.rc-workflow')!;
        return (p.textContent ?? '').match(/\b[a-z][a-zA-Z]+(\.[a-zA-Z][a-zA-Z0-9]+){2,}\b/g) ?? [];
      });
      expect(raw, 'no untranslated key is showing').toEqual([]);
    });
  }
});
