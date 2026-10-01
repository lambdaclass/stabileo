/**
 * The direct analysis method (AISC 360-16 Chapter C): a second-order analysis of every
 * combination on reduced stiffness, with notional loads, whose forces a member check then reads
 * with an effective length factor of one (C1, C3).
 *
 * ── What is done, clause by clause ─────────────────────────────────
 *
 *   C2.1   second-order: the engine's P-Delta, per combination, on that combination's own factored
 *          loads. P-δ is carried by each element's geometric stiffness; members are not subdivided,
 *          which the result states.
 *   C2.2b  notional loads Ni = 0.002·α·Yi, α = 1 (LRFD), applied at the nodes where the gravity load
 *          acts and in proportion to it, so each level receives 0.002 of its own gravity load.
 *          In a combination with lateral load they go in the direction of that load, and only when
 *          the ratio of second- to first-order drift exceeds 1.7 (C2.2b(4)); in a gravity-only
 *          combination they always apply, along +X, −X, +Y and −Y in turn, and the direction
 *          giving the largest sway is kept.
 *   C2.3a  0.80 on every stiffness: applied to E of every material, so axial, flexural, torsional
 *          and shell stiffness alike.
 *   C2.3b  τb on the flexural stiffness of steel members: 1 while αPr/Pns ≤ 0.5, else
 *          4(αPr/Pns)(1 − αPr/Pns), with Pns = Fy·Ag. Found by iterating, since Pr comes from the
 *          analysis itself.
 *   C2.3c  or τb = 1 throughout, with an added notional load of 0.001·α·Yi in every combination.
 *
 * The displacements of this analysis are those of a structure at 80 % of its stiffness, and are
 * not for serviceability; the linear results, which the deflection checks read, are not touched.
 *
 * Pure of stores: the model and its combinations come in, results go out.
 */
import type { ModelData } from './solver-service';
import { buildSolverInput3D, caseSolverLoads3D, comboSolverLoads3D } from './solver-service';
import type { LoadCase, LoadCombination } from '../store/model.svelte';
import type { SolverInput3D, SolverLoad3D, AnalysisResults3D, SolverNode3D } from './types-3d';
import { computeLocalAxes3D } from './local-axes-3d';
import { input3DToWireObject } from './wasm-solver';
import { axialShares, giveBackAxialShares } from './axial-shares';
import { correctPDeltaForces, solvePDelta3DCorrected, amplification } from './pdelta-forces';
export { amplification } from './pdelta-forces';

export type TauBMode = 'iterate' | 'unity';

export interface DirectAnalysisSettings {
  /** Notional load ratio, C2.2b(1). */
  notional: number;
  tauB: TauBMode;
  maxIter?: number;
  tol?: number;
}

export const DEFAULT_DIRECT_SETTINGS: DirectAnalysisSettings = { notional: 0.002, tauB: 'iterate' };

export type NotionalDirection = 'none' | 'lateral' | '+X' | '-X' | '+Y' | '-Y';

export interface DirectComboInfo {
  comboId: number;
  /** Where the notional loads went. `lateral` follows the combination's own lateral load. */
  notional: NotionalDirection;
  /** Second- over first-order drift, the governing node's. */
  b2: number;
  converged: boolean;
  /** False when no second-order equilibrium exists at this load: the results are not for design. */
  stable: boolean;
  iterations: number;
  /** τb per steel member below one; members absent carry τb = 1. */
  tauB: Map<number, number>;
}

export interface DirectAnalysisResult {
  perCombo: Map<number, AnalysisResults3D>;
  info: Map<number, DirectComboInfo>;
  settings: DirectAnalysisSettings;
}

/** One P-Delta solve: on a worker when the caller has one, on this thread otherwise. */
export type PDeltaRunner = (input: SolverInput3D, maxIter: number, tol: number) => Promise<{
  results: AnalysisResults3D; linearResults?: AnalysisResults3D; converged: boolean; iterations: number;
  isStable?: boolean;
  b2Factor?: number; amplification?: Array<{ nodeId: number; ratio: number }>;
}>;

