/**
 * Every advanced analysis of Basic mode, on every Basic example.
 *
 * The 2D examples go through P-Δ, buckling, modal, plastic collapse, the
 * combination envelope, a moving train and an influence line; the 3D ones
 * through each of those that exists in 3D (P-Δ, buckling, modal, envelope).
 * Each has to run and give an answer an engineer would accept for that
 * model — not merely return:
 *
 *  - P-Δ converges, is stable, and amplifies the peak displacement by a
 *    plausible B₂ (the examples are all well below their buckling load).
 *  - Buckling either finds a first mode above the applied load, or says the
 *    model has no compressed bar — a beam under gravity has nothing to buckle.
 *  - The first natural frequency is a real one, not a mechanism's zero.
 *  - Plastic collapse ends in a mechanism, except where the uniqueness theorem
 *    says it cannot: a settlement or a temperature alone is self-equilibrated
 *    and only uses up the redundancy.
 *
 * The lists are the Basic example menu's (ToolbarExamples.svelte).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { solvePDelta, solveBuckling, solveModal, solvePDelta3D, solveBuckling3D, solveModal3D, solve3D } from '../wasm-solver';
import { solveMovingLoads, getPredefinedTrains } from '../moving-loads';
import { computeInfluenceLine } from '../influence-service';
import { runPlasticCollapse } from '../../actions/plastic';

const EX2 = ['simply-supported', 'cantilever', 'cantilever-point', 'point-loads', 'gerber-beam', 'continuous-beam',
  'spring-support', 'settlement', 'thermal', 'truss', 'warren-truss', 'howe-truss', 'three-hinge-arch',
  'portal-frame', 'two-story-frame', 'bridge-moving-load', 'frame-cirsoc-dl', 'building-3story-dlw', 'frame-seismic'];
const EX3 = ['3d-cantilever-load', '3d-torsion-beam', 'hinged-arch-3d', '3d-portal-frame', 'grid-beams',
  '3d-space-truss', 'space-frame', 'tower-3d-2', 'tower-3d-4', '3d-nave-industrial'];

/* P-Δ does not take prescribed displacements yet; the UI says so instead of running. */
const PRESCRIBED = new Set(['settlement']);
/* Self-equilibrated actions: they use up redundancy but cannot collapse a structure. */
const NO_COLLAPSE = new Set(['settlement', 'thermal']);

const densities = () => new Map([...modelStore.materials].map(([id, m]) => [id, ((m.rho ?? 78.5) * 1000) / 9.81]));

function bucklingOk(run: () => { modes: Array<{ loadFactor: number }> }) {
  try {
    const r = run();
    expect(r.modes[0].loadFactor).toBeGreaterThan(1);
  } catch (e) {
    expect(String((e as Error)?.message ?? e)).toMatch(/no compressed elements/i);
  }
}

async function load(name: string, mode: '2d' | '3d') {
  historyStore.clear();
  uiStore.analysisMode = mode;
  modelStore.clear();
  await modelStore.loadExample(name);
}

describe('advanced analyses on the Basic 2D examples', () => {
  beforeAll(() => { uiStore.analysisMode = '2d'; });

  it.each(EX2)('%s', async (name) => {
    await load(name, '2d');
    const input = modelStore.buildSolverInput(false)!;

    if (!PRESCRIBED.has(name)) {
      const pd = solvePDelta(input);
      expect(pd.converged).toBe(true);
      expect(pd.isStable).toBe(true);
      expect(pd.b2Factor).toBeGreaterThan(0.9);
      expect(pd.b2Factor).toBeLessThan(3);
    }

    bucklingOk(() => solveBuckling(input));

    const modal = solveModal(input, densities());
    expect(modal.modes.length).toBeGreaterThanOrEqual(3);
    expect(modal.modes[0].frequency).toBeGreaterThan(0.5);

    const plastic = runPlasticCollapse()!.result;
    expect(Number.isFinite(plastic.collapseFactor)).toBe(true);
    expect(plastic.collapseFactor).toBeGreaterThan(0);
    expect(plastic.isMechanism).toBe(!NO_COLLAPSE.has(name));

    const combos = modelStore.solveCombinations(false);
    expect(combos && typeof combos !== 'string' && combos.envelope).toBeTruthy();

    const train = solveMovingLoads(input, { train: getPredefinedTrains()[0], step: 0.5 });
    expect(typeof train !== 'string' && train.positions.length).toBeGreaterThan(0);

    const sup = [...modelStore.supports.values()][0];
    const il = computeInfluenceLine(modelStore.model as never, 'Rz' as never, sup.nodeId);
    expect(typeof il !== 'string' && (il as { points: unknown[] }).points.length).toBeGreaterThan(0);
  }, 120_000);
});

describe('advanced analyses on the Basic 3D examples', () => {
  it.each(EX3)('%s', async (name) => {
    await load(name, '3d');
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;

    expect(solve3D(input).displacements.length).toBeGreaterThan(0);

    const pd = solvePDelta3D(input);
    expect(pd.converged).toBe(true);
    expect(pd.isStable).toBe(true);
    expect(pd.b2Factor).toBeGreaterThan(0.9);
    expect(pd.b2Factor).toBeLessThan(3);

    bucklingOk(() => solveBuckling3D(input));

    const modal = solveModal3D(input, densities());
    expect(modal.modes.length).toBeGreaterThanOrEqual(3);
    expect(modal.modes[0].frequency).toBeGreaterThan(0.5);

    const combos = modelStore.solveCombinations3D(false);
    expect(combos && typeof combos !== 'string').toBeTruthy();
  }, 120_000);
});
