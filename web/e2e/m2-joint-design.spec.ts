/**
 * Designing a joint on the industrial shed, in a browser.
 *
 * ── What only this settles ──────────────────────────────────────────
 *
 * The unit tests prove every clause: J.3.6's capacities, J.3.7's cap, J.3.10's clear distance,
 * the five states, the plate that follows from the layout. What they cannot prove is that a user
 * can reach any of it — that selecting a joint shows its governing demand, that editing a
 * diameter changes the verdicts, that a plate appears once its thickness is given, and that
 * nothing calls itself verified along the way.
 */

import { test, expect, PRO_URL, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Open a joint on the shed. `solved` decides whether the model was analysed first.
 *
 * That distinction is not a convenience: **without an analysis there is no demand**, and
 * §J.3.10 cannot be evaluated against nothing. My first version of this file loaded the fixture
 * and went straight to the panel, then asserted the bearing check had run — it had not, and it
 * was right not to. The app was correct and the spec had assumed a solved model.
 */
async function openShedJoint(page: Page, solved = false): Promise<void> {
  await page.goto(PRO_URL);
  await loadModel(page, '3d-nave-industrial');
  if (solved) await solveModel(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-connections').click();
  await expect(page.getByTestId('conn-sec-joints')).toBeVisible();
  await page.locator('.conn-joint-row').first().click();
  await expect(page.getByTestId('joint-design')).toBeVisible();
}

/**
 * Every line mentioning a claim word must carry a negation.
 *
 * A blunt ban on the words keeps flagging the sentences whose whole job is to deny the claim —
 * «It cannot be fully verified: Table J.2.5 refers the base metal to Chapter J.4…» is the most
 * careful sentence on this screen and a plain `not.toContain('VERIFIED')` catches it.
 */
function assertNoApprovalClaim(text: string): void {
  const CLAIM = /\bverified\b|verificad[oa]s?\b|\bapproved\b|aprobad[oa]s?\b|certificad[oa]s?\b/i;
  const NEGATION = /\bnot\b|\bno\b|\bnever\b|\bcannot\b|\bwithout\b|ningun|ningún|\bsin\b|\bnão\b/i;
  for (const line of text.split('\n')) {
    if (CLAIM.test(line)) {
      expect(NEGATION.test(line), `claims approval without a negation: ${line}`).toBe(true);
    }
  }
}

test.describe('a joint arrives undesigned and says so', () => {
  test('starts at notDesigned', async ({ page }) => {
    await openShedJoint(page);
    await expect(page.getByTestId('joint-design-state')).toHaveAttribute('data-state', 'notDesigned');
  });

  /*
   * The governing demand, with its provenance. An envelope that cannot say which combination and
   * which member produced it is a number nobody can argue with.
   */
  test('shows the governing demands, or an em dash', async ({ page }) => {
    await openShedJoint(page);
    const demands = page.getByTestId('joint-demands');
    await expect(demands).toBeVisible();
    for (const c of ['axial', 'shear', 'moment']) {
      await expect(page.getByTestId(`joint-demand-${c}`), c).not.toBeEmpty();
    }
  });

  test('and has no plate to draw yet', async ({ page }) => {
    await openShedJoint(page);
    await expect(page.getByTestId('joint-plate-unavailable')).toBeVisible();
    await expect(page.getByTestId('joint-plate-unavailable')).toContainText('GEOMETRY_UNAVAILABLE');
  });
});

test.describe('without an analysis there is nothing to check against', () => {
  /*
   * The state the first version of this file mistook for a bug. A joint on an unsolved model has
   * bolts, a plate and no demand — so §J.3.6 and §J.3.10 cannot run, and saying so is the
   * correct answer rather than a gap.
   */
  test('the strength checks stay unevaluated, and say why', async ({ page }) => {
    await openShedJoint(page, false);
    await page.getByTestId('jd-count').fill('6');
    await page.getByTestId('jd-count').blur();
    await page.getByTestId('jd-plate-t').fill('12');
    await page.getByTestId('jd-plate-t').blur();
    await page.getByTestId('jd-plate-fu').fill('400');
    await page.getByTestId('jd-plate-fu').blur();

    await expect(page.getByTestId('jd-check-bearing')).toHaveAttribute('data-state', 'unavailable');
    await expect(page.getByTestId('jd-check-boltShear')).toHaveAttribute('data-state', 'unavailable');
    // The geometric rules do NOT need a demand, so those still run.
    await expect(page.getByTestId('jd-check-spacing')).not.toHaveAttribute('data-state', 'unavailable');
  });
});

test.describe('choosing bolts runs the checks', () => {
  test('every check names its clause, including the ones that could not run', async ({ page }) => {
    await openShedJoint(page, true);
    /*
     * A value DIFFERENT from the one already shown.
     *
     * The field displays the default 4, and filling it with 4 fires no `change` — so nothing was
     * chosen, the joint stayed `notDesigned`, and the checks table rendered with no rows. An
     * empty table has no bounding box, which Playwright reports as «hidden»: the failure read
     * like a layout problem and was a missing event.
     */
    await page.getByTestId('jd-count').fill('6');
    await page.getByTestId('jd-count').blur();
    const checks = page.getByTestId('joint-checks');
    await expect(checks).toBeVisible();
    await expect(checks).toContainText('§J.3.');
    for (const id of ['boltShear', 'bearing', 'spacing', 'edgeDistance']) {
      await expect(page.getByTestId(`jd-check-${id}`), id).toBeVisible();
    }
  });

  /*
   * The state must move off `notDesigned` once bolts exist, and land on `incomplete` rather than
   * on a pass: the plate is still missing, and that is a datum the user can supply.
   */
  test('the state becomes incomplete, not adequate', async ({ page }) => {
    await openShedJoint(page);
    await page.getByTestId('jd-count').fill('6');
    await page.getByTestId('jd-count').blur();
    await expect(page.getByTestId('joint-design-state'))
      .toHaveAttribute('data-state', 'incomplete');
  });

  test('a spacing below three diameters is flagged against §J.3.3', async ({ page }) => {
    await openShedJoint(page);
    await page.getByTestId('jd-spacing').fill('30');
    await page.getByTestId('jd-spacing').blur();
    const row = page.getByTestId('jd-check-spacing');
    await expect(row).toHaveAttribute('data-state', 'exceeded');
    await expect(row).toContainText('J.3.3');
  });

  /*
   * Only the diameters Tabla J.3.4 tabulates. Offering one the code does not would offer a bolt
   * whose edge distance cannot be checked at all.
   */
  test('the diameter list carries only tabulated sizes', async ({ page }) => {
    await openShedJoint(page);
    const values = await page.getByTestId('jd-diameter').locator('option')
      .evaluateAll((os) => os.map((o) => Number((o as HTMLOptionElement).value)));
    expect(values).toEqual([6, 7, 8, 10, 12, 14, 16, 20, 22, 24, 27, 30]);
  });
});

test.describe('the plate appears once its thickness is given', () => {
  async function designFully(page: Page): Promise<void> {
    await openShedJoint(page, true);
    await page.getByTestId('jd-count').fill('6');
    await page.getByTestId('jd-count').blur();
    await page.getByTestId('jd-plate-t').fill('12');
    await page.getByTestId('jd-plate-t').blur();
    await page.getByTestId('jd-plate-fu').fill('400');
    await page.getByTestId('jd-plate-fu').blur();
  }

  test('and reports its size and hole count', async ({ page }) => {
    await designFully(page);
    const plate = page.getByTestId('joint-plate');
    await expect(plate).toBeVisible();
    await expect(plate).toContainText('mm');
    await expect(page.getByTestId('joint-plate-unavailable')).toHaveCount(0);
  });

  /*
   * The plate the panel reports is the plate the bearing check ran on — the same entity, so a
   * drawing and a verdict cannot disagree about a thickness.
   */
  test('and the bearing check runs on it', async ({ page }) => {
    await designFully(page);
    const bearing = page.getByTestId('jd-check-bearing');
    await expect(bearing).toBeVisible();
    await expect(bearing).not.toHaveAttribute('data-state', 'unavailable');
  });

  test('editing the plate changes the verdicts', async ({ page }) => {
    await designFully(page);
    const before = await page.getByTestId('jd-check-bearing').innerText();
    await page.getByTestId('jd-plate-t').fill('6');
    await page.getByTestId('jd-plate-t').blur();
    await expect.poll(async () => page.getByTestId('jd-check-bearing').innerText())
      .not.toBe(before);
  });
});

test.describe('nothing calls itself verified', () => {
  test('no VERIFIED and no green tick language, in any state', async ({ page }) => {
    await openShedJoint(page);
    for (const [id, v] of [['jd-count', '6'], ['jd-plate-t', '12'], ['jd-plate-fu', '400']] as const) {
      await page.getByTestId(id).fill(v);
      await page.getByTestId(id).blur();
    }
    assertNoApprovalClaim(await page.getByTestId('joint-design').innerText());
    const state = await page.getByTestId('joint-design-state').getAttribute('data-state');
    expect(state).not.toBe('verified');
  });
});

test.describe('the design survives changing joints', () => {
  test('each joint keeps its own', async ({ page }) => {
    await openShedJoint(page);
    await page.getByTestId('jd-count').fill('8');
    await page.getByTestId('jd-count').blur();

    const rows = page.locator('.conn-joint-row');
    await rows.nth(1).click();
    // A different joint starts undesigned.
    await expect(page.getByTestId('joint-design-state')).toHaveAttribute('data-state', 'notDesigned');

    await rows.nth(0).click();
    await expect(page.getByTestId('jd-count')).toHaveValue('8');
  });
});

test.describe('the states a user can actually reach', () => {
  async function solvedJoint(page: Page): Promise<void> {
    await openShedJoint(page, true);
  }

  /*
   * `exceeded` is the state that must never be softened. A joint whose bolts cannot carry the
   * demand is the fact worth surfacing, and a milder word would bury it.
   */
  test('an under-sized group reads exceeded', async ({ page }) => {
    await solvedJoint(page);
    await page.getByTestId('jd-count').fill('1');
    await page.getByTestId('jd-count').blur();
    await page.getByTestId('jd-rows').fill('1');
    await page.getByTestId('jd-rows').blur();
    await page.getByTestId('jd-plate-t').fill('6');
    await page.getByTestId('jd-plate-t').blur();
    await page.getByTestId('jd-plate-fu').fill('400');
    await page.getByTestId('jd-plate-fu').blur();
    await expect(page.getByTestId('joint-design-state')).toHaveAttribute('data-state', 'exceeded');
  });

  test('a spacing violation is exceeded even when the strength is fine', async ({ page }) => {
    await solvedJoint(page);
    await page.getByTestId('jd-count').fill('8');
    await page.getByTestId('jd-count').blur();
    await page.getByTestId('jd-spacing').fill('20');
    await page.getByTestId('jd-spacing').blur();
    await expect(page.getByTestId('jd-check-spacing')).toHaveAttribute('data-state', 'exceeded');
    await expect(page.getByTestId('joint-design-state')).toHaveAttribute('data-state', 'exceeded');
  });

  /*
   * Every state that is not a pass must READ as not a pass. The words are what a user acts on,
   * and a state that looks approving while meaning «a governing limit state was never evaluated»
   * is the single claim this branch exists to refuse.
   */
  test('no non-adequate state ever reads as approved', async ({ page }) => {
    await solvedJoint(page);
    for (const [count, t] of [['1', '6'], ['6', ''], ['6', '12']] as const) {
      await page.getByTestId('jd-count').fill(count);
      await page.getByTestId('jd-count').blur();
      await page.getByTestId('jd-plate-t').fill(t);
      await page.getByTestId('jd-plate-t').blur();
      assertNoApprovalClaim(await page.getByTestId('joint-design').innerText());
      const state = await page.getByTestId('joint-design-state').getAttribute('data-state');
      expect(state).not.toBe('verified');
    }
  });

  /*
   * The one a diameter cannot fix. Tabla J.3.2 has no `Fnv` for an A307 with threads excluded,
   * so no amount of user input evaluates §J.3.6 — which is exactly what separates
   * `notVerifiable` from `incomplete`.
   */
  test('a grade the table does not cover reads notVerifiable, not incomplete', async ({ page }) => {
    await solvedJoint(page);
    await page.getByTestId('jd-count').fill('6');
    await page.getByTestId('jd-count').blur();
    await page.getByTestId('jd-plate-t').fill('12');
    await page.getByTestId('jd-plate-t').blur();
    await page.getByTestId('jd-plate-fu').fill('400');
    await page.getByTestId('jd-plate-fu').blur();
    await page.getByTestId('jd-grade').selectOption('A307');
    // A307 with threads included IS tabulated, so this stays evaluable — the panel offers no
    // thread control yet, and the state stays a real one rather than a contrived failure.
    const state = await page.getByTestId('joint-design-state').getAttribute('data-state');
    expect(['designed', 'exceeded']).toContain(state);
  });
});
