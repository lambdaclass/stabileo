/**
 * The spectrum table handed to the response-spectrum solver is the regulation's own curve, and the
 * solver applies γr/R to it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { designSpectrum, spectrumPoints, spectralOrdinate, isBlocked, type DesignSpectrum } from '../spectrum';
import { initSolver, solveModal3D, solveSpectral3D } from '../../../engine/wasm-solver';
import { spectralModesFrom } from '../../../engine/dynamics/requests';
import { buildSolverInput3D } from '../../../engine/solver-service';
import { modelStore } from '../../../store/model.svelte';

const s = designSpectrum({ zone: 3, site: 'SD' }) as DesignSpectrum;

/** The solver's linear interpolation over the table. */
const interp = (pts: Array<{ period: number; sa: number }>, t: number) => {
  for (let i = 0; i < pts.length - 1; i++) {
    if (t >= pts[i]!.period && t <= pts[i + 1]!.period) {
      const u = (t - pts[i]!.period) / (pts[i + 1]!.period - pts[i]!.period);
      return pts[i]!.sa + u * (pts[i + 1]!.sa - pts[i]!.sa);
    }
  }
  return pts[pts.length - 1]!.sa;
};

describe('spectrum table', () => {
  it('holds every corner and follows each branch to 0,5 % under linear interpolation', () => {
    const pts = spectrumPoints(s);
    for (const t of [s.t1, s.t2, s.t3]) expect(pts.some((p) => p.period === t)).toBe(true);
    for (let t = 0.013; t < 12; t += 0.037) {
      expect(Math.abs(interp(pts, t) / spectralOrdinate(t, s) - 1)).toBeLessThan(5e-3);
    }
  });

  it('is continuous: no jump at the end of the plateau', () => {
    const pts = spectrumPoints(s);
    for (let i = 1; i < pts.length; i++) {
      const dt = pts[i]!.period - pts[i - 1]!.period;
      if (dt > 0) expect(Math.abs(pts[i]!.sa - pts[i - 1]!.sa)).toBeLessThan(2.5 * s.ca * 0.05 + 1e-12);
    }
  });

  it('zone 3, SD is the code’s: 2,5·Ca on the plateau, Cv/T past T2', () => {
    expect(s.ca).toBeCloseTo(0.32 * 1.0, 12);
    expect(spectralOrdinate(0.2, s)).toBeCloseTo(2.5 * s.ca, 12);
    expect(spectralOrdinate(1.0, s)).toBeCloseTo(s.cv / 1.0, 12);
  });

  it('SF has no spectrum to sample', () => {
    expect(isBlocked(designSpectrum({ zone: 3, site: 'SF' }))).toBe(true);
  });
});

describe('the solver applies γr / R to it', () => {
  beforeAll(async () => { await initSolver(); });

  it('base shear scales with γr and 1/R', () => {
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    const solver = buildSolverInput3D(modelStore.model as never, false, false)!;
    const densities = new Map([...modelStore.materials.keys()].map((id) => [id, 7850]));
    const modal = solveModal3D(solver, densities, 4);
    const modes = spectralModesFrom(modal);
    const spectrum = { name: 'z3 SD', points: spectrumPoints(s), inG: true };
    // The direction the first mode moves in: a weak-axis profile sways that way first.
    const direction = Math.abs(modal.modes[0].participationX) > Math.abs(modal.modes[0].participationY) ? 'X' : 'Y';
    const run = (importanceFactor: number, reductionFactor: number) =>
      solveSpectral3D({ solver, modes, densities, spectrum, direction, rule: 'SRSS', importanceFactor, reductionFactor }).baseShear;
    const base = run(1, 1);
    expect(base).toBeGreaterThan(0);
    expect(run(1.3, 1) / base).toBeCloseTo(1.3, 9);
    expect(run(1, 4) / base).toBeCloseTo(0.25, 9);
  });
});
