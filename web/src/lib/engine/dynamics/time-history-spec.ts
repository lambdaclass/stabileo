/**
 * A time-history analysis as project data: the integration settings, the ground motion in each
 * direction (X, Y and Z at once), a scale on each, and nodal forces that vary in time. Saved with
 * the project, so a run can be repeated and reviewed; built here into the engine's input.
 *
 * Ground motion per direction:
 *   · none
 *   · a harmonic (amplitude in g, frequency)
 *   · a record read from a file (PEER .AT2, a time/acceleration table or a single column),
 *     kept as read, in m/s²
 *   · spectrum-compatible, generated from the project's INPRES-CIRSOC 103 spectrum with a seed
 *     and a duration (`spectrum-compatible.ts`), regenerated from those on every run
 *
 * Pure.
 */
import { resample, type GroundRecord } from './accelerogram';
import { G, sineAccelerogram, integrationFields } from './requests';
import { spectrumCompatible } from './spectrum-compatible';

export type GroundSource = 'none' | 'sine' | 'record' | 'spectrum';

export interface GroundSpec {
  source: GroundSource;
  /** Multiplies the motion. */
  scale: number;
  sine?: { ampG: number; freqHz: number };
  record?: GroundRecord & { name: string };
  spectrum?: { seed: number; duration: number };
}

export interface ForceSpec {
  nodeId: number;
  dir: 'x' | 'y' | 'z';
  kind: 'sine' | 'step';
  /** kN. */
  amplitude: number;
  /** sine only, Hz. */
  freqHz?: number;
  /** step only: on from this time, s. */
  from?: number;
}

export interface TimeHistorySpec {
  dt: number;
  nSteps: number;
  method: 'newmark' | 'hht';
  alpha: number;
  damping: number;
  ground: { x: GroundSpec; y: GroundSpec; z: GroundSpec };
  forces: ForceSpec[];
}

export const emptyGround = (): GroundSpec => ({ source: 'none', scale: 1 });

export function defaultTimeHistory(): TimeHistorySpec {
  return {
    dt: 0.01, nSteps: 200, method: 'newmark', alpha: -0.1, damping: 0.05,
    ground: { x: { source: 'sine', scale: 1, sine: { ampG: 0.3, freqHz: 2 } }, y: emptyGround(), z: emptyGround() },
    forces: [],
  };
}

/** The ground acceleration a direction gets, m/s², nSteps + 1 values, or null for none. */
export function groundSeries(g: GroundSpec, dt: number, nSteps: number, spectrumSa: ((T: number) => number) | null): number[] | null {
  let base: number[] | null = null;
  if (g.source === 'sine' && g.sine) base = sineAccelerogram(g.sine.ampG, g.sine.freqHz, dt, nSteps);
  else if (g.source === 'record' && g.record) base = resample(g.record, dt, nSteps);
  else if (g.source === 'spectrum' && g.spectrum && spectrumSa) {
    const r = spectrumCompatible({ target: spectrumSa, duration: Math.min(g.spectrum.duration, dt * nSteps), dt, seed: g.spectrum.seed });
    base = Array.from({ length: nSteps + 1 }, (_, k) => r.accel[k] ?? 0);
  }
  if (!base) return null;
  return g.scale === 1 ? base : base.map((v) => v * g.scale);
}

/** The engine's force records: at each step, every force's value on its node. */
export function forceRecords(forces: ForceSpec[], dt: number, nSteps: number) {
  if (forces.length === 0) return undefined;
  const out: Array<{ time: number; loads: Array<{ nodeId: number; fx: number; fy: number; fz: number; mx: number; my: number; mz: number }> }> = [];
  for (let k = 0; k <= nSteps; k++) {
    const t = k * dt;
    const byNode = new Map<number, { nodeId: number; fx: number; fy: number; fz: number; mx: number; my: number; mz: number }>();
    for (const f of forces) {
      const v = f.kind === 'sine' ? f.amplitude * Math.sin(2 * Math.PI * (f.freqHz ?? 1) * t) : t >= (f.from ?? 0) ? f.amplitude : 0;
      const l = byNode.get(f.nodeId) ?? { nodeId: f.nodeId, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
      if (f.dir === 'x') l.fx += v; else if (f.dir === 'y') l.fy += v; else l.fz += v;
      byNode.set(f.nodeId, l);
    }
    out.push({ time: t, loads: [...byNode.values()] });
  }
  return out;
}

/** The `TimeHistoryInput3D` fields other than `solver`, from the spec. */
export function timeHistoryInput(spec: TimeHistorySpec, densities: Map<number, number>, spectrumSa: ((T: number) => number) | null): Record<string, unknown> {
  const gx = groundSeries(spec.ground.x, spec.dt, spec.nSteps, spectrumSa);
  const gy = groundSeries(spec.ground.y, spec.dt, spec.nSteps, spectrumSa);
  const gz = groundSeries(spec.ground.z, spec.dt, spec.nSteps, spectrumSa);
  const forces = forceRecords(spec.forces, spec.dt, spec.nSteps);
  if (!gx && !gy && !gz && !forces) throw new Error('no ground motion and no forces');
  return {
    ...integrationFields({ densities, dt: spec.dt, nSteps: spec.nSteps, method: spec.method, alpha: spec.alpha, dampingXi: spec.damping }),
    ...(gx ? { groundAccelX: gx } : {}), ...(gy ? { groundAccelY: gy } : {}), ...(gz ? { groundAccelZ: gz } : {}),
    ...(forces ? { forceHistory: forces } : {}),
  };
}

export const PGA_G = (a: number[]) => Math.max(0, ...a.map(Math.abs)) / G;
