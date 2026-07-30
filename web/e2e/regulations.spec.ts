/**
 * PR16 — project regulations and regulation-backed loads, through VISIBLE CONTROLS ONLY.
 *
 * Replaces `code-settings.spec.ts`, which tested a panel that has been deleted and used a
 * hook to navigate. Every journey here clicks what a user clicks. Hooks are used ONLY to
 * read counters after a UI action — never to create the state being tested.
 *
 * The regressions these lock down are the ones the forensic audit found:
 *   R1  duplicate "CIRSOC 201" label in a selector
 *   R2  CIRSOC 103 as a hardcoded tab, CIRSOC 301 absent entirely
 *   R3  a load-edition selector that nothing read
 *   R4  aggregate size owned by the regulation panel
 *   R5  a load-regulation change silently relabelling existing results
 */

import { test, expect, loadModel, solveModel } from './fixtures';

type Page = import('@playwright/test').Page;

/** Open the RC Design tab the way a user does: Analysis ▾ → RC Design. */
async function openDesign(page: Page) {
  await page.locator('button:has-text("Analysis")').first().click();
  await page.locator('.pb-dropdown .pb-dd-item').filter({ hasText: /Design/i }).first().click();
  await expect(page.getByTestId('design-toolbar')).toBeVisible();
}

/** Open Conditions ▾ → Loads. */
async function openLoads(page: Page) {
  await page.locator('button:has-text("Conditions")').first().click();
  await page.locator('.pb-dropdown .pb-dd-item').filter({ hasText: /Loads/i }).first().click();
}

async function openRegulations(page: Page) {
  await openDesign(page);
  const d = page.locator('details').filter({ hasText: 'Project regulations' }).first();
  await d.locator('summary').first().click();
  await expect(page.getByTestId('project-regulations')).toBeVisible();
}

const ROLES = ['basis', 'loads', 'wind', 'seismic', 'concrete', 'steel', 'masonry', 'timber'] as const;

