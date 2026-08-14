/**
 * PR19 — the visible CAD handoff, from a real committed project.
 *
 * Two rules this spec keeps, both deliberately:
 *
 *   1. THE PROJECT IS OPENED, not seeded. The committed `.ded` fixture goes in through the
 *      toolbar's own file input, so `deserializeProject` → `modelStore.restore` runs exactly as
 *      it does when a user opens a saved project. Loading an example instead would prove the
 *      example loader works.
 *
 *   2. NOTHING IS INJECTED. No assembly, no cage, no manifest. The solve is the toolbar's own
 *      solve, the design is the production design commands, the detailing is the Foundations
 *      panel's own run button, and the export is the panel's own export button. What is
 *      asserted is the file the app actually produced.
 *
 * Validation happens twice, and the two halves are not redundant. The app validates in the page
 * before offering the download — `buildFootingCadHandoff` refuses with `INVALID_MANIFEST` rather
 * than writing a file that fails its own schema — so a download arriving at all is the in-page
 * verdict. The spec then re-validates the DOWNLOADED BYTES against the committed schema file,
 * which catches drift between what the validator accepted in memory and what landed on disk.
 */

import { readFileSync } from 'node:fs';
import { test, expect, solveModel, designAll, openBasicProjectPanel } from './fixtures';
import type { Page } from '@playwright/test';
import { validateAgainstSchema } from '../src/lib/export/json-schema-subset';
import {
  validateRcCadHandoffV2Semantics,
} from '../src/lib/export/rc-cad-handoff-v2-semantics';

/**
 * The schema AS COMMITTED, read from disk rather than imported.
 *
 * Two reasons. It is the exact artifact the CAD side receives, so validating against the file is
 * validating against the contract. And Playwright's Node loader will not take a bare JSON import
 * without an import attribute, which is why `rc-cad-handoff-semantics.ts` is kept free of one.
 */
const SCHEMA = JSON.parse(readFileSync(
  new URL('../src/lib/export/rc-cad-handoff-v2.schema.json', import.meta.url).pathname, 'utf8'));

const FIXTURE = new URL(
  '../src/lib/export/__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url).pathname;

/**
 * Open the committed project through the production file input.
 *
 * The Open control lives on the Básico toolbar — PRO mode has no file picker of its own — so the
 * journey does what a user does: switch to Básico, open the saved project, and let the project
 * put the app back into PRO. `deserializeProject` restores `analysisMode`, `uiStore.appMode`
 * derives from it, and the fixture is saved as the PRO project it is. No test-only load hook is
 * involved at any point.
 */
async function openCommittedProject(page: Page) {
  // First button in the mode toggle is Básico. Selected structurally rather than by label, so
  // the Spanish journeys below use the same helper.
  await page.locator('[data-tour="mode-toggle"] button').first().click();
  // Written before the ribbon reached this branch, this helper reached straight for the
  // input, which no longer exists on load.
  await openBasicProjectPanel(page);
  const input = page.getByTestId('project-open-file');
  await expect(input).toBeAttached();
  await input.setInputFiles(FIXTURE);

  // Wait on real state: the restored project carries eight elements and has returned the app to
  // PRO on its own, because that is the mode it was saved in.
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 30_000 })
    .toBe(8);
  // The app body carries the PRO layout class only when `uiStore.appMode` is 'pro', so this is
  // the assertion that the opened project — not the test — put the app back into PRO.
  await expect(page.locator('.app-body-pro')).toBeAttached();
}

async function openFoundations(page: Page) {
  await page.evaluate(() => window.__stabileoActions.openDesignTab());
  const disclosure = page.getByTestId('floor-families-disclosure');
  await expect(disclosure).toBeVisible();
  await disclosure.locator('summary').first().click();
  await page.getByTestId('floor-family-foundations').click();
  await expect(page.getByTestId('foundations-panel')).toBeVisible();
}

/**
 * The whole production journey, ending with the footing selected and its cage generated.
 *
 * `designAll` is the production design run — the dowels only exist because the column received
 * accepted longitudinal reinforcement, so skipping it produces the documented
 * `footing.run.noColumnBars` blocker instead of a cage.
 */
