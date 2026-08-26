/**
 * The metallic surface after the visual pass: does it explain itself, and can it be used blind?
 *
 * ── What this covers that `generators-steel.spec.ts` does not ──────
 *
 * That file pins four PROPERTIES the UI must never lose — the count that lands, the section
 * figure, no member shown as verified, an experimental warning that cannot be dismissed. It is
 * deliberately about behaviour and says nothing about whether the surface is usable.
 *
 * This one is about the things the redesign added: every parameter says what it controls and in
 * what unit, a refusal is attached to the control it refuses, the controls are on the design
 * system rather than the browser's defaults, and the whole thing is reachable from a keyboard.
 *
 * ── Why the states are asserted here again ─────────────────────────
 *
 * `S1` already proves no member is shown as verified. This adds the other half: that the four
 * states the engine actually has each render with a GLYPH and a WORD, so the surface stays
 * legible with the colour ignored — and that no fifth, approving state has appeared.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The two metallic tabs live in the ribbon, and not in the same stage.
 *
 * The same two clicks `generators-steel.spec.ts` uses. Reaching them any other way would test a
 * path a user does not have. They shared the Analysis dropdown of the old PRO bar; under the
 * ribbon the generators belong to Model (they draw geometry) and the steel panel to Design
 * (it designs), so each names its own stage.
 */
const STAGE_OF = { generators: 'model', steel: 'design' } as const;

async function openTab(page: Page, tab: 'generators' | 'steel') {
  await page.getByTestId(`pr-stage-${STAGE_OF[tab]}`).click();
  await page.getByTestId(`pr-cmd-${tab}`).click();
}

async function openGenerators(page: Page) {
  await openTab(page, 'generators');
  await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
}

test.describe('@smoke the generators panel explains its parameters', () => {
  test('U1 — every numeric parameter carries a hint naming its unit', async ({ pro: page }) => {
    await openGenerators(page);

    const fields = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="pro-generators-panel"]')!;
      return [...panel.querySelectorAll('input[type="number"]')].map((el) => {
        const id = el.getAttribute('aria-describedby');
        const hint = id ? document.getElementById(id) : null;
        return {
          describedBy: id,
          hint: (hint?.textContent ?? '').trim(),
        };
      });
    });

    expect(fields.length, 'the panel has numeric parameters').toBeGreaterThan(3);
    for (const f of fields) {
      expect(f.describedBy, 'the field points at its own explanation').toBeTruthy();
      expect(f.hint.length, `the explanation is not empty (${f.describedBy})`).toBeGreaterThan(15);
    }
  });

  test('U2 — a refused parameter set says so, and the refusal is tied to the button', async (
    { pro: page },
  ) => {
    await openGenerators(page);

    // A span of zero is not a truss. The engine's own validator decides that, not this test.
    const span = page.locator('input[aria-describedby="gen-hint-span"]').first();
    await span.fill('0');
    await span.blur();

    const problems = page.getByTestId('gen-param-problems');
    await expect(problems, 'the refusal is on the page').toBeVisible();
    await expect(problems).toHaveAttribute('role', 'alert');

    const generate = page.getByTestId('gen-generate');
    await expect(generate).toBeDisabled();
    // The reason is read WITH the button, not left somewhere above it.
    await expect(generate).toHaveAttribute('aria-describedby', 'gen-param-problems');
  });

  test('U3 — the refusal is recoverable: a valid value clears it', async ({ pro: page }) => {
    await openGenerators(page);
    const span = page.locator('input[aria-describedby="gen-hint-span"]').first();
    await span.fill('0');
    await expect(page.getByTestId('gen-param-problems')).toBeVisible();

    await span.fill('12');
    await expect(page.getByTestId('gen-param-problems')).toHaveCount(0);
    await expect(page.getByTestId('gen-generate')).toBeEnabled();
  });
});

test.describe('@smoke the metallic surface is on the design system', () => {
  test('U4 — no control is left to the browser to paint', async ({ pro: page }) => {
    await openGenerators(page);

    const offSystem = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="pro-generators-panel"]')!;
      const out: string[] = [];
      // Checkboxes are excluded on purpose: a checkbox the browser paints is the one users
      // recognise, and giving it a custom background usually makes it worse, not more on-system.
      for (const el of panel.querySelectorAll(
        'button, select, input:not([type="checkbox"]):not([type="radio"])')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(el);
        const bare = cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.borderTopWidth === '0px';
        if (bare || cs.backgroundColor === 'rgb(255, 255, 255)') {
          out.push(`${el.tagName.toLowerCase()} ${el.getAttribute('data-testid') ?? ''}`.trim());
        }
      }
      return out;
    });
    expect(offSystem).toEqual([]);
  });

  test('U5 — the panel is reachable from the keyboard, with a visible ring', async (
    { pro: page },
  ) => {
    await openGenerators(page);
    const bad: string[] = [];
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.closest('[data-testid="pro-generators-panel"]')) return null;
        const cs = getComputedStyle(el);
        const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        return { id: el.getAttribute('data-testid') ?? el.tagName.toLowerCase(), ok: ring };
      });
      if (!stop) continue;
      seen += 1;
      if (!stop.ok && !bad.includes(stop.id)) bad.push(stop.id);
    }
    expect(seen, 'the sweep reached the panel by keyboard').toBeGreaterThan(3);
    expect(bad).toEqual([]);
  });

  test('U6 — nothing overflows the panel at 1280x720', async ({ pro: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openGenerators(page);
    const over = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="pro-generators-panel"]') as HTMLElement;
      return p.scrollWidth - p.clientWidth;
    });
    expect(over).toBeLessThanOrEqual(1);
  });
});

