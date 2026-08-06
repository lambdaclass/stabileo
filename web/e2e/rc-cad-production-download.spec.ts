/**
 * PR19 — the CAD handoff a real user downloads, driven entirely from real controls.
 *
 * ── Why this exists next to `rc-cad-handoff.spec.ts` ────────────
 *
 * That spec reaches the export through `window.__stabileoActions`, which is the right economy
 * for asserting the export's CONTENT. It cannot see a defect in the commands themselves, and
 * that is exactly where one was: `detailingStore.generate()` and `generateFloors()` defaulted
 * `verifierId` to `''`, only the golden chain passed one, and so every certificate a real user
 * exported named no verifier at all. A journey that calls the store directly steps over the two
 * call sites that were wrong.
 *
 * So every ACTION below is a click on the control a user clicks — solve, compute demands, run
 * code check, design all, regenerate detailing, generate foundation detailing, export. Hooks
 * are read for waiting only, never to perform a step, because waiting on a revision counter is
 * an observation and clicking a button is the thing under test.
 *
 * ── The golden manifest and this download are not byte-comparable ──
 *
 * `rc-cad-handoff-golden.test.ts` pins the committed fixture byte for byte. This spec must not,
 * and the difference is by construction rather than by drift:
 *
 *   * the golden is produced through a deterministic KEY-EMITTING translator, so its `text`
 *     fields hold raw i18n keys and their params — `footing.cad.assumption.aggregate {"mm":20}`;
 *   * a production export passes the app's own `tp`, so the same fields hold localized display
 *     prose in whatever locale the user is running.
 *
 * Both are correct, and neither is a defect in the other. The semantic contract — what a CAD
 * consumer is entitled to rely on — is the STABLE part: `schema`/`schemaVersion`, the `code` and
 * `messageKey` and `params` of every note, stable ids, geometry, revisions, check ids and
 * evaluation statuses, observation policies, and the certificate's provenance. Locale-dependent
 * display text is not a byte-comparison boundary and asserting on it here would only assert
 * which language the runner booted in. This spec therefore compares codes, keys, numbers and
 * identity, and never the prose.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { CIRSOC_VERIFIER_ID } from '../src/lib/engine/design/adapters/cirsoc201-adapter';

const FIXTURE = new URL(
  '../src/lib/export/__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url).pathname;

/** The identity the bound regulation must produce. Derived, never a pasted literal. */
const EXPECTED_VERIFIER = `${CIRSOC_VERIFIER_ID}.2025`;

/** Open the committed project through the production file input. */
async function openProject(page: Page) {
  await page.locator('[data-tour="mode-toggle"] button').first().click();
  const input = page.getByTestId('project-open-file');
  await expect(input).toBeAttached();
  await input.setInputFiles(FIXTURE);
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 })
    .toBe(8);
  await expect(page.locator('.app-body-pro')).toBeAttached();
}

/** The RC Design tab, from the ANALYSIS menu a user opens. */
async function openDesignTab(page: Page) {
  await page.getByRole('button', { name: /ANALYSIS/i }).first().click();
  await page.getByText(/^Design$/).first().click();
  await expect(page.getByTestId('cmd-design-all')).toBeVisible({ timeout: 30_000 });
}

/** Solve from the toolbar's own button, and wait on the real counter. */
async function solveFromToolbar(page: Page) {
  const before = await page.evaluate(() => window.__stabileo.solveCount());
  await page.getByRole('button', { name: /^Solve$/ }).first().click();
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solveCount()), { timeout: 120_000 })
    .toBeGreaterThan(before);
}

/**
 * The complete production chain, every step a real click.
 *
 * The order matters and is the order the Design toolbar presents: demands, then the code check
 * that issues the certificates, then the design that accepts reinforcement, then detailing.
 * `verifierId` comes from the certificates the code check issued, so a journey that skipped it
 * would reach the export with no identity — which is now a refusal rather than an empty field.
 */
