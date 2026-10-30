/**
 * A single degree of freedom system the engine can solve: a massless bar of
 * axial stiffness EA/L = k, pinned at one end, on a roller at the other that
 * carries the mass m. Its one free degree of freedom is that roller's ux, so
 * the engine's modal, harmonic and time-history analyses of it are the
 * closed-form system's, computed the matrix way.
 */
import type { SolverInput } from '../../types';
import { solveModal, solveHarmonic2D, solveTimeHistory2D, isWasmReady } from '../../wasm-solver';
import { densityRecord } from '../requests';
import type { SdofProps, Harmonic } from './sdof';

const NODE = 2;

export function sdofSyntheticInput(m: number, k: number) {
  const base: SolverInput = {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [NODE, { id: NODE, x: 1, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: k / 1000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 1, iz: 1 }]]),
    elements: new Map([[1, { id: 1, type: 'truss', nodeI: 1, nodeJ: NODE, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: NODE, type: 'rollerX' }]]),
    loads: [],
    masses: { nodal: [{ nodeId: NODE, mass: m }] },
  };
  const densities = new Map([[1, 0]]);
  const forced = (F0: number): SolverInput => ({ ...base, loads: [{ type: 'nodal', data: { nodeId: NODE, fx: F0, fz: 0, my: 0 } }] });
  return { input: base, densities, node: NODE, forced };
}

export interface EngineCheck {
  omega: number | null;
  /** Steady-state amplitude at Ω, when there is a force. */
  X: number | null;
  /** u(t) at the sampled times, from rest, when there is a force. */
  history: Array<[number, number]> | null;
}

/**
 * The engine's answer for the same system: ω from the modal analysis, the
 * steady amplitude from the harmonic one and the history from rest from the
 * time integration. Null where the engine is not loaded or cannot run it.
 */
export function engineCheck(p: SdofProps, h: Harmonic | null, tEnd: number, samples: number): EngineCheck {
  const out: EngineCheck = { omega: null, X: null, history: null };
  if (!isWasmReady()) return out;
  const syn = sdofSyntheticInput(p.m, p.k);
  try { out.omega = solveModal(syn.input, syn.densities, 1).modes[0]?.omega ?? null; } catch { out.omega = null; }
  if (!h || h.resonant || !(h.F0 !== 0)) return out;
  try {
    const r = solveHarmonic2D({ solver: syn.forced(h.F0), densities: densityRecord(syn.densities), frequencies: [h.Omega / (2 * Math.PI)], dampingRatio: p.xi, responseNodeId: NODE, responseDof: 'x' });
    out.X = r.responsePoints?.[0]?.amplitude ?? null;
  } catch { out.X = null; }
  try {
    const perStep = Math.max(1, Math.ceil(tEnd / samples / (Math.min(p.T, (2 * Math.PI) / h.Omega) / 100)));
    const dt = tEnd / samples / perStep;
    const nSteps = samples * perStep;
    const forceHistory = Array.from({ length: nSteps + 1 }, (_, i) => ({ time: i * dt, loads: [{ nodeId: NODE, fx: h.F0 * Math.sin(h.Omega * i * dt), fz: 0, my: 0 }] }));
    const r = solveTimeHistory2D({ solver: syn.input, densities: syn.densities, timeStep: dt, nSteps, forceHistory, ...(p.xi > 0 ? { dampingXi: p.xi } : {}) });
    const ux: number[] = r.nodeHistories.find((n: { nodeId: number }) => n.nodeId === NODE)?.ux ?? [];
    out.history = Array.from({ length: samples + 1 }, (_, i) => [i * perStep * dt, ux[i * perStep] ?? NaN] as [number, number]);
  } catch { out.history = null; }
  return out;
}