test.describe('@smoke metallic states stay honest', () => {
  test('U7 — every status renders a glyph AND a word, and none of them approves', async (
    { pro: page },
  ) => {
    /**
     * An empty model short-circuits the panel at `steelStore.isEmpty`, leaving ZERO badges —
     * and a loop over zero badges asserts nothing. Generate a truss first, so the loop below
     * reads the states it exists to check, and guard the count so it can never go vacuous.
     */
    await openTab(page, 'generators');
    await page.getByTestId('gen-generate').click();
    await expect(page.getByTestId('gen-result')).toBeVisible();

    await openTab(page, 'steel');
    const panel = page.getByTestId('pro-steel-panel');
    await expect(panel).toBeVisible();

    const text = (await panel.innerText()).toLowerCase();

    /**
     * The claim is about APPROVAL, not about the word.
     *
     * A first version of this forbade "verified" outright and failed on the panel's own
     * `NOT_DESIGNED` label — "not verified" is one of the four states the surface is REQUIRED to
     * be able to say. Forbidding the word would have pushed the UI towards a vaguer one, which is
     * the opposite of the point.
     *
     * So: these phrases claim a passing result and may never appear at all…
     */
    for (const forbidden of ['approved', 'aprobado', 'certified', 'certificado',
      'ready for construction', 'apto para construcción', 'listo para construcción']) {
      expect(text, `the metallic surface must never say "${forbidden}"`).not.toContain(forbidden);
    }

    /**
     * …and the STATES are checked on the badges, not in the prose.
     *
     * A first version scanned the panel's text for "verified" inside a small window of preceding
     * words, looking for a negation. It failed on the panel's own sentence "none of them is
     * verified" — the negation was three words back. Widening the window is a losing game: prose
     * can negate from anywhere, and a regex that keeps up with it is a regex nobody can read.
     *
     * The claim was never about the prose. It is that no MEMBER is presented in a passing state,
     * and members carry their state in a badge. So the badges are what gets read.
     */
    const badgeLoc = page.locator('[data-testid^="steel-status-"]');
    const n = await badgeLoc.count();
    expect(n, 'the badge loop must read a non-empty set of member states').toBeGreaterThan(0);
    const badges = await badgeLoc.allInnerTexts();
    for (const b of badges) {
      const lower = b.toLowerCase();
      for (const passing of ['verified', 'verificado', 'ok', 'approved', 'aprobado']) {
        expect(lower.split(/\s+/), `a member badge reads "${b}"`).not.toContain(passing);
      }
      // Glyph AND word: the state survives the colour being ignored.
      expect(b.trim().length, 'a status badge carries text, not only a glyph').toBeGreaterThan(2);
    }
  });
});

/**
 * Language is chosen through the fixture, not through a picker.
 *
 * The header language `<select>` is PR20's and is not on this branch, so a test that clicked it
 * would be testing a control that does not exist here. `test.use({ appLocale })` is the path
 * `fixtures.ts` documents for exactly this.
 */
test.describe('the generators panel explains itself in English', () => {
  test.use({ appLocale: 'en' });
  test('U8 en — the parameter hints are localised', async ({ pro: page }) => {
    await openGenerators(page);
    await expect(page.locator('#gen-hint-span')).toContainText('metres');
  });
});

test.describe('the generators panel explains itself in Spanish', () => {
  test.use({ appLocale: 'es' });
  test('U8 es — the parameter hints are localised', async ({ pro: page }) => {
    await openGenerators(page);
    await expect(page.locator('#gen-hint-span')).toContainText('metros');
  });
});

/**
 * The reminder fired, and this is the answer to it.
 *
 * This block used to assert that `pt` rendered ENGLISH, because the steel namespace shipped
 * `en` and `es` only. It said in as many words that the day a `steel/pt.ts` landed it would
 * fail, and whoever added it was to come here and assert the real string. `steel/pt.ts` landed
 * when #125 and #132 were integrated — #125 narrowed the picker to es/en/pt and requires every
 * PRO key in all three — so the expectation is replaced rather than relaxed.
 *
 * The word asserted is `vão`, not `metros`. Both Portuguese and Spanish say "metros", so
 * `metros` would pass against the Spanish dictionary and prove only that it is not English.
 * Spanish says «luz» where Portuguese says "vão", so this is the assertion that can tell the
 * two apart — which is the whole point of testing a third language.
 */
test.describe('the generators panel explains itself in Portuguese', () => {
  test.use({ appLocale: 'pt' });
  test('U8 pt — the parameter hints are localised, not falling back', async (
    { pro: page },
  ) => {
    await openGenerators(page);
    await expect(page.locator('#gen-hint-span')).toContainText('vão');
    await expect(page.locator('#gen-hint-span')).not.toContainText('metres');
  });
});
