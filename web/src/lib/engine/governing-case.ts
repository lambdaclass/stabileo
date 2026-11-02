/**
 * Governing-case post-processing — identifies which load combination
 * governs each force component for each element.
 *
 * Pure JS iteration over per-combo results. No solver/WASM dependency.
 */

import type { AnalysisResults, ElementForces } from './types';
import { computeDiagramValueAt } from './diagrams';
import { cubicStationaryPoints } from './cubic-stationary';
import type { AnalysisResults3D } from './types-3d';

// ─── Types ────────────────────────────────────────────────────

/** Reference to the combination that governs a specific force component. */
export interface GoverningComboRef {
  comboId: number;
  comboName: string;
  value: number; // max absolute value produced by this combo
}

/** Governing combo per force component for a 3D element. */
export interface GoverningPerElement3D {
  momentZ?: GoverningComboRef;
  shearY?: GoverningComboRef;
  axial?: GoverningComboRef;
  momentY?: GoverningComboRef;
  shearZ?: GoverningComboRef;
  torsion?: GoverningComboRef;
}

/** Governing combo per force component for a 2D element. */
export interface GoverningPerElement {
  moment?: GoverningComboRef;
  shear?: GoverningComboRef;
  axial?: GoverningComboRef;
}

// ─── 3D ───────────────────────────────────────────────────────

/**
 * For each element, find which combination produces the max absolute
 * value per force component (Mz, Vy, N, My, Vz, Mx/torsion).
 */
export function computeGoverning3D(
  perCombo: Map<number, AnalysisResults3D>,
  comboNames: Map<number, string>,
): Map<number, GoverningPerElement3D> {
  if (perCombo.size === 0) return new Map();

  // Track max per element per component
  const best = new Map<number, {
    mz: number; mzCombo: number;
    vy: number; vyCombo: number;
    n: number; nCombo: number;
    my: number; myCombo: number;
    vz: number; vzCombo: number;
    mx: number; mxCombo: number;
  }>();

  for (const [comboId, results] of perCombo) {
    for (const ef of results.elementForces) {
      const eid = ef.elementId;
      const mz = Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd));
      const vy = Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd));
      const n = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
      const my = Math.max(Math.abs(ef.myStart), Math.abs(ef.myEnd));
      const vz = Math.max(Math.abs(ef.vzStart), Math.abs(ef.vzEnd));
      const mx = Math.max(Math.abs(ef.mxStart), Math.abs(ef.mxEnd));

      const cur = best.get(eid);
      if (!cur) {
        best.set(eid, {
          mz, mzCombo: comboId,
          vy, vyCombo: comboId,
          n, nCombo: comboId,
          my, myCombo: comboId,
          vz, vzCombo: comboId,
          mx, mxCombo: comboId,
        });
      } else {
        if (mz > cur.mz) { cur.mz = mz; cur.mzCombo = comboId; }
        if (vy > cur.vy) { cur.vy = vy; cur.vyCombo = comboId; }
        if (n > cur.n) { cur.n = n; cur.nCombo = comboId; }
        if (my > cur.my) { cur.my = my; cur.myCombo = comboId; }
        if (vz > cur.vz) { cur.vz = vz; cur.vzCombo = comboId; }
        if (mx > cur.mx) { cur.mx = mx; cur.mxCombo = comboId; }
      }
    }
  }

  const result = new Map<number, GoverningPerElement3D>();
  for (const [eid, b] of best) {
    const ref = (comboId: number, value: number): GoverningComboRef => ({
      comboId,
      comboName: comboNames.get(comboId) ?? `Combo ${comboId}`,
      value,
    });
    result.set(eid, {
      momentZ: b.mz > 0 ? ref(b.mzCombo, b.mz) : undefined,
      shearY: b.vy > 0 ? ref(b.vyCombo, b.vy) : undefined,
      axial: b.n > 0 ? ref(b.nCombo, b.n) : undefined,
      momentY: b.my > 0 ? ref(b.myCombo, b.my) : undefined,
      shearZ: b.vz > 0 ? ref(b.vzCombo, b.vz) : undefined,
      torsion: b.mx > 0 ? ref(b.mxCombo, b.mx) : undefined,
    });
  }
  return result;
}

// ─── 2D ───────────────────────────────────────────────────────

