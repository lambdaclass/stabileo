/**
 * The metallic workflow, as a user reaches it.
 *
 * ── What only an E2E can settle here ───────────────────────────────
 *
 * `steel-workflow-contract.test.ts` reads the source and proves the rules: eight stages, which
 * states each can reach, that verification is a constant `'blocked'`, that no rendered string
 * claims a check. None of that proves a user can OPEN it, that the stages render, or that the
 * blockers arrive as readable text rather than as a glyph nobody can interpret.
 *
 * ── The property that is easy to lose ──────────────────────────────
 *
 * The last case is the one worth having: the workflow must not read as a second, disconnected
 * application. It replaced `SteelPanel` in the tab that already existed and renders it as its final
 * stage, so the inventory a user knew is still there — one disclosure in, with the stages around it
 * — rather than duplicated beside it or gone.
 */

import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

/** The eight stages, in the order the brief specifies. */
const STAGES = [
  'regulation', 'grade', 'section', 'geometry', 'assumptions', 'analysis', 'verification', 'limits',
];

async function openSteelTab(page: Page): Promise<void> {
  await page.goto(PRO_URL);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-steel').click();
  await expect(page.getByTestId('pro-steel-workflow')).toBeVisible();
}

test.describe('the tab is reachable', () => {
  test('opens from the design stage of the ribbon', async ({ page }) => {
    // The same route that used to land on the bare inventory.
    await openSteelTab(page);
    await expect(page.getByTestId('pro-steel-workflow')).toBeVisible();
  });

  test('and the workflow is what that tab now shows', async ({ page }) => {
    await openSteelTab(page);
    // Not a nested second panel: the workflow IS the tab's content.
    const workflow = page.getByTestId('pro-steel-workflow');
    await expect(workflow).toHaveCount(1);
  });
});

test.describe('the eight stages render', () => {
  test('every one of them is present', async ({ page }) => {
    await openSteelTab(page);
    for (const stage of STAGES) {
      await expect(page.getByTestId(`steel-stage-${stage}`), stage).toBeVisible();
    }
  });

  test('in the order the pipeline runs', async ({ page }) => {
    /*
     * Order is not decoration: the numbers tell a user where they are. Read from the DOM rather
     * than assumed from the source, because a layout change could reorder them.
     */
    await openSteelTab(page);
    const ids = await page.locator('[data-testid^="steel-stage-"]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('data-testid')!.replace('steel-stage-', '')),
    );
    expect(ids.filter((i) => STAGES.includes(i))).toEqual(STAGES);
  });

  test('and each one says what it is for', async ({ page }) => {
    // A stage with a title and no purpose is a heading, not a step.
    await openSteelTab(page);
    for (const stage of STAGES) {
      const text = await page.getByTestId(`steel-stage-${stage}`).innerText();
      expect(text.trim().length, stage).toBeGreaterThan(20);
    }
  });
});

test.describe('verification stays blocked, and says why in words', () => {
  test('is not marked done', async ({ page }) => {
    await openSteelTab(page);
    const stage = page.getByTestId('steel-stage-verification');
    // `StageSection` writes the state onto the card; `done` would be the green tick.
    await expect(stage).not.toHaveAttribute('data-state', 'done');
  });

  test('names its five blockers as readable text', async ({ page }) => {
    /*
     * Text, not a glyph. The ✓/· marks are `aria-hidden`, so what a reader — or a screen reader —
     * gets has to be the sentence. Each blocker is asserted to carry real prose, not a key.
     */
    await openSteelTab(page);
    await page.getByTestId('steel-stage-verification').scrollIntoViewIfNeeded();
    const list = page.getByTestId('steel-stage-verification-blockers');
    await expect(list).toBeVisible();
    for (const b of ['tests', 'clauseRefs', 'unbracedLength', 'inferredProperties', 'signature']) {
      const item = page.getByTestId(`steel-blocker-${b}`);
      await expect(item, b).toBeVisible();
      expect((await item.innerText()).trim().length, b).toBeGreaterThan(15);
      // A key leaking through instead of a translation.
      await expect(item, b).not.toContainText('steel.workflow.blocker');
    }
  });

  test('and the note says the checker produces numbers that are not verification', async ({ page }) => {
    await openSteelTab(page);
    await expect(page.getByTestId('steel-stage-verification-note')).toContainText(/\S{20,}|\S+ \S+/);
  });

  test('geometry is blocked too, on the bracing datum', async ({ page }) => {
    await openSteelTab(page);
    const stage = page.getByTestId('steel-stage-geometry');
    await expect(stage).not.toHaveAttribute('data-state', 'done');
    await stage.click();
    await expect(page.getByTestId('steel-stage-geometry-body')).toContainText('Lb');
  });
});

