/**
 * The advanced analyses' wire contracts.
 *
 * PRO's Advanced panel builds a JSON payload per analysis and hands it to a
 * WASM export that deserialises into a named Rust struct. An audit of all 17
 * found that thirteen of them sent a payload the engine had never accepted:
 * harmonic sent `fMin/fMax/nPoints` where the engine wants a `frequencies`
 * list, SSI sent `direction: "Y"` where it wants an axis index, staged sent a
 * nested `solver` where the struct is flat, creep sent one `concrete` block
 * where it wants parameters per material, the section analyser sent a named
 * shape where it wants polygons, and so on. Every one of them failed at the
 * deserialiser with "Parse error: missing field ...", which the panel then
 * displayed as the single word "Error". (Contact and time history were the
 * exceptions: their payloads hit no field at all — `contactElements` on one,
 * the 2D `groundAccel`/`groundDirection` pair on the other — and with no
 * `deny_unknown_fields` serde dropped them silently, so the "contact" solve
 * ran as a plain linear one and the time history ran with zero ground
 * motion.)
 *
 * These tests call the same wrappers with payload shapes hand-copied from
 * the panel — nothing enforces the match, so when the panel changes, update
 * these by hand. The contact and time-history tests below additionally
 * assert that the input actually reaches the solver, because a parse-only
 * check cannot catch a payload the deserialiser silently ignores. They are
 * contract tests: a payload that no longer parses is a regression, whatever
 * the numbers come out as. They need the real WASM engine, because the
 * deserialiser IS the thing under test.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { buildSolverInput3D } from '../solver-service';
import * as wasmSolver from '../wasm-solver';
import {
  solveHarmonic3D, solveSSI3D, solveStaged3D, solveCreepShrinkage3D,
  solveWithImperfections3D, computeInfluenceLine3D, solveMultiCase3D,
  analyzeSection, solveConstrained3D, solveWinkler3D, solveContact3D,
  solveTimeHistory3D,
  solveArcLength, solveDisplacementControl, solveCable2D, guyanReduce2D,
  craigBampton2D,
} from '../wasm-solver';

beforeAll(async () => {
  await new Promise(r => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

/** A 3D portal: two columns and a beam, fixed at the base. */
function portal3D() {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(0, 0, 3);
  const c = modelStore.addNode(4, 0, 3);
  const d = modelStore.addNode(4, 0, 0);
  modelStore.addElement(a, b, 'frame');
  modelStore.addElement(b, c, 'frame');
  modelStore.addElement(c, d, 'frame');
  modelStore.addSupport(a, 'fixed');
  modelStore.addSupport(d, 'fixed');
  modelStore.addNodalLoad(b, 10, -20);
  return { a, b, c, d };
}

function input3D() {
  const input = buildSolverInput3D(
    { nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
      loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
      quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
      connectors: modelStore.connectors },
    false, false, { expandMemberOffsets: false },
  );
  expect(input, 'the fixture should build a solver input').toBeTruthy();
  return input!;
}

/** Mass densities in kg/m³, the units every dynamic export expects. */
function densities(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, mat] of modelStore.materials) {
    out[String(id)] = ((mat as { rho?: number }).rho ?? 0) * 1000 / 9.81;
  }
  return out;
}