async function runProductionChainFromUi(page: Page) {
  await openProject(page);
  await solveFromToolbar(page);
  await openDesignTab(page);

  await page.getByTestId('cmd-compute-demands').click();
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.demandRevision()), { timeout: 120_000 })
    .toBeGreaterThan(0);

  await page.getByTestId('cmd-code-check').click();
  // The code check establishes the BASELINE; the run summary that `runCounts` reads is written
  // by the design pass that follows. So the wait here is on the baseline revision moving, which
  // is the code check's own observable effect.
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.baselineRevision()), { timeout: 180_000 })
    .toBeGreaterThan(0);

  await page.getByTestId('cmd-design-all').click();
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.runCounts()?.verified ?? 0), { timeout: 180_000 })
    .toBeGreaterThan(0);

  await page.getByTestId('cmd-generate-detailing').click();
  // The member detailing pass is what stamps the assemblies; the footing run merges into them.
  await page.waitForTimeout(1_000);
}

/** Foundations, through the disclosure a user opens. */
async function openFoundations(page: Page) {
  const disclosure = page.getByTestId('floor-families-disclosure');
  await expect(disclosure).toBeVisible({ timeout: 30_000 });
  await disclosure.locator('summary').first().click();
  await page.getByTestId('floor-family-foundations').click();
  await expect(page.getByTestId('foundations-panel')).toBeVisible();
}

async function detailTheFooting(page: Page) {
  await page.getByTestId('footing-1').click();
  await expect(page.getByTestId('footing-editor')).toBeVisible();
  await page.getByTestId('floor-design-run').click();
  const summary = page.getByTestId('floor-foundations-summary');
  await expect(summary).toBeVisible({ timeout: 180_000 });
  await expect(summary).toContainText(/1\s+(of|de)\s+1/, { timeout: 180_000 });
}