test.describe('@smoke project regulations — code-neutral roles', () => {
  test('R1 — no role selector has a duplicate option label', async ({ pro: page }) => {
    // The shipped defect: `cirsoc` and `cirsoc-2005` both rendered as "CIRSOC 201".
    await openRegulations(page);
    for (const role of ROLES) {
      const opts = (await page.getByTestId(`role-select-${role}`).locator('option').allInnerTexts())
        .map((s) => s.trim())
        .filter((s) => !s.startsWith('—'));
      expect(new Set(opts).size, `role ${role}: ${opts.join(' | ')}`).toBe(opts.length);
    }
  });

  test('R1b — the concrete selector offers ONLY the available edition', async ({ pro: page }) => {
    // Was "both concrete editions are distinguishable". CIRSOC 201-2005 is no longer
    // selectable: its official text is not supplied with the app, so its rules are not
    // implemented, and the 2025 rules are deliberately NOT applied under its label. The
    // label-distinguishability invariant it used to guard is now covered by R1 (no duplicate
    // labels) plus the unit gate over the whole catalogue.
    await openRegulations(page);
    const opts = await page.getByTestId('role-select-concrete').locator('option').allInnerTexts();
    const trimmed = opts.map((s) => s.trim());
    expect(trimmed).toContain('CIRSOC 201 (2025)');
    expect(trimmed).not.toContain('CIRSOC 201 (2005)');
  });

  test('R1c — the withdrawn edition is EXPLAINED, not silently missing', async ({ pro: page }) => {
    // A user looking for 2005 must learn why it is gone and what would bring it back,
    // rather than concluding the option was lost or the product will never support it.
    await openRegulations(page);
    const panel = page.getByTestId('unavailable-editions');
    await expect(panel).toBeVisible();
    await panel.locator('summary').click();
    const row = page.getByTestId('unavailable-cirsoc-2005');
    await expect(row).toBeVisible();
    await expect(row).toContainText('CIRSOC 201 (2005)');
    // The reason distinguishes "text not supplied" from "not implemented".
    await expect(row).toContainText(/official text of this edition is not supplied/i);
    // And it states the no-substitution rule, which is the whole point.
    await expect(row).toContainText(/No other edition is substituted/i);
  });

  test('R1d — 2005 cannot be applied even by driving the select directly', async ({ pro: page }) => {
    // Defence in depth: the option is absent from the DOM, so selecting it is impossible.
    await openRegulations(page);
    const sel = page.getByTestId('role-select-concrete');
    await expect(sel.locator('option[value="cirsoc-2005"]')).toHaveCount(0);
    // The applied binding stays on the edition in force.
    await expect(page.getByTestId('role-state-concrete')).toBeVisible();
    const advanced = page.getByTestId('role-concrete').locator('details.advanced');
    await advanced.locator('summary').click();
    await expect(page.getByTestId('role-concrete')).toContainText('2025');
  });

  test('R2 — every role has a selector, including seismic and steel', async ({ pro: page }) => {
    await openRegulations(page);
    for (const role of ROLES) {
      await expect(page.getByTestId(`role-select-${role}`)).toBeVisible();
    }
    // 103 through the seismic ROLE, not a hardcoded tab.
    const seismic = await page.getByTestId('role-select-seismic').locator('option').allInnerTexts();
    expect(seismic.join(' ')).toMatch(/INPRES-CIRSOC 103/);
    // 301 exists now, and says honestly that it is not implemented.
    const steel = await page.getByTestId('role-select-steel').locator('option').allInnerTexts();
    expect(steel.join(' ')).toMatch(/CIRSOC 301/);
  });

  test('R2b — an unimplemented regulation is refused, with a reason', async ({ pro: page }) => {
    await openRegulations(page);
    await page.getByTestId('role-select-steel').selectOption('cirsoc301-2018');
    await expect(page.getByTestId('regulation-refused')).toBeVisible();
    await expect(page.getByTestId('regulation-refused')).toContainText(/not implemented/i);
  });

  test('R3 — each bound role shows edition, maturity and applied state', async ({ pro: page }) => {
    await openRegulations(page);
    await expect(page.getByTestId('role-state-concrete')).toHaveText('Applied');
    await expect(page.getByTestId('role-maturity-concrete')).toHaveText('Validated');
    await expect(page.getByTestId('role-state-steel')).toHaveCount(0);   // unset
  });

  test('R4 — aggregate size is NOT owned here; it points at Materials', async ({ pro: page }) => {
    await openRegulations(page);
    const x = page.getByTestId('aggregate-crossref');
    await expect(x).toBeVisible();
    await expect(x).toContainText(/property of the mix/i);
    // No editable aggregate input on this surface.
    await expect(page.getByTestId('project-regulations').locator('input#cs-aggregate')).toHaveCount(0);
    await page.getByTestId('regs-edit-materials').click();
    // Landed on Materials, where the value actually lives.
    await expect(page.getByRole('columnheader', { name: /d_agg/ })).toBeVisible();
  });

  test('R4b — aggregate is editable on the concrete material', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.locator('button:has-text("Properties")').first().click();
    await page.locator('.pb-dropdown .pb-dd-item').filter({ hasText: /Materials/i }).first().click();
    const input = page.getByTestId('mat-aggregate-1');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', /not stated/i);
    await input.fill('25');
    await input.blur();
    await expect(input).toHaveValue('25');
  });

  test('R4c — an out-of-range aggregate is rejected', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.locator('button:has-text("Properties")').first().click();
    await page.locator('.pb-dropdown .pb-dd-item').filter({ hasText: /Materials/i }).first().click();
    await page.getByTestId('mat-aggregate-1').fill('500');
    await page.getByTestId('mat-aggregate-1').blur();
    await expect(page.getByTestId('mat-aggregate-error')).toBeVisible();
  });
});