async function generateTransferCage(page: Page) {
  await openCommittedProject(page);
  await solveModel(page);
  await designAll(page);
  await openFoundations(page);

  // Select the restored footing. Its editor — and the export control — belong to the selection.
  await page.getByTestId('footing-1').click();
  await expect(page.getByTestId('footing-editor')).toBeVisible();

  // The production detailing command, from its own button.
  await page.getByTestId('floor-design-run').click();
  const summary = page.getByTestId('floor-foundations-summary');
  await expect(summary).toBeVisible();
  // Locale-independent: this helper serves the English and Spanish journeys alike, and a bare
  // '1' would also match "0 of 1" — which is how a test can pass while verifying nothing.
  await expect(summary).toContainText(/1\s+(of|de)\s+1/);
}

test.describe('@slow rc cad handoff — the visible export', () => {
  test('C-A the export control is visible on the selected footing, with its scope stated', async ({ pro: page }) => {
    await openCommittedProject(page);
    await openFoundations(page);
    await page.getByTestId('footing-1').click();

    const panel = page.getByTestId('footing-cad-export');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('footing-cad-export-run')).toBeVisible();
    // The scope sentence is on the page, not in a tooltip. A reader must know before they export
    // exactly what the file covers — and what it does NOT.
    //
    // It used to say the footing mats were excluded. That was true of V1 and became false when V2
    // began carrying them, so the assertion moved with the fact rather than pinning the old one.
    await expect(panel).toContainText('column dowels, starter ties and crossties');
    await expect(panel).toContainText('bottom mat in both directions');
    await expect(panel).toContainText('Does NOT include top reinforcement');
    await expect(panel).not.toContainText('Footing mats are not included');
  });

  test('C-B exporting before detailing refuses, and says what to do', async ({ pro: page }) => {
    await openCommittedProject(page);
    await openFoundations(page);
    await page.getByTestId('footing-1').click();
    await page.getByTestId('footing-cad-export-run').click();

    // A refusal, shown verbatim — never a disabled button with no explanation.
    const failed = page.getByTestId('footing-cad-export-failed');
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('Generate foundation detailing first');
    await expect(page.getByTestId('footing-cad-export-ok')).toHaveCount(0);
  });

  test('C-C the production journey downloads a manifest of the real cage', async ({ pro: page }) => {
    await generateTransferCage(page);

    const download = page.waitForEvent('download');
    await page.getByTestId('footing-cad-export-run').click();
    const file = await download;

    // A stable filename: identity and revisions, no timestamp.
    expect(file.suggestedFilename()).toMatch(/^rc-cad-handoff-v2-Z1-det\d+-dem\d+\.json$/);
    expect(file.suggestedFilename()).not.toMatch(/\d{4}-\d{2}-\d{2}/);

    const path = await file.path();
    const text = readFileSync(path!, 'utf8');
    const doc = JSON.parse(text);

    // The panel reports what it wrote, and the reported size matches the file.
    const ok = page.getByTestId('footing-cad-export-ok');
    await expect(ok).toBeVisible();
    await expect(ok).toContainText(file.suggestedFilename());
    await expect(ok).toContainText(String(Buffer.byteLength(text, 'utf8')));

    // The coordinated assembly the production chain actually produces. The UI emits V2: the
    // footing's bottom mat is physical steel and V1 cannot describe it.
    expect(doc.schema).toBe('RcCadHandoffV2');
    expect(doc.schemaVersion).toBe(2);
    expect(doc.assembly.kind).toBe('footingReinforcementAssembly');
    expect(doc.assembly.completeness).toBe('bottomMatAndConnection');
    expect(doc.reinforcement.bars).toHaveLength(46);
    expect(doc.reinforcement.marks).toHaveLength(6);
    // All five families, with the mats individually addressable rather than folded into dowels.
    expect((doc.assembly.families as Array<{ kind: string; barIds: string[] }>)
      .map((fam) => [fam.kind, fam.barIds.length]).sort())
      .toEqual([
        ['columnDowel', 8], ['footingBottomMatX', 10], ['footingBottomMatY', 10],
        ['starterCrosstie', 12], ['starterTie', 6],
      ]);
    expect(doc.concrete.bodies.map((b: { role: string }) => b.role).sort())
      .toEqual(['footing', 'supportedColumn']);
    expect(doc.concrete.interfaces).toHaveLength(1);

    // Exact arcs survived the download intact.
    const arcs = (doc.reinforcement.bars as Array<{ segments: Array<{ kind: string; centre?: unknown }> }>)
      .flatMap((b) => b.segments.filter((s) => s.kind === 'arc'));
    expect(arcs).toHaveLength(62);
    expect(arcs.every((s) => s.centre)).toBe(true);

    // And the limitations are in the file, not only in the UI — including the ones a user must
    // not miss: the mat IS modelled, the top steel was never evaluated, punching with unbalanced
    // moment transfer is not implemented, and four clear distances fail.
    const codes = (doc.unsupported as Array<{ code: string }>).map((n) => n.code);
    expect(codes).toContain('FOOTING_BOTTOM_MAT_MODELED');
    expect(codes).toContain('FOOTING_TOP_REINFORCEMENT_NOT_EVALUATED');
    expect(codes).toContain('PUNCHING_UNBALANCED_MOMENT_UNSUPPORTED');
    expect(codes).toContain('MAT_STARTER_CLEAR_SPACING_FAILURE');
    expect(codes).toContain('COLUMN_COVER_OUT_OF_SCOPE');
    // V1's opposite claim must NOT be here.
    expect(codes).not.toContain('FOOTING_MAT_GEOMETRY_NOT_MODELED');

    // The export must not present this footing as ready to build.
    expect(doc.statuses.constructible).toBe(false);
    expect(doc.statuses.constructibilityBlockers).toEqual(['MAT_STARTER_CLEAR_SPACING_FAILURE']);
    expect(doc.statuses.bottomAnchorage).toBe('FAILED');
    expect(doc.statuses.topReinforcement).toBe('NOT_EVALUATED');
    expect(doc.statuses.punchingMomentTransfer).toBe('UNSUPPORTED');
  });

  test('C-D the downloaded manifest validates against the shipped schema and rules', async ({ pro: page }) => {
    await generateTransferCage(page);
    const download = page.waitForEvent('download');
    await page.getByTestId('footing-cad-export-run').click();
    const file = await download;
    const text = readFileSync((await file.path())!, 'utf8');

    // The app validated it IN THE PAGE before offering the download — `buildFootingCadHandoff`
    // refuses and reports `INVALID_MANIFEST` rather than writing a file that fails its own
    // schema. So a download arriving at all is already the in-page verdict.
    //
    // Re-validating the DOWNLOADED BYTES here, with the same modules the bundle was built from,
    // is the independent half: it catches any drift between what the validator accepted in
    // memory and what actually landed on disk after serialisation.
    const doc = JSON.parse(text);
    const schema = validateAgainstSchema(doc, SCHEMA);
    const semantic = validateRcCadHandoffV2Semantics(doc);
    expect(schema.map((x) => `${x.path}: ${x.message}`), 'schema violations').toEqual([]);
    expect(semantic.map((x) => x.rule), 'semantic violations').toEqual([]);

    // And the bytes are exactly what the producer emits: keys sorted at every level, two-space
    // indent, one trailing newline. A consumer hashing this file gets the same hash Stabileo
    // would, which is what makes the checksum a usable identity.
    expect(`${JSON.stringify(sortKeys(doc), null, 2)}\n`).toBe(text);
  });

  test('C-E the manifest never converts an unevaluated check into a pass', async ({ pro: page }) => {
    await generateTransferCage(page);
    const download = page.waitForEvent('download');
    await page.getByTestId('footing-cad-export-run').click();
    const doc = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));

    type Check = {
      checkKind: string; authority: string; evaluationStatus: string;
      notEvaluatedReason?: string; consumerObservationPolicy: string; findings?: unknown[];
      scope?: { bodyIds?: string[] };
    };
    const checks = doc.checks as Check[];

    const containment = checks.find((c) => c.checkKind === 'reinforcementContainment')!;
    expect(containment.evaluationStatus).toBe('NOT_EVALUATED');
    expect(containment.authority).toBe('none');
    expect(containment.notEvaluatedReason).toBeTruthy();

    const covers = checks.filter((c) => c.checkKind === 'concreteCover');
    expect(covers).toHaveLength(2);
    for (const c of covers) expect(c.evaluationStatus).toBe('NOT_EVALUATED');

    // Column cover is not merely unevaluated — a consumer must not measure it at all here.
    const columnCover = covers.find((c) => c.scope?.bodyIds?.some((b) => b.includes('column')))!;
    expect(columnCover.consumerObservationPolicy).toBe('OUT_OF_SCOPE');

    for (const c of checks) {
      if (c.evaluationStatus !== 'NOT_EVALUATED') continue;
      expect(c.findings ?? []).toHaveLength(0);
      expect(c.consumerObservationPolicy).not.toBe('MAY_CROSS_CHECK');
    }

    // And the footing cover requirement is bound to the footing alone.
    const cover = doc.requirements.cover[0];
    expect(cover.appliesToBodyIds).toEqual(['body:footing:1']);
    expect(cover.measurementScope.excludeInterfaceIds)
      .toEqual([doc.concrete.interfaces[0].interfaceId]);
  });

  test('C-F the authoritative Stabileo collision verdict reaches the file', async ({ pro: page }) => {
    await generateTransferCage(page);
    const download = page.waitForEvent('download');
    await page.getByTestId('footing-cad-export-run').click();
    const doc = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));

    const collision = (doc.checks as Array<{
      checkKind: string; authority: string; evaluationStatus: string;
      findings?: Array<{ pairClass: string; shortfall: number }>;
    }>).find((c) => c.checkKind === 'barCollision')!;

    expect(collision.authority).toBe('stabileo');
    expect(collision.evaluationStatus).toBe('EVALUATED');
    // ZERO interpenetrations, and that is a RESULT reaching the file rather than an absence.
    // There used to be twelve, where all eight starter hooks turned toward the column centre in
    // one plane; the hooks are now seated on the mat layer each leg crosses.
    expect(collision.findings ?? []).toHaveLength(0);

    // The four that DO survive are clear-spacing failures, and they reach the file too — a
    // download that reported only the clean collision verdict would read as a pass.
    const spacing = (doc.checks as Array<{
      checkKind: string; evaluationStatus: string;
      findings?: Array<{ pairClass: string; severity: string; measured: number; required: number }>;
    }>).find((c) => c.checkKind === 'barClearSpacing')!;
    expect(spacing.evaluationStatus).toBe('EVALUATED');
    expect(spacing.findings).toHaveLength(4);
    for (const f of spacing.findings!) {
      expect(f.pairClass).toBe('sameLayerSpacing');
      expect(f.severity).toBe('clearance');
      expect(f.measured).toBeLessThan(f.required);
    }
    expect(doc.statuses.constructible).toBe(false);
  });
});