test.describe('@slow rc cad handoff — the production download', () => {
  // This journey does the real work — solve, demands, code check, design, detailing — through
  // real controls, so it costs far more than a hook-driven spec. The default 60 s budget is
  // sized for those; this one needs the wall clock the production chain actually takes.
  test.describe.configure({ timeout: 420_000 });

  test('P-A the journey a user drives produces a certified, complete manifest', async ({ pro: page }) => {
    await runProductionChainFromUi(page);
    await openFoundations(page);
    await detailTheFooting(page);

    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByTestId('footing-cad-export-run').click();
    const download = await downloadPromise;
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(path, 'utf8');
    const m = JSON.parse(text);

    // ── contract ────────────────────────────────────────────────
    expect(m.schema).toBe('RcCadHandoffV2');
    expect(m.schemaVersion).toBe(2);
    expect(m.generator).toEqual({ name: 'stabileo-rc-cad-handoff', version: '2.0.0' });

    // ── THE DEFECT THIS SPEC EXISTS FOR ─────────────────────────
    // Not merely non-empty: the identity of the regulation actually bound and run.
    expect(m.certificate.verifierId, 'a production export must name its verifier')
      .not.toBe('');
    expect(m.certificate.verifierId).toBe(EXPECTED_VERIFIER);
    expect(m.certificate.codeId).toBe('cirsoc-201');
    expect(m.certificate.codeEdition).toBe('2025');

    // ── revision coherence ──────────────────────────────────────
    expect(m.revisions.detailing).toBeGreaterThan(0);
    expect(m.revisions.demand).toBeGreaterThan(0);
    expect(download.suggestedFilename())
      .toBe(`rc-cad-handoff-v2-${m.subject.name}-det${m.revisions.detailing}-dem${m.revisions.demand}.json`);

    // ── geometry, by count and kind ─────────────────────────────
    expect(m.concrete.bodies).toHaveLength(2);
    expect(m.concrete.bodies.map((b: { role: string }) => b.role).sort())
      .toEqual(['footing', 'supportedColumn']);

    const bars = m.reinforcement.bars as Array<{
      id: string; diameterMm: number; role: string;
      segments: Array<{ kind: string }>;
    }>;
    // 46: eight starters, six closed ties, twelve crossties and twenty mat bars. The Ø16 count
    // is 28 rather than 8 because the mat is Ø16 too — which is exactly why the families, not the
    // diameters, are what identify the steel.
    expect(bars).toHaveLength(46);
    expect(bars.filter((b) => b.diameterMm === 16)).toHaveLength(28);
    expect(bars.filter((b) => b.diameterMm === 6)).toHaveLength(18);
    expect((m.assembly.families as Array<{ kind: string; barIds: string[] }>)
      .map((fam) => [fam.kind, fam.barIds.length]).sort())
      .toEqual([
        ['columnDowel', 8], ['footingBottomMatX', 10], ['footingBottomMatY', 10],
        ['starterCrosstie', 12], ['starterTie', 6],
      ]);

    const arcs = bars.reduce(
      (n, b) => n + b.segments.filter((s) => s.kind === 'arc').length, 0);
    expect(arcs, 'exact arcs, not chorded approximations').toBe(62);
    // Every arc carries the parameters that make it exact rather than sampled.
    for (const b of bars) {
      for (const s of b.segments.filter((x) => x.kind === 'arc')) {
        const a = s as unknown as { radius: number; sweepDeg: number; centre: unknown };
        expect(a.radius).toBeGreaterThan(0);
        expect(a.sweepDeg).toBeGreaterThan(0);
        expect(a.centre).toBeTruthy();
      }
    }

    // ── stable ids ──────────────────────────────────────────────
    const ids = bars.map((b) => b.id).sort();
    expect(ids.filter((i) => /^F1-C1-dowel-[0-7]$/.test(i))).toHaveLength(8);
    expect(ids.filter((i) => /^F1-C1:starter:stirrup:/.test(i))).toHaveLength(6);
    expect(m.concrete.bodies.map((b: { bodyId: string }) => b.bodyId).sort())
      .toEqual(['body:column:1', 'body:footing:1']);

    // ── marks ───────────────────────────────────────────────────
    const marks = m.reinforcement.marks as Array<{ mark: string; diameterMm: number; quantity: number }>;
    // Six marks: three Ø6 tie/crosstie shapes at six pieces each, the Ø16 mat at twenty, and the
    // eight starters split across two marks because the hook-orientation search seats some on the
    // upper mat layer and some on the lower, giving genuinely different cutting lengths.
    expect(marks.map((k) => [k.mark, k.diameterMm, k.quantity]).sort())
      .toEqual([
        ['F1', 6, 6], ['F2', 6, 6], ['F3', 6, 6],
        ['F4', 16, 6], ['F5', 16, 2], ['F6', 16, 20],
      ].sort());

    // ── the mat IS here, and every limitation is coded ──────────
    const unsupportedCodes = (m.unsupported as Array<{ code: string }>).map((u) => u.code).sort();
    expect(unsupportedCodes).toEqual([
      'COLUMN_COVER_OUT_OF_SCOPE',
      'FOOTING_BOTTOM_MAT_MODELED',
      'FOOTING_TOP_REINFORCEMENT_NOT_EVALUATED',
      'MAT_STARTER_CLEAR_SPACING_FAILURE',
      'NO_PRODUCTION_CONTAINMENT_CHECKER',
      'PUNCHING_UNBALANCED_MOMENT_UNSUPPORTED',
    ]);
    // The inverse of what this used to assert. V1 declared the mats absent and this checked that
    // no mat bar had slipped in; V2 carries them, so the check is that they ARE here and remain
    // individually addressable rather than folded into the dowel family.
    expect(bars.filter((b) => /mat/i.test(b.id)), 'the mat bars are present').toHaveLength(20);
    const matFamilyIds = new Set((m.assembly.families as Array<{ kind: string; familyId: string }>)
      .filter((fam) => fam.kind.startsWith('footingBottomMat')).map((fam) => fam.familyId));
    for (const b of bars.filter((x) => /mat/i.test(x.id))) {
      expect(matFamilyIds.has((b as unknown as { familyId: string }).familyId), b.id).toBe(true);
    }

    // ── the export must not read as ready to build ──────────────
    expect(m.statuses.constructible).toBe(false);
    expect(m.statuses.constructibilityBlockers).toEqual(['MAT_STARTER_CLEAR_SPACING_FAILURE']);
    expect(m.statuses.bottomFlexure).toBe('OK');
    expect(m.statuses.bottomMatGeometry).toBe('MODELED');
    expect(m.statuses.bottomAnchorage).toBe('FAILED');
    expect(m.statuses.topReinforcement).toBe('NOT_EVALUATED');
    expect(m.statuses.punchingMomentTransfer).toBe('UNSUPPORTED');

    // ── checks and observation policy ───────────────────────────
    const checks = m.checks as Array<{ checkId: string; evaluationStatus: string }>;
    expect(checks.map((c) => [c.checkId, c.evaluationStatus]).sort()).toEqual([
      ['check:barClearSpacing:footing:1', 'EVALUATED'],
      ['check:barCollision:footing:1', 'EVALUATED'],
      ['check:concreteCover:column:1', 'NOT_EVALUATED'],
      ['check:concreteCover:footing:1', 'NOT_EVALUATED'],
      ['check:reinforcementContainment:footing:1', 'NOT_EVALUATED'],
    ]);
    // An unevaluated check must never arrive carrying a consumer policy that reads as a pass.
    for (const c of checks.filter((x) => x.evaluationStatus === 'NOT_EVALUATED')) {
      const policy = (c as unknown as { consumerObservationPolicy?: string }).consumerObservationPolicy;
      expect(policy, `${c.checkId} states a policy`).toBeTruthy();
      expect(policy).not.toMatch(/pass/i);
    }

    // ── assumptions travel as codes and params, not only as prose ──
    const assumptions = m.assumptions as Array<{ code: string; messageKey: string; params: unknown }>;
    expect(assumptions.map((a) => a.code).sort()).toEqual([
      'BAR_EXTENTS_FROM_PRODUCTION_SAMPLER',
      'COLUMN_ELEMENT_BASE_ABOVE_FOOTING_TOP',
      'COLUMN_STUB_TRUNCATED_AT_CAGE_TOP',
      'MAX_AGGREGATE_SIZE_ASSUMED',
    ]);
    for (const a of assumptions) {
      expect(a.messageKey, `${a.code} carries a stable key`).toBeTruthy();
      expect(a.params, `${a.code} carries its params`).toBeTruthy();
    }
  });

  test('P-B the stale refusal clears once the detailing it asked for exists', async ({ pro: page }) => {
    await runProductionChainFromUi(page);
    await openFoundations(page);
    await page.getByTestId('footing-1').click();
    await expect(page.getByTestId('footing-editor')).toBeVisible();

    // 1–2. Export before foundation detailing: a refusal that names the missing prerequisite.
    await page.getByTestId('footing-cad-export-run').click();
    const failed = page.getByTestId('footing-cad-export-failed');
    await expect(failed).toBeVisible();
    await expect(failed).toContainText(/no detailing assembly/i);

    // 3. Do the thing the refusal asked for.
    await page.getByTestId('floor-design-run').click();
    const summary = page.getByTestId('floor-foundations-summary');
    await expect(summary).toBeVisible({ timeout: 180_000 });
    await expect(summary).toContainText(/1\s+(of|de)\s+1/, { timeout: 180_000 });

    // 4. The obsolete refusal is gone BEFORE any further export attempt. This is the assertion
    //    the defect failed: the advice stayed on screen after it had been followed.
    await expect(failed, 'the obsolete refusal must not survive its own cause')
      .toBeHidden({ timeout: 30_000 });

    // 5. And the export now succeeds.
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByTestId('footing-cad-export-run').click();
    await downloadPromise;
    await expect(page.getByTestId('footing-cad-export-ok')).toBeVisible();
    await expect(page.getByTestId('footing-cad-export-failed')).toBeHidden();
  });
});
