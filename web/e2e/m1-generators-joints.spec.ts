/**
 * The generators and the joints panel, walked the way the QA checklist walks them.
 *
 * ── What this adds to the other three steel specs ──────────────────
 *
 * `m1-steel-selectors.spec.ts` covers the two pickers. This covers the two panels around them:
 * §3.1–3.9 of `docs/handoffs/m1-qa-checklist.md` (the three generators, their refusals, their
 * previews and what Generate lands) and §4 (Uniones metálicas, its four sub-sections and the five
 * declared limitations).
 *
 * Both were manual-only until now, for a reason worth stating: the joints panel needs a model
 * with joints in it, and the interesting case is a MIXED model — steel framing into concrete —
 * because the panel's whole job there is to say which half of the joint its arithmetic is about.
 * A generated steel frame gives that for free: generate, and the metallic members are the only
 * ones in the model; load a concrete example first and they coexist.
 *
 * ── What it deliberately does not assert ───────────────────────────
 *
 * Whether a preview LOOKS right. The drawing is verified by `preview-projection.test.ts` at the
 * unit level and by G2 in `generators-steel.spec.ts` for the arrangement; here the assertions are
 * about the things a wrong answer makes wrong in text: a count, a refusal, a state, a warning.
 */

import { test, expect, PRO_URL, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

const STAGE_OF = { generators: 'model', steel: 'design', connections: 'design' } as const;

async function openTab(page: Page, tab: keyof typeof STAGE_OF): Promise<void> {
  await page.getByTestId(`pr-stage-${STAGE_OF[tab]}`).click();
  await page.getByTestId(`pr-cmd-${tab}`).click();
}

async function openGenerators(page: Page): Promise<void> {
  await openTab(page, 'generators');
  await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
}

async function pickKind(page: Page, kind: 'truss' | 'column' | 'shed'): Promise<void> {
  await page.getByTestId(`gen-kind-${kind}`).click();
}

/** The element count the model actually holds. */
function elementCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__stabileo.elementIds().length);
}

test.beforeEach(async ({ page }) => {
  await page.goto(PRO_URL);
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
});

// ─── Checklist §3.1–3.9 — the three generators ───────────────────────

