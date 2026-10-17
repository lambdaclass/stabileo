/**
 * The model sanity review through the app: deliberately broken models must each be caught, and
 * the repository's examples must come out with no errors.
 *
 * Every model is loaded and solved as the app does it, then reviewed by the engine through the
 * same adapter the Diagnostics panel uses (`model-sanity.ts`).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store';
import { initSolver } from '../wasm-solver';
import { publishCombinations3D } from '../../store/active-results';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import { CODE_EXAMPLES } from '../../templates/examples';
import { INTENTIONALLY_UNSOLVABLE } from '../../templates/fixture-index';
import { reviewModelSanity, sanityDiagnostics, type SanityReport } from '../model-sanity';
import { setLocale, t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
afterAll(() => setLocale('en'));
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); historyStore.clear(); resultsStore.clear(); });

/** Solve the open model as the app does: every case and combination, or a single solve. */
function solve(): void {
  const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
  if (r && typeof r !== 'string') { publishCombinations3D(r); return; }
  const s = modelStore.solve3D(uiStore.includeSelfWeight, false, true);
  if (s && typeof s !== 'string') resultsStore.setResults3D(s);
}

function review(): SanityReport | null {
  const perCase = resultsStore.perCase3D;
  const out = reviewModelSanity({
    model: { ...(modelStore.model as any), loads: modelStore.loads as any, loadCases: modelStore.model.loadCases },
    perCase,
    single: perCase.size === 0 ? resultsStore.results3D : null,
    modal: resultsStore.modalResult3D,
    includeSelfWeight: uiStore.includeSelfWeight,
    leftHand: false,
  });
  // No structure to review: the model's own checks say why. Only a model with no members may get here.
  if (!out) { expect(modelStore.elements.size + modelStore.quads.size + modelStore.plates.size).toBe(0); return null; }
  return out.report;
}

const codes = (r: SanityReport | null) => (r?.findings ?? []).map((f) => f.code);
const summary = (r: SanityReport | null) => (r?.findings ?? []).map((f) => `${f.severity} ${f.code}: ${f.message}`).join('\n');

// ─── The repository's examples ───────────────────────────────────

/*
 * Warnings the examples raise, each one examined and kept because it is true of the model:
 * the review is right to say it, and the example is right to be as it is. A new warning on an
 * example fails here until it is examined and justified the same way.
 */
const JUSTIFIED_WARNINGS: Record<string, string[]> = {
  // Half the dead and live member loads are given in local Y, which is horizontal for those beams:
  // 1440 kN of the dead case (and 720 kN of the live) push the building sideways, and the columns
  // then carry nothing like their tributary loads. A modelling error in the example, found by the
  // review; its results are what the model says, not what a building would carry.
  '3d-building': ['gravity_case_horizontal', 'gravity_case_horizontal', 'tributary_mismatch', 'tributary_mismatch'],
  // Demo models whose loads carry no case: they fall into case 1, "Dead Load", lateral loads and
  // all. In a PRO solve that case is factored as dead load with its lateral part in it.
  '3d-cantilever-load': ['gravity_case_horizontal'],
  '3d-portal-frame': ['gravity_case_horizontal'],
  '3d-tower': ['gravity_case_horizontal'],
  'tower-3d-2': ['gravity_case_horizontal'],
  'tower-3d-4': ['gravity_case_horizontal'],
  // Gravity member loads typed in local Y (horizontal for those beams), as in 3d-building; with
  // half its floor load pushing sideways, space-frame's floors also weigh less than a building's.
  'space-frame': ['gravity_case_horizontal', 'weight_per_area_low'],
  'torre-irregular-con-retiros': ['gravity_case_horizontal', 'gravity_case_horizontal'],
  // The live case's loads are all along global Y, horizontal in a Z-up model: 569 kN sideways and
  // none down.
  'la-bombonera': ['gravity_case_horizontal'],
  // "Sin peso propio": a weightless material on purpose (the blog's deep-beam comparison), solved
  // with self-weight on, so the warning is literally true and the example intends it.
  'deep-beam-bar': ['density_zero'],
  'deep-beam-shell': ['density_zero'],
  // The diagrid's 42 floors carry no floor loads, only the frame's own weight: 0.22 kN/m². True of
  // the example, which models the structure, not a loaded building.
  'xl-diagrid-tower': ['weight_per_area_low'],
  // A three-level pipe rack reads as a three-storey frame (floors with members across them, on a
  // regular column grid), and carries pipes, not floors: 2.4 kN/m². The band is for buildings and
  // the review cannot tell a rack from one; the warning says what it compared.
  'pipe-rack': ['weight_per_area_low'],
  // Members whose ends move apart sideways by more than L/10 in a linear solve: under the 100-year
  // wind the 1.5 m truss box at the top of the derrick (no diagonals), and under dead load ten
  // members of the stadium's cantilever roof. Local near-mechanisms or very flexible zones in the
  // demo models, which the review is right to point at.
  'offshore-platform': ['deflection_large'],
  'full-stadium': ['deflection_large'],
};