/**
 * The largest |value| of a diagram along the member: at its ends, either side of each point load,
 * at the ends of and through each span load, at every local peak of that sampling, refined by
 * golden section between its neighbours, and at the stationary points of the cubic through each
 * stretch between load boundaries.
 */
export function peakAlong(kind: 'moment' | 'shear' | 'axial', ef: ElementForces): number {
  const f = (t: number) => Math.abs(computeDiagramValueAt(kind, Math.min(1, Math.max(0, t)), ef));
  const ts = Array.from({ length: 41 }, (_, k) => k / 40);
  for (const p of ef.pointLoads ?? []) {
    const t = p.a / Math.max(ef.length, 1e-12);
    ts.push(Math.max(0, t - 1e-9), Math.min(1, t + 1e-9));
  }
  for (const d of [...(ef.distributedLoads ?? []), ...(ef.distributedLoadsX ?? [])]) {
    const a = d.a / Math.max(ef.length, 1e-12), b = d.b / Math.max(ef.length, 1e-12);
    for (let k = 0; k <= 8; k++) ts.push(Math.min(1, Math.max(0, a + ((b - a) * k) / 8)));
  }
  ts.sort((a, b) => a - b);
  const v = ts.map(f);
  let best = Math.max(...v);
  const g = (t: number) => computeDiagramValueAt(kind, t, ef);
  const cuts = [0, 1];
  for (const p of ef.pointLoads ?? []) cuts.push(p.a / Math.max(ef.length, 1e-12));
  for (const d of [...(ef.distributedLoads ?? []), ...(ef.distributedLoadsX ?? [])]) cuts.push(d.a / Math.max(ef.length, 1e-12), d.b / Math.max(ef.length, 1e-12));
  const edges = [...new Set(cuts.map((t) => Math.min(1, Math.max(0, t))))].sort((a, b) => a - b);
  for (let k = 0; k + 1 < edges.length; k++) {
    for (const t of cubicStationaryPoints(g, edges[k], edges[k + 1])) best = Math.max(best, Math.abs(g(t)));
  }
  for (let k = 1; k < ts.length - 1; k++) {
    if (!(v[k] >= v[k - 1] && v[k] >= v[k + 1])) continue;
    let lo = ts[k - 1], hi = ts[k + 1];
    for (let i = 0; i < 60 && hi - lo > 1e-12; i++) {
      const a = lo + (hi - lo) * 0.381966, b = lo + (hi - lo) * 0.618034;
      if (f(a) >= f(b)) hi = b; else lo = a;
    }
    best = Math.max(best, f((lo + hi) / 2));
  }
  return best;
}

/**
 * For each element, find which combination produces the max absolute
 * value per force component (M, V, N) anywhere along it.
 */
export function computeGoverning2D(
  perCombo: Map<number, AnalysisResults>,
  comboNames: Map<number, string>,
): Map<number, GoverningPerElement> {
  if (perCombo.size === 0) return new Map();

  const best = new Map<number, {
    m: number; mCombo: number;
    v: number; vCombo: number;
    n: number; nCombo: number;
  }>();

  for (const [comboId, results] of perCombo) {
    for (const ef of results.elementForces) {
      const eid = ef.elementId;
      const m = peakAlong('moment', ef);
      const v = peakAlong('shear', ef);
      const n = peakAlong('axial', ef);

      const cur = best.get(eid);
      if (!cur) {
        best.set(eid, { m, mCombo: comboId, v, vCombo: comboId, n, nCombo: comboId });
      } else {
        if (m > cur.m) { cur.m = m; cur.mCombo = comboId; }
        if (v > cur.v) { cur.v = v; cur.vCombo = comboId; }
        if (n > cur.n) { cur.n = n; cur.nCombo = comboId; }
      }
    }
  }

  const result = new Map<number, GoverningPerElement>();
  for (const [eid, b] of best) {
    const ref = (comboId: number, value: number): GoverningComboRef => ({
      comboId,
      comboName: comboNames.get(comboId) ?? `Combo ${comboId}`,
      value,
    });
    result.set(eid, {
      moment: b.m > 0 ? ref(b.mCombo, b.m) : undefined,
      shear: b.v > 0 ? ref(b.vCombo, b.v) : undefined,
      axial: b.n > 0 ? ref(b.nCombo, b.n) : undefined,
    });
  }
  return result;
}