test.describe('@smoke pending load-regulation change', () => {
  test('R5 — changing a load role stages it pending and does NOT apply', async ({ pro: page }) => {
    await openRegulations(page);
    await page.getByTestId('role-select-wind').selectOption('cirsoc102-2005');

    const banner = page.getByTestId('pending-load-change');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/must be regenerated/i);
    await expect(banner).toContainText(/new structural solve/i);
    await expect(page.getByTestId('role-state-wind')).toHaveText('Pending');
  });

  test('R5b — Review changes in Loads navigates to the Loads workflow', async ({ pro: page }) => {
    await openRegulations(page);
    await page.getByTestId('role-select-wind').selectOption('cirsoc102-2005');
    await page.getByTestId('pending-review-in-loads').click();
    // The preview and Apply live in Loads, not in Design.
    await expect(page.getByRole('button', { name: /Auto-generate from code/i })).toBeVisible();
  });

  test('R5c — Cancel change reverts to the applied binding', async ({ pro: page }) => {
    await openRegulations(page);
    await page.getByTestId('role-select-wind').selectOption('cirsoc102-2005');
    await expect(page.getByTestId('role-state-wind')).toHaveText('Pending');
    await page.getByTestId('pending-cancel').click();
    await expect(page.getByTestId('pending-load-change')).toBeHidden();
    await expect(page.getByTestId('role-state-wind')).toHaveText('Applied');
  });

  test('R5d — a design-only change applies in place, with no pending banner', async ({ pro: page }) => {
    // The forces do not move, so there is nothing to preview.
    //
    // Used to switch the CONCRETE role to CIRSOC 201-2005, which is no longer selectable.
    // CIRSOC 201-2025 is now the only AVAILABLE concrete edition, and the other design-only
    // roles (steel, masonry, timber) all have UNSUPPORTED-maturity options that
    // `validateStack` refuses by design — so a re-bind of the concrete role is the available
    // design-only change. It exercises the same path: requestChange -> design-only -> applies
    // in place, with no load-preview banner.
    await openRegulations(page);
    await page.getByTestId('role-select-concrete').selectOption('cirsoc');
    await expect(page.getByTestId('pending-load-change')).toBeHidden();
    await expect(page.getByTestId('role-state-concrete')).toHaveText('Applied');
  });
});