/*
 * Examples whose linear results are absurd, and which the review therefore reports as errors.
 * They are not hidden: a node of the stadium canopy moves 254 m under its own dead load (the IPN
 * rafters bend about their weak axis out of the canopy's plane, held by almost nothing), and the
 * suspension bridge's deck sags 440 m because a cable bridge solved linearly, without the cables'
 * geometric stiffness, is a mechanism. Pinned here so a change to either is seen; the examples
 * themselves need fixing (or a nonlinear solve), which is outside this review.
 */
const KNOWN_ERRORS: Record<string, string[]> = {
  'stadium-canopy': ['displacement_absurd'],
  'suspension-bridge': ['displacement_absurd'],
};

const fixtures = readdirSync('src/lib/templates/fixtures')
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''))
  .filter((f) => !INTENTIONALLY_UNSOLVABLE.has(f));

function expectOnly(id: string, r: SanityReport | null): void {
  const of = (sev: string) => (r?.findings ?? []).filter((f) => f.severity === sev).map((f) => f.code).sort();
  expect(of('error'), summary(r)).toEqual((KNOWN_ERRORS[id] ?? []).slice().sort());
  expect(of('warning'), summary(r)).toEqual((JUSTIFIED_WARNINGS[id] ?? []).slice().sort());
}

describe('repository examples: no errors but the known-broken, every warning justified', () => {
  it.each(Object.keys(CODE_EXAMPLES))('PRO example %s', async (id) => {
    await PRO_EXAMPLES.find((e) => e.id === id)!.load();
    solve();
    expectOnly(id, review());
  }, 600_000);

  it.each(fixtures)('fixture %s', async (id) => {
    await modelStore.loadExample(id);
    solve();
    expectOnly(id, review());
  }, 600_000);
});

// ─── Broken models: each must be caught ──────────────────────────

/** A sound 3-storey steel building from the examples, solved. */
async function building(): Promise<void> {
  await modelStore.loadExample('3d-building');
}

describe('broken models are caught', () => {
  it('E in GPa typed as MPa', async () => {
    await building();
    for (const m of modelStore.materials.values()) modelStore.updateMaterial(m.id, { e: m.e / 1000 });
    solve();
    const r = review();
    const f = r?.findings.find((x) => x.code === 'modulus_implausible');
    expect(f?.severity, summary(r)).toBe('error');
    expect(f!.params.unit).toBe('GPa');
  });

  it('a gravity load in the wrong direction', async () => {
    await building();
    // Every vertical load component reversed, read by the load's own type.
    for (const l of modelStore.loads) {
      if (l.type === 'nodal3d') l.data.fz = -l.data.fz;
      else if (l.type === 'distributed3d') { l.data.qZI = -l.data.qZI; l.data.qZJ = -l.data.qZJ; }
      else if (l.type === 'pointOnElement3d') l.data.pz = -l.data.pz;
      else if (l.type === 'surface3d') l.data.q = -l.data.q;
    }
    uiStore.includeSelfWeight = false;
    solve();
    const r = review();
    expect(codes(r), summary(r)).toContain('gravity_upward');
  });

  it('self-weight left out of a building', async () => {
    await building();
    uiStore.includeSelfWeight = false;
    if (modelStore.analysis?.selfWeight) modelStore.analysis.selfWeight = [];
    solve();
    const r = review();
    expect(codes(r).some((c) => c === 'self_weight_missing' || c === 'weight_per_area_low'), summary(r)).toBe(true);
  });

  it('geometry drawn in millimetres', async () => {
    await building();
    for (const n of modelStore.nodes.values()) modelStore.updateNode(n.id, n.x * 1000, n.y * 1000, (n.z ?? 0) * 1000);
    solve();
    const r = review();
    expect(codes(r), summary(r)).toContain('geometry_scale');
  });

  it('a structure that only just stands: supports on one line', async () => {
    await building();
    const sups = [...modelStore.supports.values()];
    const y0 = Math.min(...sups.map((s) => modelStore.nodes.get(s.nodeId)!.y));
    for (const s of sups) {
      if (modelStore.nodes.get(s.nodeId)!.y !== y0) modelStore.removeSupport(s.id);
      else modelStore.updateSupport(s.id, { type: 'pinned3d' } as never);
    }
    const r = review();
    expect(codes(r), summary(r)).toContain('supports_colinear');
  });

  it('says in the app\'s language what it found and what it could not check', async () => {
    await building();
    solve();
    const out = reviewModelSanity({
      model: { ...(modelStore.model as any), loads: modelStore.loads as any, loadCases: modelStore.model.loadCases },
      perCase: resultsStore.perCase3D, single: resultsStore.results3D, modal: null, includeSelfWeight: uiStore.includeSelfWeight, leftHand: false,
    })!;
    setLocale('es');
    const diags = sanityDiagnostics(out.report, out.shellKeys, t, 'es');
    const skipped = diags.find((d) => d.code === 'SANITY_NOT_CHECKED' && d.message.includes('análisis modal'));
    expect(skipped, diags.map((d) => d.message).join('\n')).toBeTruthy();
    expect(t('diag.tooltip.SANITY_NOT_CHECKED')).not.toBe('diag.tooltip.SANITY_NOT_CHECKED');
  });
});