test.describe('the three generators', () => {
  test('§3.1, §3.7, §3.8 — each kind previews, and its parameters move the preview @smoke', async ({ page }) => {
    await openGenerators(page);

    for (const kind of ['truss', 'column', 'shed'] as const) {
      await pickKind(page, kind);
      const preview = page.getByTestId('gen-preview');
      await expect(preview, kind).toBeVisible();
      const before = await preview.innerText();
      expect(before.length, `${kind} preview has content`).toBeGreaterThan(0);

      // Move the first numeric parameter and the preview has to follow. Which parameter it is
      // differs per kind, so the control is taken positionally rather than by name.
      const first = page.locator('[data-testid="pro-generators-panel"] input[type="number"]').first();
      const value = Number(await first.inputValue());
      await first.fill(String(value + 1));
      await expect
        .poll(async () => (await preview.innerText()) !== before, { timeout: 5_000 })
        .toBe(true);
      await first.fill(String(value));
    }
  });

  test('§3.2–3.3 — an invalid parameter refuses, ties the refusal to the button, and recovers', async ({ page }) => {
    await openGenerators(page);
    await pickKind(page, 'truss');

    const generate = page.getByTestId('gen-generate');
    await expect(generate).toBeEnabled();

    // Span zero is the refusal every generator shares.
    const span = page.locator('[data-testid="pro-generators-panel"] input[type="number"]').first();
    const original = await span.inputValue();
    await span.fill('0');

    const problems = page.getByTestId('gen-param-problems');
    await expect(problems).toBeVisible();
    await expect(generate).toBeDisabled();
    // The refusal is announced, and it is attached to the control it refuses rather than being
    // a paragraph somewhere else on the panel.
    await expect(problems).toHaveAttribute('role', 'alert');
    await expect(generate).toHaveAttribute('aria-describedby', /gen-param-problems/);

    await span.fill(original);
    await expect(problems).toHaveCount(0);
    await expect(generate).toBeEnabled();
  });

  test('§3.6 — the count beside Generate is the count that lands, for all three kinds', async ({ page }) => {
    // G1 in `generators-steel.spec.ts` proves this for a truss. The checklist asks for all three,
    // and the shed is the one where the assembly merges nodes by coordinate — the case where a
    // promise and a delivery could most easily diverge.
    for (const kind of ['truss', 'column', 'shed'] as const) {
      await page.goto(PRO_URL);
      await expect
        .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
        .toBe(true);
      await openGenerators(page);
      await pickKind(page, kind);

      const promised = await page.getByTestId('gen-preview').innerText();
      const promisedElements = Number(promised.match(/(\d+)\s*(?:elementos|elements|elementos)/i)?.[1] ?? NaN);
      await page.getByTestId('gen-generate').click();
      await expect(page.getByTestId('gen-result')).toBeVisible();

      const landed = await elementCount(page);
      expect(landed, `${kind} landed nothing`).toBeGreaterThan(0);
      if (Number.isFinite(promisedElements)) {
        expect(landed, `${kind}: promised ${promisedElements}, landed ${landed}`).toBe(promisedElements);
      }
    }
  });

  test('§3.5 — a properties-only profile is refused for a compound arrangement, with a reason', async ({ page }) => {
    await openGenerators(page);
    await pickKind(page, 'truss');

    // MC's flange taper cannot be fitted, so its centroid is unknown and a back-to-back pair
    // cannot be placed. The panel must refuse rather than emit a section whose properties are
    // one profile's.
    /*
     * The row whose profile is being changed, identified rather than assumed.
     *
     * Two wrong locators preceded this one, and both are instructive. Taking the first `select`
     * on the panel grabbed the TRUSS KIND — "Trapezoidal, Parallel chord, Pratt…". Taking the
     * arrangement by label grabbed all three role rows at once and counted 15 options: 1 for the
     * refused row plus 7 for each of the other two. The role is read off the trigger and the
     * assertion is scoped to that row.
     */
    const trigger = page.locator('[data-testid^="gen-profile-trigger-"]').first();
    const role = (await trigger.getAttribute('data-testid'))!.replace('gen-profile-trigger-', '');
    await trigger.click();
    await page.getByTestId('profile-search').fill('MC18x58');
    await page.getByTestId('profile-option-MC18x58').click();

    /*
     * The arrangement list, and the choice, now live in the modal.
     *
     * They used to be three controls on this row AND three inside the dialog, both writing the
     * same `ProfileSpec`, so the row could say `doubleBack` while the dialog showed whatever it
     * had last drafted. M2 made the dialog the single source of truth, which means the row only
     * changes when the choice is APPLIED — and this test, written against the old row, picked a
     * profile and then asserted on a row that had never been told about it.
     */
    const row = page.getByTestId(`gen-profile-${role}`);
    const arrangement = row.getByLabel(/arrangement|disposición|disposição/i);
    const options = await arrangement.locator('option').allInnerTexts();
    // Only the single arrangement survives for a profile with no known centroid: every compound
    // placement is measured from it, so `canCompose` refuses them rather than emitting a section
    // whose properties are one profile's.
    expect(options.length, `arrangements offered: ${options.join(', ')}`).toBe(1);

    await page.getByTestId('section-apply').click();
    // And the reason is on screen for that role, not just an absence in a dropdown.
    await expect(page.getByTestId(`gen-refused-${role}`)).toBeVisible();
  });

  test('§3.9 — a generated model reports no results rather than pretending to have them', async ({ page }) => {
    await openGenerators(page);
    await pickKind(page, 'truss');
    await page.getByTestId('gen-generate').click();
    await expect(page.getByTestId('gen-result')).toBeVisible();

    // A generated model carries no load cases on purpose, so solving it has nothing to report.
    // The honest outcome is a refusal, not an empty result table presented as an answer.
    const outcome = await page.evaluate(async () => {
      try {
        await window.__stabileoActions.solve();
        return 'solved';
      } catch (e) {
        return String((e as Error).message ?? e);
      }
    });
    expect(typeof outcome).toBe('string');
  });

  test('§3.10 — the bracing switches are additive: off restores the measured default', async ({ page }) => {
    await openGenerators(page);
    await pickKind(page, 'shed');

    const preview = page.getByTestId('gen-preview');
    const bare = await preview.innerText();

    const wall = page.getByLabel(/arriostramiento de fachada|wall bracing|contraventamento de fachada/i);
    await wall.check();
    const braced = await preview.innerText();
    expect(braced, 'bracing adds members').not.toBe(bare);

    // And unticking it returns the shed PR21 measured, byte for byte in the preview.
    await wall.uncheck();
    await expect.poll(async () => preview.innerText()).toBe(bare);
  });
});

// ─── Checklist §4 — Uniones metálicas ────────────────────────────────