test.describe('@slow rc cad handoff — Spanish', () => {
  test.use({ appLocale: 'es' });

  test('C-G every exported sentence is translated, not pasted English', async ({ pro: page }) => {
    await generateTransferCage(page);
    const download = page.waitForEvent('download');
    await page.getByTestId('footing-cad-export-run').click();
    const doc = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));

    const mat = (doc.unsupported as Array<{ code: string; text: string }>)
      .find((n) => n.code === 'FOOTING_BOTTOM_MAT_MODELED')!;
    expect(mat.text).toContain('parrilla inferior');
    // The key travels with the text, so a consumer can re-render it in its own locale.
    expect(mat.text).not.toBe('footing.cadv2.scope.bottomMatModeled');

    // The new V2 sentences are translated too, not pasted keys — including the one a user most
    // needs to read: four clear distances fail and the assembly is not constructible.
    const spacing = (doc.unsupported as Array<{ code: string; text: string }>)
      .find((n) => n.code === 'MAT_STARTER_CLEAR_SPACING_FAILURE')!;
    expect(spacing.text).toContain('NO es constructible');
    expect(spacing.text).not.toBe('footing.cadv2.unsupported.matStarterSpacing');

    // No sentence in the document is a bare i18n key — which is what `t()` returns when a
    // translation is missing, and how a missing Spanish string would ship invisibly.
    const notes = [...doc.unsupported, ...doc.assumptions] as Array<{ text: string }>;
    for (const n of notes) expect(n.text).not.toMatch(/^footing\.cad\./);

    await expect(page.getByTestId('footing-cad-export')).toContainText('Entrega a CAD');
  });
});

test.describe('@slow rc cad handoff — Spanish refusals', () => {
  test.use({ appLocale: 'es' });

  test('C-H a refusal is translated too', async ({ pro: page }) => {
    await openCommittedProject(page);
    await openFoundations(page);
    await page.getByTestId('footing-1').click();
    await page.getByTestId('footing-cad-export-run').click();

    const failed = page.getByTestId('footing-cad-export-failed');
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('detallado de fundaciones');
  });
});

/** Independent re-implementation of the producer's key ordering, so the check is not circular. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