export const mainThreadPDelta: PDeltaRunner = async (input, maxIter, tol) => solvePDelta3DCorrected(input, maxIter, tol);

/** A runner over the worker pool, falling back to this thread when there is none. */
export function workerPDelta(pdelta3DInWorker: (wire: unknown, maxIter: number, tol: number) => Promise<any>): PDeltaRunner {
  return async (input, maxIter, tol) => {
    try {
      const r = await pdelta3DInWorker(input3DToWireObject(input), maxIter, tol);
      // The worker answers as the engine does; the main-thread wrapper's correction applies here.
      // So do the axial shares of members that take no bending (`axial-shares.ts`).
      const shares = axialShares(input.loads);
      if (r?.linearResults) giveBackAxialShares(r.linearResults, shares);
      return { ...r, results: correctPDeltaForces(input, giveBackAxialShares(r.results, shares)) };
    } catch {
      return mainThreadPDelta(input, maxIter, tol);
    }
  };
}

// ─── Gravity at the nodes ────────────────────────────────────────

/**
 * Each node's share of the downward load (global −Z), kN, and the load's horizontal resultant.
 *
 * Member loads are given to their end nodes by statics, as a simply supported span would, which
 * is what "the gravity load at that level" means for a load applied between floors.
 */
export function nodeGravity(input: SolverInput3D, loads: SolverLoad3D[], leftHand = false): { gravity: Map<number, number>; lateral: { x: number; y: number } } {
  const gravity = new Map<number, number>();
  const add = (id: number, g: number) => gravity.set(id, (gravity.get(id) ?? 0) + g);
  let hx = 0, hy = 0;
  const axesOf = (elementId: number) => {
    const e = input.elements.get(elementId);
    if (!e) return null;
    const a = input.nodes.get(e.nodeI), b = input.nodes.get(e.nodeJ);
    if (!a || !b) return null;
    const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
    return { e, axes: computeLocalAxes3D(a as SolverNode3D, b as SolverNode3D, localY, e.rollAngle, leftHand) };
  };
  for (const l of loads) {
    if (l.type === 'nodal') {
      add(l.data.nodeId, -l.data.fz);
      hx += l.data.fx; hy += l.data.fy;
    } else if (l.type === 'distributed') {
      const m = axesOf(l.data.elementId);
      if (!m) continue;
      const { ex, ey, ez, L } = m.axes;
      const a = l.data.a ?? 0, b = l.data.b ?? L, span = b - a;
      if (!(span > 0)) continue;
      // Global vector of the load at each end of its stretch, then the trapezoid's resultant.
      const gI = (i: 0 | 1 | 2) => (l.data.qXI ?? 0) * ex[i]! + l.data.qYI * ey[i]! + l.data.qZI * ez[i]!;
      const gJ = (i: 0 | 1 | 2) => (l.data.qXJ ?? 0) * ex[i]! + l.data.qYJ * ey[i]! + l.data.qZJ * ez[i]!;
      const total = (i: 0 | 1 | 2) => ((gI(i) + gJ(i)) / 2) * span;
      const tz = total(2);
      // Centroid of the trapezoid from end I of the member.
      const wI = -gI(2), wJ = -gJ(2);
      const xc = Math.abs(wI + wJ) > 1e-12 ? a + (span * (wI + 2 * wJ)) / (3 * (wI + wJ)) : (a + b) / 2;
      add(m.e.nodeI, -tz * (1 - xc / L));
      add(m.e.nodeJ, -tz * (xc / L));
      hx += total(0); hy += total(1);
    } else if (l.type === 'pointOnElement') {
      const m = axesOf(l.data.elementId);
      if (!m) continue;
      const { ey, ez, L } = m.axes;
      const g = (i: 0 | 1 | 2) => l.data.py * ey[i]! + l.data.pz * ez[i]!;
      add(m.e.nodeI, -g(2) * (1 - l.data.a / L));
      add(m.e.nodeJ, -g(2) * (l.data.a / L));
      hx += g(0); hy += g(1);
    }
  }
  return { gravity, lateral: { x: hx, y: hy } };
}