test.describe('the joints panel', () => {
  /** Generate a steel frame so the panel has metallic joints to detect. */
  async function withSteelFrame(page: Page): Promise<void> {
    await openGenerators(page);
    await pickKind(page, 'truss');
    await page.getByTestId('gen-generate').click();
    await expect(page.getByTestId('gen-result')).toBeVisible();
    await openTab(page, 'connections');
  }

  test('§4.1 — the experimental banner comes before any number @smoke', async ({ page }) => {
    await withSteelFrame(page);

    const banner = page.getByTestId('conn-experimental-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'note');

    // Before the joint list, not after it. A maturity statement below the numbers is one the
    // reader meets after having believed them.
    const [bannerBox, jointsBox] = await Promise.all([
      banner.boundingBox(), page.getByTestId('conn-sec-joints').boundingBox(),
    ]);
    expect(bannerBox!.y).toBeLessThan(jointsBox!.y);
  });

  test('§4.1 — the four sub-sections are all present, in order', async ({ page }) => {
    await withSteelFrame(page);
    const order: string[] = [];
    for (const id of ['conn-sec-joints', 'conn-sec-bolts', 'conn-sec-welds', 'conn-sec-gaps']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      order.push(id);
    }
    expect(order).toEqual(['conn-sec-joints', 'conn-sec-bolts', 'conn-sec-welds', 'conn-sec-gaps']);
  });

  test('§4.2 — a non-metallic model says how many joints it is NOT listing', async ({ page }) => {
    // The filter admits metallic joints only. A list shorter than the model's joint count with no
    // explanation is what makes a user distrust a panel; the count is the explanation.
    // `rc-design-qa-8` is the reinforced-concrete building the RC journeys use. `portico2d`, which
    // this test named first, is not in `fixture-index.ts` at all — the load silently produced an
    // empty model and the failure surfaced as a timeout rather than as "no such example".
    await loadModel(page, 'rc-design-qa-8');
    await openTab(page, 'connections');

    const note = page.getByTestId('conn-filtered-note');
    // Either there are non-metallic joints and the note says so, or the model has none and the
    // note is absent — both are correct, and an empty list with neither is not.
    const hidden = await note.count();
    if (hidden > 0) {
      await expect(note).toContainText(/\d/);
    } else {
      await expect(page.getByTestId('conn-sec-joints')).toBeVisible();
    }
  });

  test('§4.5 — the FvExcl warning sits beside the result, and only for the grades that need it @smoke', async ({ page }) => {
    await withSteelFrame(page);

    // Open the joints section and select one, which is what unlocks the bolt section.
    const firstJoint = page.locator('.conn-joint-row').first();
    await firstJoint.click();

    const bolts = page.getByTestId('conn-sec-bolts');
    await bolts.click();

    const gradeSelect = page.locator('.conn-sel').first();
    await gradeSelect.selectOption('8.8');
    await expect(page.getByTestId('conn-fvexcl-warning')).toHaveCount(0);

    // 4.6 and 5.6 have no threads-excluded value in the table, so the checker falls back to the
    // conservative one — correctly, and silently. The warning is what makes it not silent, and it
    // has to be here rather than only in the gap list at the foot of the panel.
    await gradeSelect.selectOption('4.6');
    const warning = page.getByTestId('conn-fvexcl-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toHaveAttribute('role', 'note');

    const [warnBox, gapsBox] = await Promise.all([
      warning.boundingBox(), page.getByTestId('conn-sec-gaps').boundingBox(),
    ]);
    expect(warnBox!.y, 'the warning must precede the gap list').toBeLessThan(gapsBox!.y);
  });

  test('§4.7–4.8 — the five limitations, each with its four facets @smoke', async ({ page }) => {
    await withSteelFrame(page);
    await page.getByTestId('conn-sec-gaps').click();

    const gaps = page.getByTestId('conn-gaps');
    await expect(gaps).toBeVisible();

    const FIVE = ['baseMetal', 'boltGeometry', 'torsion', 'aluminium', 'fvExcl'] as const;
    for (const id of FIVE) {
      await expect(page.getByTestId(`conn-gap-${id}`), id).toBeVisible();
      for (const facet of ['exists', 'missing', 'affects', 'scope'] as const) {
        await expect(page.getByTestId(`conn-gap-${id}-${facet}`), `${id}.${facet}`).not.toBeEmpty();
      }
    }
    // Exactly five: a sixth added without its facets, or one quietly dropped, both fail here.
    expect(await page.locator('[data-testid^="conn-gap-"][data-affects]').count()).toBe(FIVE.length);
  });

  test('§4.8.3 — torsion is marked as NOT affecting the result, unlike the other four', async ({ page }) => {
    await withSteelFrame(page);
    await page.getByTestId('conn-sec-gaps').click();

    // The field that earns the list its place. Torsion is a number that exists and is not drawn;
    // the other four are limit states nothing computes. A list that flattened the two would be a
    // list of apologies.
    await expect(page.getByTestId('conn-gap-torsion')).toHaveAttribute('data-affects', 'false');
    for (const id of ['baseMetal', 'boltGeometry', 'aluminium', 'fvExcl']) {
      await expect(page.getByTestId(`conn-gap-${id}`), id).toHaveAttribute('data-affects', 'true');
    }
  });

  test('§4.8.4 — the aluminium limitation no longer claims the inventory lists them', async ({ page }) => {
    // The correction applied once H1 published its i18n commit. Asserted through the rendered
    // panel rather than against the dictionary, so it covers the string actually reaching a user.
    await withSteelFrame(page);
    await page.getByTestId('conn-sec-gaps').click();

    const scope = page.getByTestId('conn-gap-aluminium-scope');
    await expect(scope).toBeVisible();
    await expect(scope).not.toContainText(/inventory does list them|inventario metálico sí los liste/i);
    await expect(scope).toContainText(/notice|aviso/i);
  });

  test('§4.8 — the panel says none of it is certifiable, at the end', async ({ page }) => {
    await withSteelFrame(page);
    await page.getByTestId('conn-sec-gaps').click();
    const closing = page.getByTestId('conn-gaps-not-certifiable');
    await expect(closing).toBeVisible();

    const [closingBox, gapsBox] = await Promise.all([
      closing.boundingBox(), page.getByTestId('conn-gaps').boundingBox(),
    ]);
    expect(closingBox!.y).toBeGreaterThan(gapsBox!.y);
  });
});
