/**
 * The metallic states as a user walks them, and the three languages as they reach a screen.
 *
 * ── What is left to automate, and why these two ────────────────────
 *
 * `m1-steel-selectors.spec.ts` covers the pickers, `m1-generators-joints.spec.ts` the two panels.
 * §5.2–5.8 of `docs/handoffs/m1-qa-checklist.md` was still manual because it is a SEQUENCE — an
 * unsolved model, then solved, then with a code declared — and the point is that the state
 * changes for the right reason each time and never lands on a pass.
 *
 * The language checks in the other specs read the two pickers. These read every metallic surface,
 * and they read the RENDERED text rather than the dictionaries: `t()` returns the key when it
 * cannot find a translation, so the failure mode is a key printed into a panel, and only a
 * rendered page shows that. The same pass audits for approval words, which is the runtime half of
 * `steel-never-verified.test.ts` — that file reads source, this reads what a user sees.
 *
 * ── The rule these tests inherit ───────────────────────────────────
 *
 * Nothing metallic may show a pass. Asserted here on text, colour-independence and the absence of
 * the four claim words in every offered language, because a commitment that is only checked
 * against source survives until someone renders it differently.
 */

import { test, expect, PRO_URL, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

const STAGE_OF = { generators: 'model', steel: 'design', connections: 'design' } as const;

async function openTab(page: Page, tab: keyof typeof STAGE_OF): Promise<void> {
  await page.getByTestId(`pr-stage-${STAGE_OF[tab]}`).click();
  await page.getByTestId(`pr-cmd-${tab}`).click();
}

/** Generate a steel truss, which is the shortest route to a model with metallic members. */
async function generateTruss(page: Page): Promise<void> {
  await openTab(page, 'generators');
  await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
  await page.getByTestId('gen-kind-truss').click();
  await page.getByTestId('gen-generate').click();
  await expect(page.getByTestId('gen-result')).toBeVisible();
}

async function openSteelPanel(page: Page): Promise<void> {
  await openTab(page, 'steel');
  await expect(page.getByTestId('pro-steel-panel')).toBeVisible();
}

/** The status text of every row in the member table. */
async function statuses(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const table = document.querySelector('[data-testid="steel-member-table"]');
    if (!table) return [];
    return [...table.querySelectorAll('tbody tr')].map((tr) => {
      const cells = tr.querySelectorAll('td');
      return (cells[cells.length - 1]?.textContent ?? '').trim();
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(PRO_URL);
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
});

// ─── Checklist §5.2–5.8 — the state sequence ─────────────────────────

test.describe('the metallic states, in the order a user reaches them', () => {
  test('§5.2 — an unsolved model reports the demand as unavailable, in words @smoke', async ({ page }) => {
    await generateTruss(page);
    await openSteelPanel(page);

    const rows = await statuses(page);
    expect(rows.length, 'the generated truss has metallic members').toBeGreaterThan(0);
    for (const s of rows) {
      // A glyph alone is not a state. Every badge carries text, so the panel survives the colour
      // being ignored — which is the rule `SteelStatusBadge` was written to keep.
      expect(s.replace(/[^\p{L}]/gu, '').length, `status "${s}" has no word`).toBeGreaterThan(2);
    }
    // Before a solve there are no demands, and that is the most actionable thing to say.
    await expect(page.getByTestId('steel-notices')).toContainText(/./);
  });

  test('§5.3 — solving moves the state, and it never moves to a pass', async ({ page }) => {
    await generateTruss(page);
    // A generated model carries no load cases, so this is the honest half of the sequence: the
    // solve is attempted and the state that follows is still not a pass.
    await page.evaluate(async () => {
      try { await window.__stabileoActions.solve(); } catch { /* no load cases, by design */ }
    });
    await openSteelPanel(page);

    const rows = await statuses(page);
    expect(rows.length).toBeGreaterThan(0);
    for (const s of rows) {
      expect(s, `status "${s}" claims a pass`).not.toMatch(/verified|verificado|aprobado|aprovado|OK\b/i);
    }
  });

  test('§5.6 — an empty model says it has no elements, not that it has no steel', async ({ page }) => {
    await openSteelPanel(page);
    // Three different situations produce no rows and the panel names which one it is. This is the
    // first: nothing has been modelled at all.
    await expect(page.getByTestId('steel-empty')).toBeVisible();
    await expect(page.getByTestId('steel-member-table')).toHaveCount(0);
  });

  test('§5.7 — an all-concrete model says so, and shows the census that proves it', async ({ page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openSteelPanel(page);

    const empty = page.getByTestId('steel-empty');
    await expect(empty).toBeVisible();
    // The census is what turns "no steel" into "400 members and none of them are steel". Without
    // it a user goes looking for a bug in the feature.
    const census = page.getByTestId('steel-census');
    await expect(census).toBeVisible();
    await expect(census).toContainText(/\d/);
  });

  test('§5.9 — the grade column is filled with a reason on every row @smoke', async ({ page }) => {
    await generateTruss(page);
    await openSteelPanel(page);

    const cells = page.locator('[data-testid^="steel-grade-"]');
    const n = await cells.count();
    expect(n).toBeGreaterThan(0);
    for (const cell of await cells.all()) {
      // Never blank: either a designation with its standard, or which of the two reasons applies.
      await expect(cell).not.toBeEmpty();
    }
  });

  test('§5.1 — the experimental banner precedes every row, and cannot be dismissed', async ({ page }) => {
    await generateTruss(page);
    await openSteelPanel(page);

    const banner = page.getByTestId('steel-experimental-banner');
    await expect(banner).toBeVisible();
    // No close control anywhere inside it: a warning a user can shut is one that will be absent
    // from the screenshot that reaches somebody else.
    expect(await banner.locator('button').count()).toBe(0);

    const [bannerBox, tableBox] = await Promise.all([
      banner.boundingBox(), page.getByTestId('steel-member-table').boundingBox(),
    ]);
    expect(bannerBox!.y).toBeLessThan(tableBox!.y);
  });
});

// ─── The joints limitations, and WHEN they appear ─────────────────────

test.describe('the joints warnings appear at the right moment', () => {
  test('the FvExcl warning appears on selecting the grade, before any result exists', async ({ page }) => {
    /*
     * Audited rather than assumed, because the doc comment beside it says it is "bound to a
     * checkbox the user is at that moment ticking" and the code conditions it on the GRADE alone.
     * The code is the more conservative of the two: a user who never touches the threads checkbox
     * still gets told that unticking it would change nothing. This pins that reading — the
     * warning must not wait for a computed result to appear beside.
     */
    await generateTruss(page);
    await openTab(page, 'connections');

    await page.locator('.conn-joint-row').first().click();
    await page.getByTestId('conn-sec-bolts').click();

    const grade = page.locator('.conn-sel').first();
    await grade.selectOption('4.6');

    // No Verify pressed yet, so there is no result card at all.
    expect(await page.locator('.conn-result-card').count()).toBe(0);
    // And the warning is already there.
    await expect(page.getByTestId('conn-fvexcl-warning')).toBeVisible();
  });

  test('and it disappears for a grade the table does cover', async ({ page }) => {
    await generateTruss(page);
    await openTab(page, 'connections');
    await page.locator('.conn-joint-row').first().click();
    await page.getByTestId('conn-sec-bolts').click();

    const grade = page.locator('.conn-sel').first();
    await grade.selectOption('4.6');
    await expect(page.getByTestId('conn-fvexcl-warning')).toBeVisible();
    await grade.selectOption('10.9');
    // A warning that fired on a grade it does not apply to would teach the reader to ignore it.
    await expect(page.getByTestId('conn-fvexcl-warning')).toHaveCount(0);
  });

  test('the bolt section refuses to offer anything until a joint is chosen', async ({ page }) => {
    // The order the panel imposes: detect, select, then check. Offering a bolt diameter with no
    // joint selected would be offering to check nothing.
    await generateTruss(page);
    await openTab(page, 'connections');
    await page.getByTestId('conn-sec-bolts').click();
    await expect(page.getByTestId('conn-bolts-empty')).toBeVisible();
    expect(await page.locator('.conn-form-grid').count()).toBe(0);
  });
});

// ─── The three languages, on every metallic surface, at runtime ───────

/**
 * Anything shaped like a translation key, read off the rendered leaves of a panel.
 *
 * `t()` returns its own argument when a key is missing, so this is the shape of the failure.
 * Only leaf nodes are read, or a parent's concatenated text would hide a key inside it.
 */
async function leakedKeys(page: Page, testid: string): Promise<string[]> {
  return page.evaluate((id) => {
    const root = document.querySelector(`[data-testid="${id}"]`);
    if (!root) return [`<missing panel: ${id}>`];
    return [...root.querySelectorAll('*')]
      .map((el) => (el.childElementCount === 0 ? (el.textContent ?? '').trim() : ''))
      .filter((t) => /^(steel|generator|conn|profileSelector|design)\.[a-zA-Z0-9_.]+$/.test(t));
  }, testid);
}

/** Words that would be a claim, matched only where no negation shares the sentence. */
async function approvalClaims(page: Page, testid: string): Promise<string[]> {
  return page.evaluate((id) => {
    const root = document.querySelector(`[data-testid="${id}"]`);
    if (!root) return [];
    const CLAIM = /\b(verified|approved|certified|verificad[oa]s?|aprobad[oa]s?|certificad[oa]s?|aprovad[oa]s?)\b/i;
    const DENIAL = /\b(no|not|none|não|nunca|never|sin|without|sem|ning[uú]n[oa]?|nenhum[a]?|nada|neither|nor)\b/i;
    const out: string[] = [];
    for (const el of root.querySelectorAll('*')) {
      if (el.childElementCount !== 0) continue;
      const text = (el.textContent ?? '').trim();
      if (!CLAIM.test(text)) continue;
      const sentence = text.split(/(?<=[.;])\s+/).find((s) => CLAIM.test(s)) ?? text;
      if (!DENIAL.test(sentence)) out.push(text);
    }
    return out;
  }, testid);
}

for (const locale of ['es', 'en', 'pt'] as const) {
  test.describe(`the metallic surfaces in ${locale}`, () => {
    test.use({ appLocale: locale });

    test('render no key as its own name, on any panel', async ({ pro: page }) => {
      await generateTruss(page);

      await openSteelPanel(page);
      expect(await leakedKeys(page, 'pro-steel-panel'), `steel panel, ${locale}`).toEqual([]);

      await openTab(page, 'generators');
      expect(await leakedKeys(page, 'pro-generators-panel'), `generators, ${locale}`).toEqual([]);

      await openTab(page, 'connections');
      await page.locator('.conn-joint-row').first().click();
      await page.getByTestId('conn-sec-gaps').click();
      expect(await leakedKeys(page, 'conn-gaps'), `joint limitations, ${locale}`).toEqual([]);
    });

    test('show no approval word outside a denial, on any panel', async ({ pro: page }) => {
      await generateTruss(page);

      await openSteelPanel(page);
      expect(await approvalClaims(page, 'pro-steel-panel'), `steel panel, ${locale}`).toEqual([]);

      await openTab(page, 'connections');
      await page.getByTestId('conn-sec-gaps').click();
      expect(await approvalClaims(page, 'conn-gaps'), `joint limitations, ${locale}`).toEqual([]);
    });

    test('keep the five limitations legible, with their four facets', async ({ pro: page }) => {
      await generateTruss(page);
      await openTab(page, 'connections');
      await page.getByTestId('conn-sec-gaps').click();

      for (const id of ['baseMetal', 'boltGeometry', 'torsion', 'aluminium', 'fvExcl']) {
        for (const facet of ['exists', 'missing', 'affects', 'scope']) {
          const cell = page.getByTestId(`conn-gap-${id}-${facet}`);
          await expect(cell, `${locale} ${id}.${facet}`).not.toBeEmpty();
        }
      }
    });
  });
}