describe('advanced analyses: 3D payloads the engine accepts', () => {
  beforeEach(() => { uiStore.analysisMode = 'pro'; portal3D(); });

  it('harmonic takes an explicit frequency list and a response node', () => {
    const res = solveHarmonic3D({
      solver: input3D(), densities: densities(),
      frequencies: [1, 2, 3, 4, 5],
      dampingRatio: 0.05,
      responseNodeId: 2,
      responseDof: 'x',
    });
    // One response point per requested frequency: that is the contract. The
    // peak itself depends on the fixture's mass, which is not what this test
    // pins.
    expect(res.responsePoints).toHaveLength(5);
    expect(res.responsePoints.map((p: { frequency: number }) => p.frequency)).toEqual([1, 2, 3, 4, 5]);
    expect(Number.isFinite(res.peakAmplitude)).toBe(true);
  });

  it('SSI takes an axis index and a tagged soil curve', () => {
    const res = solveSSI3D({
      solver: input3D(),
      soilSprings: [{
        nodeId: 2, direction: 1, tributaryLength: 1,
        curve: { type: 'py_soft_clay', su: 50, gamma_eff: 18, d: 0.6, depth: 5, eps_50: 0.01 },
      }],
      maxIter: 20, tolerance: 1e-4,
    });
    expect(res.results.displacements.length).toBeGreaterThan(0);
    expect(typeof res.converged).toBe('boolean');
  });

  it('staged construction flattens the model beside the stages', () => {
    const res = solveStaged3D({
      solver: input3D(),
      stages: [{ name: 'Etapa 1', elementsAdded: [...modelStore.elements.keys()], elementsRemoved: [], loadIndices: [] }],
    });
    expect(res.stages).toHaveLength(1);
    expect(res.stages[0].stageName).toBe('Etapa 1');
  });

  it('creep takes parameters per material and steps keyed on tDays', () => {
    const creepParams: Record<string, unknown> = {};
    for (const [id] of modelStore.materials) {
      creepParams[String(id)] = { fc: 30, rh: 60, h0: 200, t0: 28, cementClass: 'N' };
    }
    const res = solveCreepShrinkage3D({
      solver: input3D(), creepParams, timeSteps: [{ tDays: 365 }],
    });
    expect(res.steps).toHaveLength(1);
    expect(res.steps[0].creepCoefficient).toBeGreaterThan(0);
  });

  it('imperfections takes a notional-load block, not a type and an amplitude', () => {
    const res = solveWithImperfections3D({
      solver: input3D(),
      imperfections: { notionalLoads: [{ ratio: 0.005, direction: 0, gravityAxis: 2 }] },
    });
    expect(res.displacements.length).toBeGreaterThan(0);
  });

  it('influence line takes a named quantity and a target on a member', () => {
    const res = computeInfluenceLine3D({
      solver: input3D(), quantity: 'My_diag',
      targetElementId: [...modelStore.elements.keys()][1],
      targetPosition: 0.5, gravityDirection: 'z',
    });
    expect(res.quantity).toBe('My_diag');
    expect(res.points.length).toBeGreaterThan(0);
  });

  it('multi-case takes the load vectors themselves, not case ids', () => {
    const loads = input3D().loads;
    const res = solveMultiCase3D({
      solver: input3D(),
      loadCases: [{ name: 'D', loads }, { name: 'L', loads }],
      combinations: [{ name: '1.2D + 1.6L', factors: { D: 1.2, L: 1.6 } }],
    });
    expect(res.caseResults).toHaveLength(2);
    expect(res.combinationResults).toHaveLength(1);
  });

  it('the constrained solve takes tagged constraints', () => {
    const res = solveConstrained3D({
      solver: input3D(),
      constraints: [{ type: 'rigidLink', masterNode: 2, slaveNode: 3, dofs: [] }],
    });
    // Like Winkler, this one returns the results themselves.
    expect(res.displacements.length).toBeGreaterThan(0);
  });

  it('Winkler returns the results directly, with no wrapper object', () => {
    const res = solveWinkler3D({
      solver: input3D(),
      foundationSprings: [{ elementId: [...modelStore.elements.keys()][1], ky: 1000 }],
    });
    expect(res.displacements.length).toBeGreaterThan(0);
    expect(res.results, 'Winkler has no nested results field').toBeUndefined();
  });

  it('time history takes one ground series per axis, and the motion reaches the solver', () => {
    const accel = Array.from({ length: 50 }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 2 * i * 0.02));
    const base = {
      solver: input3D(), densities: densities(),
      timeStep: 0.02, nSteps: 50, method: 'newmark', beta: 0.25, gamma: 0.5, dampingXi: 0.05,
    };
    const peak = (r: any) => Math.max(
      ...r.peakDisplacements.map((d: any) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0)),
    );
    const res = solveTimeHistory3D({ ...base, groundAccelX: accel });
    // The old payload sent the 2D pair { groundAccel, groundDirection },
    // which hit no field on TimeHistoryInput3D: `has_ground` stayed false
    // and the run fell back to the static loads as the only excitation. If
    // the per-axis series is ever dropped again, `res` degenerates to
    // exactly this — so the two peaks must differ.
    const dropped = solveTimeHistory3D({ ...base, groundAccel: accel, groundDirection: 'X' });
    expect(res.nSteps).toBe(50);
    expect(peak(res)).toBeGreaterThan(0);
    expect(
      Math.abs(peak(res) - peak(dropped)),
      'a run whose ground motion arrived must not match a zero-ground run',
    ).toBeGreaterThan(1e-6);
  });

  it('contact takes element behaviors keyed on the element id, and they engage', () => {
    // Push the left column down along its own axis so it is unambiguously in
    // compression (the fixture's own loads land off-axis and leave it in
    // tension): a tension-only behavior must then knock it out. A
    // behavior-less linear solve reports an EMPTY elementStatus — if the
    // engine ignores the map (as it did with the old `contactElements`
    // payload, which hit no field and was silently dropped), both
    // assertions below fail.
    const columnId = [...modelStore.elements.keys()][0];
    const topLeft = [...modelStore.nodes.values()].find(n => n.x === 0 && n.z === 3)!;
    modelStore.addNodalLoad3D(topLeft.id, 0, 0, -50, 0, 0, 0);
    const res = solveContact3D({
      solver: input3D(),
      // `ContactInput3D.element_behaviors`; the engine matches the exact
      // snake_case strings 'tension_only' / 'compression_only'.
      elementBehaviors: { [String(columnId)]: 'tension_only' },
    });
    expect(res.results.displacements.length).toBeGreaterThan(0);
    expect(typeof res.iterations).toBe('number');
    const column = res.elementStatus.find((s: { elementId: number }) => s.elementId === columnId);
    expect(column, 'the behavior should produce a status entry').toBeTruthy();
    expect(column.status, 'a compressed tension-only column should go slack').toBe('inactive');
  });

  it('the section analyser takes polygons, not a named shape', () => {
    const res = analyzeSection({
      polygons: [{ vertices: [[-0.15, -0.25], [0.15, -0.25], [0.15, 0.25], [-0.15, 0.25]] }],
    });
    expect(res.a).toBeCloseTo(0.3 * 0.5, 6);
    expect(res.iy).toBeGreaterThan(0);
  });
});

