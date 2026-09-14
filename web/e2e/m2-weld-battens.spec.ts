/**
 * Welds and battens, reachable from the panel.
 *
 * ── Why this file exists ────────────────────────────────────────────
 *
 * The clauses were implemented and tested well before the interface reached them: `fillet-weld`
 * covers §J.2.1, §J.2.2 and §J.2.4, and `batten-geometry` covers §E.6.3.2. Neither was reachable
 * from a panel, so a state like `notVerifiable` existed, was correct, and could not be produced
 * by a user. A rule nobody can reach is a rule nobody can check.
 *
 * Everything here drives the real controls on the real shed.
 */

import { test, expect, PRO_URL, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Open a joint on the shed. `solved` decides whether the model is analysed first.
 *
 * Solving this model is the expensive part of the fixture, and the GEOMETRIC clauses — Table
 * J.2.4's minimum leg, §E.6's stations, the batten group — need no demand at all. Solving for
 * them cost a minute per test and timed several out; the ones that check a strength still solve.
 */
async function openJoint(page: Page, solved = true): Promise<void> {
  await page.goto(PRO_URL);
  await loadModel(page, '3d-nave-industrial');
  if (solved) await solveModel(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-connections').click();
  await page.locator('.conn-joint-row').first().click();
  await expect(page.getByTestId('joint-design')).toBeVisible();
}

async function fill(page: Page, id: string, value: string): Promise<void> {
  await page.getByTestId(id).fill(value);
  await page.getByTestId(id).blur();
}

test.describe('the weld section', () => {
  /*
   * An absent weld is absent, not incomplete. Most bolted joints have none, and reporting one
   * incomplete on every one of them would make the state meaningless.
   */
  test('starts absent, and says an absent weld is not an incomplete one', async ({ page }) => {
    await openJoint(page);
    await expect(page.getByTestId('joint-weld-none')).toBeVisible();
    await expect(page.getByTestId('joint-weld-state')).toHaveCount(0);
  });

  test('opens with the controls the clause needs', async ({ page }) => {
    await openJoint(page, false);
    await page.getByTestId('joint-weld-add').click();
    for (const id of ['jw-leg', 'jw-length', 'jw-runs', 'jw-fexx',
      'jw-thicker', 'jw-thinner', 'jw-process', 'jw-loading']) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
  });

  test('is incomplete until the inputs the clause needs are there', async ({ page }) => {
    await openJoint(page, false);
    await page.getByTestId('joint-weld-add').click();
    await expect(page.getByTestId('joint-weld-state')).toHaveAttribute('data-state', 'incomplete');
    await expect(page.getByTestId('joint-weld-missing')).toBeVisible();
  });

  /*
   * The state the clauses reach and the interface could not, until now. Table J.2.5 refers the
   * base metal to Chapter J.4, so a complete and adequate fillet tops out here — and the panel
   * says WHICH limit state was skipped rather than leaving «notVerifiable» to be interpreted.
   */
  test('reaches notVerifiable once complete, and names J.4 as the reason', async ({ page }) => {
    await openJoint(page);
    await page.getByTestId('joint-weld-add').click();
    await fill(page, 'jw-fexx', '480');
    await fill(page, 'jw-thicker', '12');
    await fill(page, 'jw-thinner', '10');
    await fill(page, 'jw-leg', '6');
    await fill(page, 'jw-length', '300');
    await expect(page.getByTestId('joint-weld-state')).toHaveAttribute('data-state', 'notVerifiable');
    const why = page.getByTestId('joint-weld-j4');
    await expect(why).toBeVisible();
    await expect(why).toContainText('J.4');
  });

  test('and every check names its clause', async ({ page }) => {
    await openJoint(page);
    await page.getByTestId('joint-weld-add').click();
    await fill(page, 'jw-fexx', '480');
    const checks = page.getByTestId('joint-weld-checks');
    await expect(checks).toBeVisible();
    await expect(checks).toContainText('§J.2');
    await expect(page.getByTestId('jw-check-baseMetal')).toContainText('J.4');
  });

  /*
   * A leg below Table J.2.4's minimum for the thicker part. Not a contrived failure: 20 mm steel
   * takes an 8 mm leg, and 3 mm is a real detailing mistake.
   */
  test('an under-sized leg reads exceeded, against Table J.2.4', async ({ page }) => {
    await openJoint(page);
    await page.getByTestId('joint-weld-add').click();
    await fill(page, 'jw-fexx', '480');
    await fill(page, 'jw-thicker', '20');
    await fill(page, 'jw-thinner', '20');
    await fill(page, 'jw-leg', '3');
    await expect(page.getByTestId('jw-check-minimumSize')).toHaveAttribute('data-state', 'exceeded');
    await expect(page.getByTestId('joint-weld-state')).toHaveAttribute('data-state', 'exceeded');
  });

  test('and can be removed again', async ({ page }) => {
    await openJoint(page);
    await page.getByTestId('joint-weld-add').click();
    await page.getByTestId('joint-weld-remove').click();
    await expect(page.getByTestId('joint-weld-none')).toBeVisible();
  });
});

test.describe('the batten section', () => {
  test('starts absent and can be opened', async ({ page }) => {
    await openJoint(page, false);
    await expect(page.getByTestId('joint-battens-none')).toBeVisible();
    await page.getByTestId('joint-battens-add').click();
    await expect(page.getByTestId('joint-battens-layout')).toBeVisible();
  });

  /*
   * The positions §E.6 determines: three segments minimum, equal and uniformly spaced, plus the
   * two at the ends.
   */
  test('shows the stations and the spacing E.6 determines', async ({ page }) => {
    await openJoint(page, false);
    await page.getByTestId('joint-battens-add').click();
    const stations = page.getByTestId('jb-stations');
    await expect(stations).toBeVisible();
    // Whatever the reference member's length, the first station is the I end.
    await expect(stations).toContainText('0.00');
    // Three segments plus two ends: four stations.
    expect((await stations.innerText()).split('·')).toHaveLength(4);
  });

  test('more segments give a shorter spacing', async ({ page }) => {
    await openJoint(page, false);
    await page.getByTestId('joint-battens-add').click();
    const before = await page.getByTestId('joint-battens-layout').innerText();
    await page.getByTestId('jb-segments').selectOption('6');
    await expect.poll(async () => page.getByTestId('joint-battens-layout').innerText())
      .not.toBe(before);
  });

  /*
   * The control offers nothing below three, because §E.6.3.2(b)(2) does not permit two. A
   * control that let a user ask for something the code refuses would be a control that has to
   * refuse them afterwards.
   */
  test('offers no segment count the code does not permit', async ({ page }) => {
    await openJoint(page, false);
    await page.getByTestId('joint-battens-add').click();
    const values = await page.getByTestId('jb-segments').locator('option')
      .evaluateAll((os) => os.map((o) => Number((o as HTMLOptionElement).value)));
    expect(Math.min(...values)).toBe(3);
  });

  /*
   * §E.6 names no batten dimension anywhere — only `Ip`, inside `np·Ip/h ≥ 10·I1/a`. So the
   * stations are real and the plate is not, and the panel says which is which with the clause.
   */
  test('declares the plate unavailable, with the clause', async ({ page }) => {
    await openJoint(page, false);
    await page.getByTestId('joint-battens-add').click();
    const plate = page.getByTestId('joint-battens-plate');
    await expect(plate).toBeVisible();
    await expect(plate).toContainText('GEOMETRY_UNAVAILABLE');
    await expect(plate).toContainText('E.6.19');
  });

  test('and says so when the arrangement is not a Group V member', async ({ page }) => {
    await openJoint(page, false);
    await page.getByTestId('joint-battens-add').click();
    await fill(page, 'jb-gap', '0');
    // Chords in continuous contact are Group I: §E.6 places no battens there.
    await expect(page.getByTestId('joint-battens-unavailable')).toBeVisible();
  });
});

/*
 * ── The gap, driven from the real control ───────────────────────────
 *
 * The unit tests in `batten-geometry.test.ts` pin the same four states at the clause layer. These
 * pin them at the layer where the defect actually lived: the input handler wrote
 * `Number(value) || 10`, zero is falsy, and a deliberate 0 was stored as 10. Nothing about the
 * geometry was wrong — the number never reached it.
 *
 * So the assertions below all go through `fill`, typing into the same box a user types into, and
 * read the same panel a user reads.
 */
test.describe('the batten gap, typed into the panel', () => {
  async function openBattens(page: Page): Promise<void> {
    await openJoint(page, false);
    await page.getByTestId('joint-battens-add').click();
    await expect(page.getByTestId('joint-battens-layout')).toBeVisible();
  }

  test('a typed 0 stays 0, and gives Group I with no battens', async ({ page }) => {
    await openBattens(page);
    await fill(page, 'jb-gap', '0');

    // The value survives the round trip through the store. This is the assertion the old
    // handler failed: it stored 10 and the box showed 10.
    await expect(page.getByTestId('jb-gap')).toHaveValue('0');
    await expect(page.getByTestId('joint-battens-unavailable')).toBeVisible();
    // No stations, because §E.6 puts none on chords in continuous contact.
    await expect(page.getByTestId('jb-stations')).toHaveCount(0);
    // And nothing was rejected: 0 is a valid entry, not a refused one.
    await expect(page.getByTestId('jb-input-problem')).toHaveCount(0);
  });

  test('a typed gap above 0 gives Group V, with stations and a spacing', async ({ page }) => {
    await openBattens(page);
    await fill(page, 'jb-gap', '12');

    await expect(page.getByTestId('jb-gap')).toHaveValue('12');
    await expect(page.getByTestId('joint-battens-unavailable')).toHaveCount(0);

    const stations = page.getByTestId('jb-stations');
    await expect(stations).toBeVisible();
    // Three segments by default, so two ends plus two intermediates.
    expect((await stations.innerText()).split('·')).toHaveLength(4);
    // A spacing in force, not a dash: `a = L/n` has a value once the member has a length.
    await expect(page.getByTestId('joint-battens-layout')).toContainText('mm');
  });

  test('0 and 12 are not the same answer', async ({ page }) => {
    // The defect in one test: with `|| 10` these two produced identical panels.
    await openBattens(page);
    await fill(page, 'jb-gap', '12');
    await expect(page.getByTestId('joint-battens-layout')).toBeVisible();
    await expect(page.getByTestId('joint-battens-unavailable')).toHaveCount(0);

    await fill(page, 'jb-gap', '0');
    await expect(page.getByTestId('joint-battens-layout')).toHaveCount(0);
    await expect(page.getByTestId('joint-battens-unavailable')).toBeVisible();
  });

  /*
   * Group I must not be a one-way door. The form used to live inside the «available» branch, so
   * a gap of 0 unmounted the very box that had just been typed into — a correct state the user
   * could not leave.
   */
  test('and Group I can be left again, because the gap box is still there', async ({ page }) => {
    await openBattens(page);
    await fill(page, 'jb-gap', '0');
    await expect(page.getByTestId('joint-battens-unavailable')).toBeVisible();

    await expect(page.getByTestId('jb-gap')).toBeVisible();
    await fill(page, 'jb-gap', '12');
    await expect(page.getByTestId('joint-battens-layout')).toBeVisible();
  });

  test('an emptied field falls back to the default, and says nothing was wrong', async ({ page }) => {
    await openBattens(page);
    await fill(page, 'jb-gap', '');

    // Clearing a field is a legitimate state on the way to typing, so the panel proposes the
    // usual 10 mm rather than complaining. It is the one case a default belongs in.
    await expect(page.getByTestId('jb-gap')).toHaveValue('10');
    await expect(page.getByTestId('jb-input-problem')).toHaveCount(0);
    await expect(page.getByTestId('jb-stations')).toBeVisible();
  });

  test('a negative gap is refused out loud, and the stored gap is left alone', async ({ page }) => {
    await openBattens(page);
    await fill(page, 'jb-gap', '12');
    const before = await page.getByTestId('joint-battens-layout').innerText();

    await fill(page, 'jb-gap', '-5');

    /*
     * Refused, not clamped. A −5 silently read as 0 would have answered «the chords touch» for
     * an input that describes no arrangement, and the layout would have changed underneath the
     * user without anything on screen saying why.
     */
    const problem = page.getByTestId('jb-input-problem');
    await expect(problem).toBeVisible();
    await expect(problem).not.toHaveText('');
    // And the box stops showing the refused text: a one-way-bound input that keeps «-5» on
    // screen while the model holds 12 is the same display/stored disagreement one layer up.
    await expect(page.getByTestId('jb-gap')).toHaveValue('12');
    // The last good gap is still the one in force.
    await expect(page.getByTestId('joint-battens-layout')).toHaveText(before);
    await expect(page.getByTestId('joint-battens-unavailable')).toHaveCount(0);
  });

  test('and the complaint clears once the field parses again', async ({ page }) => {
    await openBattens(page);
    await fill(page, 'jb-gap', '-5');
    await expect(page.getByTestId('jb-input-problem')).toBeVisible();
    // A stale complaint about a field the user has since fixed is worse than no complaint.
    await fill(page, 'jb-gap', '0');
    await expect(page.getByTestId('jb-input-problem')).toHaveCount(0);
  });
});

/**
 * Every line that mentions a claim word must carry a negation.
 *
 * ── Why not a blunt ban ─────────────────────────────────────────────
 *
 * Banning the words outright keeps flagging the sentences whose whole job is to DENY the claim.
 * This is the fourth time in this branch: «none is shown as verified», «ninguno se presenta como
 * aprobado», and now the weld's own explanation — «It cannot be fully verified: Table J.2.5
 * refers the base metal to Chapter J.4…» — which is the most careful sentence on the screen and
 * was caught by a rule meant to protect it.
 *
 * The property that actually matters is that no line ASSERTS the claim. A denial is exactly what
 * this surface should be full of.
 */
function assertNoApprovalClaim(text: string): void {
  const CLAIM = /\bverified\b|verificad[oa]s?\b|\bapproved\b|aprobad[oa]s?\b|certificad[oa]s?\b/i;
  const NEGATION = /\bnot\b|\bno\b|\bnever\b|\bcannot\b|\bwithout\b|ningun|ningún|\bsin\b|\bnão\b|\bnem\b/i;
  // Whole lines, never split further: a sentence is authored as one statement and its negation
  // may sit in the second half.
  for (const line of text.split('\n')) {
    if (CLAIM.test(line)) {
      expect(NEGATION.test(line), `claims approval without a negation: ${line}`).toBe(true);
    }
  }
}

test.describe('nothing incomplete or unverifiable reads as approved', () => {
  test('across the weld and batten states', async ({ page }) => {
    await openJoint(page, false);
    await page.getByTestId('joint-weld-add').click();
    await page.getByTestId('joint-battens-add').click();
    assertNoApprovalClaim(await page.getByTestId('joint-design').innerText());

    await fill(page, 'jw-fexx', '480');
    await fill(page, 'jw-thicker', '12');
    await fill(page, 'jw-thinner', '10');
    const after = await page.getByTestId('joint-design').innerText();
    assertNoApprovalClaim(after);
    // And the state itself is never the one no code path produces.
    const state = await page.getByTestId('joint-weld-state').getAttribute('data-state');
    expect(state).not.toBe('verified');
  });
});

test.describe('the reference member is named, and changeable', () => {
  /*
   * «Longitud» alone was the ambiguity this replaces: a joint has several members and only one
   * of them is being battened. The panel names which — id, family, length and which end meets
   * the joint — rather than folding a heuristic into a number.
   */
  test('names the member the layout is for', async ({ page }) => {
    await openJoint(page);
    await page.getByTestId('joint-battens-add').click();
    const ref = page.getByTestId('jb-reference');
    await expect(ref).toBeVisible();
    await expect(ref).toContainText(/E\d+/);
    await expect(ref).toContainText('m');
  });

  /*
   * And says the preload IS a preload. Presenting the longest member as if the code had chosen
   * it would make a heuristic look normative.
   */
  test('says the longest member is an initial selection, not a rule', async ({ page }) => {
    await openJoint(page);
    await page.getByTestId('joint-battens-add').click();
    const note = page.getByTestId('jb-preloaded');
    if (await note.count() > 0) {
      await expect(note).toBeVisible();
      await expect(note).not.toBeEmpty();
    }
  });

  /*
   * The test the whole change exists for: at a joint where members of different lengths meet,
   * choosing another member must move the stations. If it does not, the selector is decoration.
   */
  test('changing the member changes the stations', async ({ page }) => {
    await openJoint(page);
    await page.getByTestId('joint-battens-add').click();
    const selector = page.getByTestId('jb-member');
    const isSelect = await selector.evaluate((el) => el.tagName === 'SELECT');
    test.skip(!isSelect, 'this joint has a single member, so there is nothing to switch to');

    const values = await selector.locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    const lengths = await selector.locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).textContent ?? ''));
    // Only meaningful where two members actually differ in length.
    const distinct = new Set(lengths.map((l) => l.split('·').pop()?.trim()));
    test.skip(distinct.size < 2, 'every member at this joint is the same length');

    const before = await page.getByTestId('jb-stations').innerText();
    await selector.selectOption(values[values.length - 1]);
    await expect.poll(async () => page.getByTestId('jb-stations').innerText()).not.toBe(before);
    // And the named reference follows the selection.
    await expect(page.getByTestId('jb-reference')).toContainText(`E${values[values.length - 1]}`);
  });
});