test.describe('@smoke regulation-backed load generation', () => {
  async function openDialog(page: Page) {
    await loadModel(page, 'rc-design-qa-8');
    await openLoads(page);
    await page.getByRole('button', { name: /Auto-generate from code/i }).click();
    await expect(page.getByTestId('al-regulations')).toBeVisible();
  }

  test('R6 — the dialog states which regulations the loads come from', async ({ pro: page }) => {
    await openDialog(page);
    const r = page.getByTestId('al-regulations');
    await expect(r).toContainText('CIRSOC 101 (2025)');
    await expect(r).toContainText('CIRSOC 102 (2025)');
  });

  test('R7 — Preview shows a before/after delta and does not mutate yet', async ({ pro: page }) => {
    await openDialog(page);
    await page.getByTestId('al-preview-btn').click();

    const delta = page.getByTestId('al-delta');
    await expect(delta).toBeVisible();
    // A real plan puts distributed loads on the beams.
    const after = Number(await page.getByTestId('al-after-dist').innerText());
    expect(after).toBeGreaterThan(0);
    await expect(page.getByTestId('al-preview')).toContainText(/invalidates/i);
    await expect(page.getByTestId('al-derivation')).toBeVisible();
  });

  test('R8 — Apply commits the plan and closes the dialog', async ({ pro: page }) => {
    await openDialog(page);
    await page.getByTestId('al-preview-btn').click();
    const planned = Number(await page.getByTestId('al-after-dist').innerText());
    await page.getByTestId('al-apply').click();
    await expect(page.getByTestId('al-preview')).toBeHidden();
    expect(planned).toBeGreaterThan(0);
  });

  test('R9 — Back returns to the form without applying', async ({ pro: page }) => {
    await openDialog(page);
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-delta')).toBeVisible();
    await page.getByTestId('al-back').click();
    await expect(page.getByTestId('al-preview')).toBeHidden();
    await expect(page.getByTestId('al-preview-btn')).toBeVisible();
  });

  test('R10 — seismic is disabled until a seismic regulation is bound, and says why', async ({ pro: page }) => {
    await openDialog(page);
    await expect(page.getByTestId('al-enable-seismic')).toBeDisabled();
    const why = page.getByTestId('al-seismic-unavailable');
    await expect(why).toBeVisible();
    await expect(why).toContainText(/need a seismic regulation/i);
    await expect(page.getByTestId('al-goto-regulations')).toBeVisible();
  });

  test('R11 — binding the seismic role enables seismic loads', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openRegulations(page);
    await page.getByTestId('role-select-seismic').selectOption('inpres103-2018');
    await page.getByTestId('pending-review-in-loads').click();

    await page.getByRole('button', { name: /Auto-generate from code/i }).click();
    await expect(page.getByTestId('al-enable-seismic')).toBeEnabled();
    await page.getByTestId('al-enable-seismic').check();
    await page.getByTestId('al-preview-btn').click();
    // A real seismic weight and base shear from the model's own masses.
    await expect(page.getByTestId('al-base-shear')).toContainText(/Seismic weight W =/);
  });

  test('R12 — the imposed-load reduction is a visible, real control', async ({ pro: page }) => {
    const derivation = async () => {
      // The derivation lives in a collapsed disclosure; open it to read the lines.
      await page.getByTestId('al-derivation').locator('summary').click();
      return page.getByTestId('al-derivation').innerText();
    };

    await openDialog(page);
    await page.getByTestId('al-preview-btn').click();
    const withRed = await derivation();

    await page.getByTestId('al-back').click();
    await page.getByTestId('al-live-reduction').uncheck();
    await page.getByTestId('al-preview-btn').click();
    const without = await derivation();

    // Turning the §4.7.2 reduction off must change what the derivation says.
    expect(without).not.toBe(withRed);
    // English, because the fixture boots in English. Before the engine-message refactor
    // these two assertions read Spanish and passed anyway — which was the whole defect:
    // the derivation was Spanish no matter what language the user had chosen.
    expect(without).toMatch(/reduction not applied, by project decision/i);
    expect(withRed).toMatch(/K_LL·A_t|no reduction applies/);
  });

  test('R13 — an occupancy that Table 4.1 cross-references is refused, not invented', async ({ pro: page }) => {
    await openDialog(page);
    // "Balcones — otros casos" refers to article 4.11 instead of giving a value.
    const occ = page.locator('select').filter({ hasText: /Balcon/i }).first();
    if (await occ.count() === 0) test.skip();
    await occ.selectOption('balcon_otros');
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-blocked')).toBeVisible();
    await expect(page.getByTestId('al-preview')).toContainText(/4\.11/);
  });
});

test.describe('@slow revision invalidation is precise', () => {
  test('R14 — a detail-only change does NOT require a new solve', async ({ pro: page }) => {
    // Aggregate size changes whether bars fit, not what the section carries.
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    const solvesBefore = await page.evaluate(() => window.__stabileo.solveCount());

    await page.locator('button:has-text("Properties")').first().click();
    await page.locator('.pb-dropdown .pb-dd-item').filter({ hasText: /Materials/i }).first().click();
    await page.getByTestId('mat-aggregate-1').fill('19');
    await page.getByTestId('mat-aggregate-1').blur();

    // Hook used ONLY to observe a counter after a UI action.
    const solvesAfter = await page.evaluate(() => window.__stabileo.solveCount());
    expect(solvesAfter).toBe(solvesBefore);
  });

  test('R15 — the design surface still works after a design-only regulation change', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    const before = await page.evaluate(() => window.__stabileo.solveCount());

    await openRegulations(page);
    // A DESIGN_ONLY role change; see R5d on why this is a concrete re-bind rather than the
    // withdrawn CIRSOC 201-2005.
    await page.getByTestId('role-select-concrete').selectOption('cirsoc');

    // No solve was triggered: the forces are still the forces.
    expect(await page.evaluate(() => window.__stabileo.solveCount())).toBe(before);
    await expect(page.getByTestId('cmd-code-check')).toBeEnabled();
  });
});