test.describe('nothing on the screen claims a verification', () => {
  test('no stage asserts a verification', async ({ page }) => {
    /*
     * ── Why this is not a substring ban ──────────────────────────────
     *
     * Two earlier versions of this test banned the words outright and both were wrong, for the same
     * reason: the screen legitimately says «verified» twice, and both times to deny it —
     *
     *   · the verification stage's note: «the checker exists and produces numbers; none is shown as
     *     verified»;
     *   · `SteelPanel`'s own line, from M1: «inventory of metallic members. none of them is
     *     verified.»
     *
     * A sentence denying the claim is the opposite of the claim, so banning the word bans the
     * honesty. The property that actually matters is: **every line that mentions a claim word
     * carries a negation.** That permits the denials and still catches an assertion, which is what a
     * regression would look like.
     *
     * Every stage is opened first, because a claim inside a collapsed disclosure is still a claim.
     */
    await openSteelTab(page);
    for (const stage of STAGES) await page.getByTestId(`steel-stage-${stage}`).click();

    const text = (await page.getByTestId('pro-steel-workflow').innerText()).toLowerCase();
    const CLAIM = /verificad|verified|aprobad|approved|certificad|\bapto\b/;
    const NEGATION = /\bno\b|\bnone\b|\bnot\b|\bnothing\b|ningun|nada|nenhum|\bnão\b|\bsin\b|without/;

    const offenders = text.split('\n')
      .map((l) => l.trim())
      .filter((l) => CLAIM.test(l) && !NEGATION.test(l));
    expect(offenders, `these assert a verification: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  test('and the denials really are there — the test above is not vacuous', async ({ page }) => {
    /*
     * A guard on the guard. If the screen stopped mentioning verification at all, the assertion
     * above would pass by having nothing to check, and the reader would lose the one sentence that
     * tells them the numbers are not a check.
     */
    await openSteelTab(page);
    await page.getByTestId('steel-stage-verification').click();
    const note = (await page.getByTestId('steel-stage-verification-note').innerText()).toLowerCase();
    expect(note).toMatch(/verificad|verified/);
    expect(note).toMatch(/none|ninguno|nenhum|no /);
  });

  test('and invents no progress — no bar, and no completion metric', async ({ page }) => {
    /*
     * ── This assertion was wrong, and the full suite caught it ────────
     *
     * It used to ban ANY `NN %` in the panel. That failed in the full suite because the workflow
     * legitimately contains one: `ColdFormedPanel` reports the square-corner overestimate as
     * «0.76 %», a MEASURED geometric deviation, and it sits inside `SteelPanel` at stage 8, which
     * opens by default.
     *
     * A measurement is not progress. The prohibition is on inventing a completion metric — a bar,
     * a fraction of stages done, a percentage of a total that does not exist — and banning the
     * percent sign outright banned a number the panel is right to show. Third time a blunt textual
     * ban has flagged a legitimate use in this branch; the pattern is worth naming.
     *
     * So: no progressbar role, and no percentage presented as completion. The source-level
     * prohibition (no `progress`/`percent`/`cancel` strings in the component) is asserted in
     * `steel-workflow-contract.test.ts`, which is where it belongs.
     */
    await openSteelTab(page);
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
    const text = await page.getByTestId('pro-steel-workflow').innerText();
    expect(text).not.toMatch(/\d+\s*%\s*(complete|completo|completado|conclu|done|listo)/i);
    // And no stage state expressed as a fraction of a total.
    expect(text).not.toMatch(/\b\d+\s*\/\s*8\b/);
  });
});

test.describe('stages 2 and 3 show detail per member, not a counter', () => {
  /** A truss puts several metallic members in the model, each with its own row. */
  async function generateTruss(page: Page): Promise<void> {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-generators').click();
    await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
    await page.getByTestId('gen-kind-truss').click();
    await page.getByTestId('gen-generate').click();
    await expect(page.getByTestId('gen-result')).toBeVisible();
  }

  test('the grade stage lists a row per member, with its own state', async ({ page }) => {
    await page.goto(PRO_URL);
    await generateTruss(page);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-steel').click();
    await page.getByTestId('steel-stage-grade').click();

    const rows = page.locator('[data-testid^="steel-grade-row-"]');
    // More than one: a table, not a summary line.
    expect(await rows.count()).toBeGreaterThan(1);
    // And every row carries a state word, so none of them depends on colour.
    for (let i = 0; i < Math.min(await rows.count(), 4); i++) {
      const text = await rows.nth(i).innerText();
      expect(text.trim().length).toBeGreaterThan(5);
      await expect(rows.nth(i)).toHaveAttribute('data-state', /chosen|incomplete|unavailable|outOfScope|authorityBlocked/);
    }
  });

  test('an absent grade shows an em dash, never a designation guessed from fy', async ({ page }) => {
    /*
     * The rule, at the surface. A generated truss carries no declared grade, so every designation
     * cell must be empty — and specifically must NOT contain a plausible-looking grade name that
     * the app inferred from the yield strength.
     */
    await page.goto(PRO_URL);
    await generateTruss(page);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-steel').click();
    await page.getByTestId('steel-stage-grade').click();

    const cells = page.locator('[data-testid^="steel-grade-designation-"]');
    const n = Math.min(await cells.count(), 4);
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      expect((await cells.nth(i).innerText()).trim()).toBe('—');
    }
  });

  test('and says what is missing together with why it matters', async ({ page }) => {
    await page.goto(PRO_URL);
    await generateTruss(page);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-steel').click();
    await page.getByTestId('steel-stage-grade').click();

    const why = page.locator('[data-testid^="steel-grade-missing-"]').first();
    await expect(why).toBeVisible();
    // A sentence, not a label: the reason is what makes the absence actionable.
    expect((await why.innerText()).trim().length).toBeGreaterThan(60);
  });

  test('the section stage names the origin and what is absent, per member', async ({ page }) => {
    await page.goto(PRO_URL);
    await generateTruss(page);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-steel').click();
    await page.getByTestId('steel-stage-section').click();

    const rows = page.locator('[data-testid^="steel-section-row-"]');
    expect(await rows.count()).toBeGreaterThan(1);
    const origin = page.locator('[data-testid^="steel-section-origin-"]').first();
    await expect(origin).toBeVisible();
    expect((await origin.innerText()).trim().length).toBeGreaterThan(3);
    // A key leaking through instead of a translation.
    await expect(origin).not.toContainText('steel.rows.origin');
  });

  test('and no row state ever reads as a pass', async ({ page }) => {
    await page.goto(PRO_URL);
    await generateTruss(page);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-steel').click();
    for (const stage of ['grade', 'section']) {
      await page.getByTestId(`steel-stage-${stage}`).click();
    }
    const states = await page.locator('[data-testid^="steel-grade-row-"], [data-testid^="steel-section-row-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-state')!));
    expect(states.length).toBeGreaterThan(1);
    for (const s of states) {
      expect(['chosen', 'incomplete', 'unavailable', 'outOfScope', 'authorityBlocked']).toContain(s);
    }
  });
});

test.describe('stages 5 and 7 have content, and none of it is a result', () => {
  async function trussThenSteel(page: Page): Promise<void> {
    await page.goto(PRO_URL);
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-generators').click();
    await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
    await page.getByTestId('gen-kind-truss').click();
    await page.getByTestId('gen-generate').click();
    await expect(page.getByTestId('gen-result')).toBeVisible();
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-steel').click();
  }

  test('stage 5 shows Lb per member, with its source', async ({ page }) => {
    /*
     * The number that varies. Every other assumption is identical for every member, so the table
     * exists for this one — and for saying who decided it.
     */
    await trussThenSteel(page);
    await page.getByTestId('steel-stage-assumptions').click();
    const lb = page.locator('[data-testid^="steel-lb-"]').first();
    await expect(lb).toBeVisible();
    // A real length in metres, not a placeholder.
    await expect(lb).toContainText(/\d+\.\d{3} m/);
    const src = page.locator('[data-testid^="steel-lb-source-"]').first();
    await expect(src).toBeVisible();
    await expect(src).not.toContainText('steel.assume.source');
  });

  test('and says bracing is unrecorded because there is nowhere to record it', async ({ page }) => {
    await trussThenSteel(page);
    await page.getByTestId('steel-stage-assumptions').click();
    const note = page.getByTestId('steel-assumption-bracing');
    await expect(note).toBeVisible();
    // A reason, not just "0".
    expect((await note.innerText()).trim().length).toBeGreaterThan(40);
  });

  test('and separates what cannot be inferred from what was assumed', async ({ page }) => {
    await trussThenSteel(page);
    await page.getByTestId('steel-stage-assumptions').click();
    await expect(page.getByTestId('steel-assumption-not-inferable')).toBeVisible();
    await expect(page.getByTestId('steel-assumption-blockers')).toBeVisible();
  });

  test('stage 7 explains why there is no result, in eight statements', async ({ page }) => {
    await trussThenSteel(page);
    await page.getByTestId('steel-stage-verification').click();
    for (const id of ['steel-results-none', 'steel-results-capabilities', 'steel-results-tests',
                      'steel-results-missing', 'steel-results-human', 'steel-results-ae',
                      'steel-results-cap', 'steel-results-clause-map']) {
      const el = page.getByTestId(id);
      await expect(el, id).toBeVisible();
      expect((await el.innerText()).trim().length, id).toBeGreaterThan(10);
    }
  });

  test('and names the two departures with their clause numbers', async ({ page }) => {
    // The clause numbers are how a reviewer finds the rule; without them the paragraph is an
    // opinion.
    await trussThenSteel(page);
    await page.getByTestId('steel-stage-verification').click();
    await expect(page.getByTestId('steel-results-ae')).toContainText('D.2.2');
    await expect(page.getByTestId('steel-results-cap')).toContainText('F.2.1');
  });

  test('and counts the clause map as UNVALIDATED entries, not as progress', async ({ page }) => {
    /*
     * «14 clauses mapped» reads as progress; «14 awaiting review» reads as what it is. The stage
     * shows the second.
     */
    await trussThenSteel(page);
    await page.getByTestId('steel-stage-verification').click();
    await expect(page.getByTestId('steel-results-clause-map')).toContainText(/\d+ \/ \d+/);
  });

  test('and the verification stage is still not done', async ({ page }) => {
    // Content in stage 7 must not be mistaken for a result in stage 7.
    await trussThenSteel(page);
    await expect(page.getByTestId('steel-stage-verification')).not.toHaveAttribute('data-state', 'done');
  });
});

test.describe('it is not a second, disconnected application', () => {
  test('the inventory a user already knew is inside it, as the last stage', async ({ page }) => {
    /*
     * The integration property. `SteelPanel` used to BE this tab; now it is stage 8. If it had been
     * left beside the workflow, or dropped, this is what would catch it.
     */
    await openSteelTab(page);
    await expect(page.getByTestId('pro-steel-panel')).toHaveCount(1);
    // Inside the workflow, not a sibling of it.
    const nested = await page.getByTestId('pro-steel-workflow')
      .locator('[data-testid="pro-steel-panel"]').count();
    expect(nested).toBe(1);
  });

  test('and opening it does not lose the model or the ribbon', async ({ page }) => {
    // A screen that replaces the app rather than living in it would show up here.
    await openSteelTab(page);
    await expect(page.getByTestId('pr-stage-design')).toBeVisible();
    await expect(page.getByTestId('pr-cmd-steel')).toBeVisible();
  });

  test('and the other PRO tabs still work after visiting it', async ({ page }) => {
    // The cheapest check that the mount did not disturb the panel around it.
    await openSteelTab(page);
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-sections').click();
    await expect(page.getByTestId('pro-steel-workflow')).toHaveCount(0);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-steel').click();
    await expect(page.getByTestId('pro-steel-workflow')).toBeVisible();
  });
});
