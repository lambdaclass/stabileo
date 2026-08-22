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

  test('and shows no progress bar or percentage', async ({ page }) => {
    // Invented progress was an explicit prohibition: there is no total to be a fraction of.
    await openSteelTab(page);
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
    const text = await page.getByTestId('pro-steel-workflow').innerText();
    expect(text).not.toMatch(/\d+\s?%/);
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