/** Horizontal loads at the nodes, `ratio` of each node's gravity, along the unit vector (ux, uy). */
export function notionalLoads(gravity: Map<number, number>, ratio: number, ux: number, uy: number): SolverLoad3D[] {
  const out: SolverLoad3D[] = [];
  for (const [nodeId, g] of gravity) {
    if (!(g > 0)) continue;
    out.push({ type: 'nodal', data: { nodeId, fx: ratio * g * ux, fy: ratio * g * uy, fz: 0, mx: 0, my: 0, mz: 0 } });
  }
  return out;
}

// ─── Stiffness ───────────────────────────────────────────────────

/** 0.8 on every material's E, and τb on the flexural stiffness of the members given. */
export function reducedStiffness(input: SolverInput3D, tauB: Map<number, number>): SolverInput3D {
  const out: SolverInput3D = {
    ...input,
    materials: new Map([...input.materials].map(([id, m]) => [id, { ...m, e: m.e * 0.8 }])),
    sections: new Map(input.sections),
    elements: new Map(input.elements),
  };
  let next = Math.max(0, ...out.sections.keys()) + 1;
  const made = new Map<string, number>();
  for (const [id, t] of tauB) {
    if (!(t < 1)) continue;
    const el = out.elements.get(id);
    const base = el && out.sections.get(el.sectionId);
    if (!el || !base) continue;
    const key = `${el.sectionId}|${t.toFixed(4)}`;
    let sid = made.get(key);
    if (sid === undefined) {
      sid = next++;
      out.sections.set(sid, { ...base, id: sid, iy: base.iy * t, iz: base.iz * t });
      made.set(key, sid);
    }
    out.elements.set(id, { ...el, sectionId: sid });
  }
  return out;
}

/** τb of C2.3(b) for one member. */
export function tauBOf(pr: number, pns: number): number {
  if (!(pns > 0) || !(pr > 0)) return 1;
  const r = pr / pns;
  return r <= 0.5 ? 1 : Math.max(0, 4 * r * (1 - r));
}

/** Largest axial compression of each frame member in a result, kN (positive). */
function compression(results: AnalysisResults3D): Map<number, number> {
  const out = new Map<number, number>();
  for (const f of results.elementForces ?? []) {
    const c = Math.max(-(f.nStart ?? 0), -(f.nEnd ?? 0), 0);
    out.set(f.elementId, c);
  }
  return out;
}

/** The largest horizontal displacement anywhere, for choosing the governing notional direction. */
function sway(results: AnalysisResults3D): number {
  let m = 0;
  for (const d of results.displacements ?? []) m = Math.max(m, Math.hypot(d.ux, d.uy));
  return m;
}

// ─── The analysis ────────────────────────────────────────────────

