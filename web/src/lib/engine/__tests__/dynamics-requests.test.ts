/**
 * The dynamic analyses' requests, against the real engine.
 *
 * Every builder here is the one PRO's advanced panel calls, so these are not copies of the
 * panel's payloads — they are the payloads. Each test asserts that its input REACHES the solver
 * and changes the answer the way the physics says it must, because a payload that parses can
 * still be ignored: serde drops unknown fields without a word.
 *
 * The model is a single-degree-of-freedom frame — two nearly massless columns under a rigid,
 * heavy girder — so every expected value has a closed form.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { buildSolverInput3D } from '../solver-service';
import * as wasmSolver from '../wasm-solver';
import { solveModal3D, solveSpectral3D, solveTimeHistory3D } from '../wasm-solver';
import {
  G, massDensities, spectralModesFrom, cumulativeMassRatios, timeHistoryFields,
  sineAccelerogram, parseAccelerogramG, peakBaseShear, isValidHhtAlpha,
} from '../dynamics/requests';

beforeAll(async () => {
  await new Promise(r => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const H = 3, L = 4;
const COL_I = 0.3 * 0.3 ** 3 / 12;
/** kN/m³. The girder is 1 m² × 4 m, so it weighs 96 kN and has a mass of 96 / g t. */
const GIRDER_RHO = 24;
const GIRDER_MASS_T = GIRDER_RHO * 1 * L / G;

function sdofFrame(opts: { slab?: boolean } = {}) {
  modelStore.clear();
  modelStore.restore({
    nodes: [
      [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: H }],
      [3, { id: 3, x: L, y: 0, z: H }], [4, { id: 4, x: L, y: 0, z: 0 }],
      ...(opts.slab ? [
        [5, { id: 5, x: 0, y: L, z: 0 }], [6, { id: 6, x: 0, y: L, z: H }],
        [7, { id: 7, x: L, y: L, z: H }], [8, { id: 8, x: L, y: L, z: 0 }],
      ] : []),
    ],
    materials: [
      [1, { id: 1, name: 'col', e: 30000, nu: 0.2, rho: 1e-9 }],
      [2, { id: 2, name: 'girder', e: 3e8, nu: 0.2, rho: GIRDER_RHO }],
      [3, { id: 3, name: 'slab', e: 30000, nu: 0.2, rho: 24 }],
    ],
    sections: [
      [1, { id: 1, name: 'c', a: 0.09, iz: COL_I, iy: COL_I, j: 2 * COL_I }],
      [2, { id: 2, name: 'g', a: 1, iz: 1, iy: 1, j: 1 }],
    ],
    elements: [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 2, sectionId: 2 }],
      [3, { id: 3, type: 'frame', nodeI: 4, nodeJ: 3, materialId: 1, sectionId: 1 }],
      ...(opts.slab ? [
        [4, { id: 4, type: 'frame', nodeI: 5, nodeJ: 6, materialId: 1, sectionId: 1 }],
        [5, { id: 5, type: 'frame', nodeI: 8, nodeJ: 7, materialId: 1, sectionId: 1 }],
      ] : []),
    ],
    supports: [
      [1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 4, type: 'fixed3d' }],
      ...(opts.slab ? [[3, { id: 3, nodeId: 5, type: 'fixed3d' }], [4, { id: 4, nodeId: 8, type: 'fixed3d' }]] : []),
    ],
    loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
    nextId: { node: 20, material: 10, section: 10, element: 20, support: 10, load: 10 },
  } as never);
  if (opts.slab) modelStore.addQuad([2, 3, 7, 6], 3, 0.2);
  const input = buildSolverInput3D({
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
    connectors: modelStore.connectors,
  } as never, false, false, { expandMemberOffsets: false })!;
  return { input, densities: massDensities(modelStore.materials) };
}

/** The mode that carries the X mass: the sway mode of the frame. */
function swayModeX(modal: any) {
  return modal.modes.reduce((a: any, b: any) => (b.effectiveMassX > a.effectiveMassX ? b : a));
}

describe('mass densities', () => {
  it('converts the weight density the model stores into the mass density the engine reads', () => {
    const d = massDensities([[1, { rho: 24 }], [2, { rho: 78.5 }]]);
    expect(d.get(1)).toBeCloseTo(24_000 / G, 6);
    expect(d.get(2)).toBeCloseTo(78_500 / G, 6);
  });

  it('gives a diaphragm penalty material a negligible but non-zero density', () => {
    const d = massDensities([[1, { rho: 24 }]], [1, 99]);
    expect(d.get(1)).toBeCloseTo(24_000 / G, 6);
    expect(d.get(99)).toBe(1);
  });
});

describe('modal', () => {
  it('weighs the girder in tonnes', () => {
    const { input, densities } = sdofFrame();
    const modal = solveModal3D(input as never, densities, 4);
    expect(modal.totalMass).toBeCloseTo(GIRDER_MASS_T, 3);
    expect(swayModeX(modal).effectiveMassX).toBeCloseTo(GIRDER_MASS_T, 2);
  });

  it('carries the slab: a quad adds its mass', () => {
    // The wrapper used to send only nodes, materials, sections, elements, supports and loads.
    const { input, densities } = sdofFrame({ slab: true });
    const modal = solveModal3D(input as never, densities, 4);
    const slabMass = 24 * 0.2 * L * L / G;
    expect(modal.totalMass).toBeCloseTo(GIRDER_MASS_T + slabMass, 2);
  });

  it('accumulates mass ratios, not participation factors', () => {
    const c = cumulativeMassRatios([
      { massRatioX: 0.7, massRatioY: 0.1 }, { massRatioX: 0.2, massRatioY: 0.6 }, { massRatioX: 0.05 },
    ]);
    expect(c.x.map(v => +v.toFixed(3))).toEqual([0.7, 0.9, 0.95]);
    expect(c.y.map(v => +v.toFixed(3))).toEqual([0.1, 0.7, 0.7]);
  });
});