/**
 * These four are NOT surfaced in PRO — the engine only has them in 2D, and a
 * PRO model is spatial, so every one of them collapsed on the way in. The
 * wrappers stay, and so do their contracts: whoever wires them into a 2D
 * workspace should find them already pinned rather than guess the payload the
 * way the PRO panel did.
 */
describe('advanced analyses: the four the engine only has in 2D', () => {
  /** A 2D cantilever in the X–Y plane, which is the plane the 2D build reads.
   *  Three nodes, so a reduction has both a boundary node to retain and an
   *  interior one to condense out. */
  function cantilever2D() {
    modelStore.clear();
    const a = modelStore.addNode(0, 0);
    const b = modelStore.addNode(2, 0);
    const c = modelStore.addNode(4, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addElement(b, c, 'frame');
    modelStore.addSupport(a, 'fixed');
    modelStore.addNodalLoad(c, 0, -10);
    return { a, b, c };
  }

  beforeEach(() => { uiStore.analysisMode = '2d'; cantilever2D(); });

  function input2D() {
    const input = modelStore.buildSolverInput(false);
    expect(input).toBeTruthy();
    return input!;
  }

  it('arc-length caps the path with maxSteps', () => {
    const res = solveArcLength({ solver: input2D(), maxIter: 20, tolerance: 1e-6, maxSteps: 5 });
    expect(res.steps.length).toBeGreaterThan(0);
    expect(typeof res.finalLoadFactor).toBe('number');
  });

  it('displacement control takes a DOF index and nSteps', () => {
    const { c } = cantilever2D();
    const res = solveDisplacementControl({
      solver: input2D(), controlNode: c, controlDof: 1,
      targetDisplacement: -0.01, nSteps: 5,
    });
    expect(res.steps.length).toBeGreaterThan(0);
  });

  it('cable takes { solver, densities }, not a bare solver input', () => {
    const res = solveCable2D(input2D(), 20, 1e-6, densities());
    expect(res.displacements.length).toBeGreaterThan(0);
  });

  it('Guyan condenses by boundary NODE, not by raw DOF index', () => {
    // A FREE node: the condensation needs boundary DOFs to retain, and a
    // fixed support has none.
    const { b } = cantilever2D();
    const res = guyanReduce2D({ solver: input2D(), boundaryNodes: [b] });
    expect(res.nBoundary).toBeGreaterThan(0);
    expect(res.displacements.length).toBeGreaterThan(0);
  });

  it('Craig-Bampton additionally needs nModes and densities', () => {
    const { b } = cantilever2D();
    const res = craigBampton2D({
      solver: input2D(), boundaryNodes: [b], nModes: 2, densities: densities(),
    });
    expect(res.kReduced.length).toBeGreaterThan(0);
  });
});