export async function runDirectAnalysis(
  model: ModelData,
  loadCases: LoadCase[],
  combinations: LoadCombination[],
  opts: { includeSelfWeight: boolean; leftHand?: boolean; settings?: DirectAnalysisSettings; run?: PDeltaRunner },
): Promise<DirectAnalysisResult | string> {
  const settings = { ...(opts.settings ?? DEFAULT_DIRECT_SETTINGS) };
  const run = opts.run ?? mainThreadPDelta;
  const leftHand = opts.leftHand ?? false;
  const maxIter = settings.maxIter ?? 30, tol = settings.tol ?? 1e-5;
  const base = buildSolverInput3D({ ...model, loads: [] }, false, leftHand);
  if (!base) return 'empty';
  const caseLoads = caseSolverLoads3D(model, loadCases, opts.includeSelfWeight, leftHand);

  // Pns = Fy·Ag for every member whose material has a yield stress (MPa → kPa).
  const pns = new Map<number, number>();
  for (const [id, el] of base.elements) {
    const fy = model.materials.get(el.materialId)?.fy;
    const a = base.sections.get(el.sectionId)?.a;
    if (fy && a) pns.set(id, fy * 1000 * a);
  }

  const perCombo = new Map<number, AnalysisResults3D>();
  const info = new Map<number, DirectComboInfo>();
  const extra = settings.tauB === 'unity' ? 0.001 : 0;

  await Promise.all(combinations.map(async (combo) => {
    const loads = comboSolverLoads3D(combo, caseLoads);
    if (loads.length === 0) return;
    const { gravity, lateral } = nodeGravity(base, loads, leftHand);
    const hMag = Math.hypot(lateral.x, lateral.y);
    const totalGravity = [...gravity.values()].reduce((s, g) => s + Math.max(g, 0), 0);
    const hasLateral = hMag > 1e-6 * Math.max(totalGravity, 1);

    const solveWith = async (tau: Map<number, number>, ratio: number, ux: number, uy: number) => {
      const input = reducedStiffness(base, tau);
      const nl = ratio > 0 ? notionalLoads(gravity, ratio, ux, uy) : [];
      const full = { ...input, loads: [...loads, ...nl] };
      return run(full, maxIter, tol);
    };

    /** One direction, with τb iterated to a fixed point when asked. */
    const solveDirection = async (ratio: (b2: number) => number, ux: number, uy: number) => {
      let tau = new Map<number, number>();
      let r = await solveWith(tau, ratio(0), ux, uy);
      // A lateral combination takes notional loads only past a drift ratio of 1.7.
      const firstB2 = amplification(r).b2;
      if (ratio(firstB2) !== ratio(0)) r = await solveWith(tau, ratio(firstB2), ux, uy);
      let tauConverged = settings.tauB !== 'iterate';
      if (settings.tauB === 'iterate') {
        for (let k = 0; k <= 5; k++) {
          if (!r.converged || !amplification(r).stable) break;
          const next = new Map<number, number>();
          for (const [id, c] of compression(r.results)) {
            const p = pns.get(id);
            if (p) { const t = tauBOf(c, p); if (t < 1) next.set(id, t); }
          }
          const moved = [...new Set([...next.keys(), ...tau.keys()])].some((id) => Math.abs((next.get(id) ?? 1) - (tau.get(id) ?? 1)) > 0.01);
          if (!moved) { tauConverged = true; break; }
          if (k === 5) break;
          tau = next;
          r = await solveWith(tau, ratio(amplification(r).b2), ux, uy);
        }
      }
      return { r, tau, converged: r.converged && tauConverged };
    };

    let chosen: Awaited<ReturnType<typeof solveDirection>> & { dir: NotionalDirection };
    if (hasLateral) {
      const ux = lateral.x / hMag, uy = lateral.y / hMag;
      const answer = await solveDirection((b2) => (b2 > 1.7 ? settings.notional : 0) + extra, ux, uy);
      const { r } = answer;
      const applied = amplification(r).b2 > 1.7 || extra > 0;
      chosen = { ...answer, dir: applied ? 'lateral' : 'none' };
    } else {
      const dirs: Array<[NotionalDirection, number, number]> = [['+X', 1, 0], ['-X', -1, 0], ['+Y', 0, 1], ['-Y', 0, -1]];
      const tried = await Promise.all(dirs.map(async ([dir, ux, uy]) => ({ dir, ...(await solveDirection(() => settings.notional + extra, ux, uy)) })));
      // An unstable direction governs outright: it is the one the structure cannot carry.
      const unstable = tried.find((x) => !amplification(x.r).stable);
      chosen = unstable ?? tried.find((x) => !x.converged)
        ?? tried.reduce((a, b) => (sway(b.r.results) > sway(a.r.results) ? b : a));
    }
    const amp = amplification(chosen.r);
    // Both the P-Delta solve and the stiffness iteration must have converged.
    if (amp.stable && chosen.converged) perCombo.set(combo.id, chosen.r.results);
    info.set(combo.id, {
      comboId: combo.id, notional: chosen.dir, b2: amp.b2, stable: amp.stable,
      converged: chosen.converged, iterations: chosen.r.iterations, tauB: chosen.tau,
    });
  }));

  return { perCombo, info, settings };
}