describe('spectral', () => {
  it('parses, and gives the SDOF base shear m·Sa in each direction it is asked for', () => {
    const { input, densities } = sdofFrame();
    const modal = solveModal3D(input as never, densities, 4);
    const modes = spectralModesFrom(modal);
    const sa = 1; // m/s², flat
    const spectrum = { name: 'flat', points: [{ period: 0, sa }, { period: 10, sa }], inG: false };
    const x = solveSpectral3D({ solver: input as never, modes, densities, spectrum, direction: 'X', rule: 'SRSS' });
    expect(x.baseShear).toBeCloseTo(GIRDER_MASS_T * sa, 1);
    expect(x.perMode.length).toBe(modes.length);
    const peak = x.perMode.reduce((a: any, b: any) => (Math.abs(b.modalForce) > Math.abs(a.modalForce) ? b : a));
    expect(Math.abs(peak.modalForce)).toBeCloseTo(GIRDER_MASS_T * sa, 1);
  });
});

describe('time history', () => {
  /** Mean period between upward zero crossings of a series sampled at `dt`. */
  function measuredPeriod(u: number[], dt: number, from: number): number {
    const ups: number[] = [];
    for (let i = from + 1; i < u.length; i++) {
      if (u[i - 1]! < 0 && u[i]! >= 0) ups.push((i - 1 + u[i - 1]! / (u[i - 1]! - u[i]!)) * dt);
    }
    return (ups[ups.length - 1]! - ups[0]!) / (ups.length - 1);
  }

  /** `dt` is chosen per case so that each period spans some 70 samples. */
  function freeVibration(densities: Map<number, number>, input: unknown, dt = 0.002) {
    const nSteps = 800;
    // A short pulse, then nothing: what follows is free vibration at the frame's own period.
    const pulse = Array.from({ length: nSteps }, (_, i) => (i < 5 ? G : 0));
    const res = solveTimeHistory3D({
      solver: input,
      ...timeHistoryFields({ densities, dt, nSteps, direction: 'X', groundAccel: pulse, dampingXi: 0.001, method: 'newmark' }),
    });
    const girder = res.nodeHistories.find((h: any) => h.nodeId === 2);
    return { period: measuredPeriod(girder.ux, dt, 10), res };
  }

  it('vibrates at the modal period, which needs the mass density the engine reads', () => {
    const { input, densities } = sdofFrame();
    const T = swayModeX(solveModal3D(input as never, densities, 4)).period;
    expect(freeVibration(densities, input).period).toBeCloseTo(T, 2);

    // The payload used to send the weight density itself. That is 1000/g times less mass, and
    // the frame then rang √(1000/g) ≈ 10× faster than the modal analysis of the same model.
    const raw = new Map([...modelStore.materials].map(([id, m]) => [id, m.rho]));
    expect(freeVibration(raw, input, 0.0002).period / T).toBeCloseTo(1 / Math.sqrt(1000 / G), 2);
  });

  it('runs HHT-α when HHT is chosen, and not Newmark under its name', () => {
    const { input, densities } = sdofFrame();
    const common = { densities, dt: 0.005, nSteps: 50, direction: 'X' as const, groundAccel: sineAccelerogram(0.1, 2, 0.005, 50), dampingXi: 0.05 };
    const hht = solveTimeHistory3D({ solver: input, ...timeHistoryFields({ ...common, method: 'hht', alpha: -0.1 }) });
    expect(hht.method).toMatch(/^HHT/);
    const nm = solveTimeHistory3D({ solver: input, ...timeHistoryFields({ ...common, method: 'newmark' }) });
    expect(nm.method).toMatch(/^Newmark/);
    expect(() => timeHistoryFields({ ...common, method: 'hht', alpha: -0.5 })).toThrow();
    expect(isValidHhtAlpha(-1 / 3)).toBe(true);
    expect(isValidHhtAlpha(0.01)).toBe(false);
  });

  it('reads the base shear from the reactions the engine returns', () => {
    const { input, densities } = sdofFrame();
    const { res } = freeVibration(densities, input);
    expect(res.peakReactions.length).toBe(2);
    expect(peakBaseShear(res.peakReactions)).toBeGreaterThan(0);
    expect(peakBaseShear([{ fx: 3, fy: 0 }, { fx: 1, fy: 3 }])).toBeCloseTo(5, 9);
  });
});

describe('accelerograms', () => {
  it('reads amplitudes in g and sends m/s²', () => {
    const s = sineAccelerogram(0.3, 1, 0.25, 2);
    expect(s[1]).toBeCloseTo(0.3 * G, 9);
    expect(parseAccelerogramG('0.1, 0.2; -0.3  x')).toEqual([0.1 * G, 0.2 * G, -0.3 * G]);
  });
});
