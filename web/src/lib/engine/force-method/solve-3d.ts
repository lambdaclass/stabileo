/**
 * The force method for space frames and trusses — the plane method's steps,
 * with six forces where there were three.
 *
 * What changes from `solve.ts`:
 *
 *   · each bar carries N, Vy, Vz, T, My and Mz, so a flexibility coefficient
 *     is Σ ∫ (nᵢnⱼ/EA + mzᵢmzⱼ/EIz + myᵢmyⱼ/EIy + tᵢtⱼ/GJ) dx
 *   · a cut through a member releases up to six forces, fewer at a released end
 *   · the count reads the rotations no member resists off the stiffness
 *     (see `primary-3d.ts`)
 *
 * What does not: every coefficient is still computed twice — by the integrals
 * and as a displacement of the primary structure — and the final answer is
 * still checked against the stiffness method on the original structure.
 * States are solved with `solveDetailed3D`, pinned against the 3D analysis
 * solver by its own differential tests.
 */
import type { SolverInput3D, SolverLoad3D, SolverElement3D } from '../types-3d';
import { solveDetailed3D } from '../solver-detailed-3d';
import type { DSMStepData } from '../solver-detailed';
import { computeLocalAxes3D } from '../local-axes-3d';
import { countIndeterminacy3D, candidates3D, buildPrimary3D, restrained3D, realSprings3D } from './primary-3d';
import type { Redundant } from './primary';
import {
  ForceMethodError, chooseRedundants, solveSystem, restraintCarries, FM_MAX_GH,
  type ForceMethodResult, type StateResult, type BarState, type TermRow, type Geometry,
} from './solve';
import { breakpoints, integrate, type BarLoads } from './internal';

const ALPHA = 12e-6;

/** Loads along a space bar, local axes: transverse y and z. */
interface BarLoads3D {
  dist: Array<{ qYI: number; qYJ: number; qZI: number; qZJ: number; a: number; b: number }>;
  point: Array<{ a: number; py: number; pz: number }>;
}
const NONE: BarLoads3D = { dist: [], point: [] };

function barLoads3D(input: SolverInput3D, elementId: number, L: number): BarLoads3D {
  const out: BarLoads3D = { dist: [], point: [] };
  for (const l of input.loads) {
    if (l.type === 'distributed' && l.data.elementId === elementId) {
      out.dist.push({ ...l.data, a: Math.max(0, l.data.a ?? 0), b: Math.min(L, l.data.b ?? L) });
    } else if (l.type === 'pointOnElement' && l.data.elementId === elementId) {
      out.point.push({ a: l.data.a, py: l.data.py ?? 0, pz: l.data.pz ?? 0 });
    }
  }
  return out;
}

/** For `breakpoints`, which only needs where the loads start and stop. */
const asPlane = (l: BarLoads3D): BarLoads => ({
  dist: l.dist.map((d) => ({ qI: 0, qJ: 0, a: d.a, b: d.b })),
  point: l.point.map((p) => ({ a: p.a, p: 0, px: 0, my: 0 })),
});

/**
 * n, t, mz, my along the bar from its local end forces at I, [N, Vy, Vz, T, My, Mz],
 * and the loads on [0, x). Mz follows the plane rule; My carries the opposite
 * sign in its load terms because θy = −dw/dx.
 */
function internal3D(f: number[], loads: BarLoads3D, x: number) {
  let mz = f[5] - f[1] * x;
  let my = f[4] + f[2] * x;
  for (const p of loads.point) {
    if (p.a < x) { mz += (p.a - x) * p.py; my -= (p.a - x) * p.pz; }
  }
  for (const d of loads.dist) {
    const hi = Math.min(x, d.b);
    if (hi <= d.a) continue;
    const span = d.b - d.a;
    const qy = (s: number) => d.qYI + (span > 0 ? ((d.qYJ - d.qYI) * (s - d.a)) / span : 0);
    const qz = (s: number) => d.qZI + (span > 0 ? ((d.qZJ - d.qZI) * (s - d.a)) / span : 0);
    const mid = (d.a + hi) / 2;
    const len = hi - d.a;
    const simpson = (q: (s: number) => number) =>
      (len / 6) * ((d.a - x) * q(d.a) + 4 * (mid - x) * q(mid) + (hi - x) * q(hi));
    mz += simpson(qy);
    my -= simpson(qz);
  }
  return { n: -f[0], t: f[3], mz, my };
}

interface Solved3D {
  data: DSMStepData;
  input: SolverInput3D;
  disp: (nodeId: number) => number[];
  forces: (elementId: number) => number[] | null;
  reactions: Array<{ nodeId: number; component: number; value: number }>;
}

function solveState3D(input: SolverInput3D): Solved3D {
  const data = solveDetailed3D(input);
  if (data.nullModes.length > 0) throw new ForceMethodError('unstable', data.nullModes);
  const frames = new Map((data.nodeFrames3D ?? []).map((f) => [f.nodeId, f.R]));
  const dof = new Map<string, number>();
  for (const d of data.dofNumbering.dofs) dof.set(`${d.nodeId}:${d.localDof}`, d.globalIndex);
  const val = (nodeId: number, ld: number) => {
    const g = dof.get(`${nodeId}:${ld}`);
    return g === undefined ? 0 : data.uAll[g];
  };
  const disp = (nodeId: number) => {
    const u = [0, 1, 2, 3, 4, 5].map((ld) => val(nodeId, ld));
    const R = frames.get(nodeId);
    if (!R) return u;
    return [0, 1, 2].map((a) => R[0][a] * u[0] + R[1][a] * u[1] + R[2][a] * u[2]).concat(u.slice(3));
  };
  const byElem = new Map(data.elementForces.map((f) => [f.elementId, f.fLocalFinal]));
  const forces = (elementId: number) => {
    const f = byElem.get(elementId);
    if (!f) return null;
    return f.length === 12 ? f : [f[0], 0, 0, 0, 0, 0, f[3], 0, 0, 0, 0, 0];
  };
  const reactions = data.dofNumbering.dofs.filter((d) => !d.isFree)
    .map((d) => ({ nodeId: d.nodeId, component: d.localDof, value: data.reactionsRaw[d.globalIndex - data.dofNumbering.nFree] }));
  return { data, input, disp, forces, reactions };
}

const axesOf = (input: SolverInput3D, e: SolverElement3D) => {
  const ly = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined
    ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
  return computeLocalAxes3D(input.nodes.get(e.nodeI)!, input.nodes.get(e.nodeJ)!, ly, e.rollAngle, input.leftHand);
};

function geometry3D(input: SolverInput3D): Geometry {
  return {
    is3D: true,
    nodes: [...input.nodes.values()].map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })),
    elements: [...input.elements.values()].map((e) => {
      const ax = axesOf(input, e);
      return {
        id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: e.type,
        hingeStart: e.releaseMyStart || e.releaseMzStart, hingeEnd: e.releaseMyEnd || e.releaseMzEnd,
        ey: ax.ey, ez: ax.ez,
      };
    }),
    supports: [...input.supports.values()].map((s) => ({
      nodeId: s.nodeId, restrained: restrained3D(s),
      spring: realSprings3D(s).some((k) => k > 0),
    })),
  };
}

const CUT_INDEX: Record<string, number> = { cutN: 0, cutVy: 1, cutVz: 2, cutT: 3, cutMy: 4, cutMz: 5 };

/** Xᵢ = 1 as generalized nodal loads [fx, fy, fz, mx, my, mz]. */
function unitPattern3D(original: SolverInput3D, r: Redundant, cutNode: Map<number, number>) {
  if (r.kind === 'reaction') {
    const s = [...original.supports.values()].find((q) => q.nodeId === r.nodeId)!;
    const f = [0, 0, 0, 0, 0, 0];
    if (s.isInclined && r.component === 0) {
      const len = Math.hypot(s.normalX ?? 0, s.normalY ?? 0, s.normalZ ?? 0);
      f[0] = (s.normalX ?? 0) / len; f[1] = (s.normalY ?? 0) / len; f[2] = (s.normalZ ?? 0) / len;
    } else f[r.component!] = 1;
    return [{ nodeId: r.nodeId, f }];
  }
  const e = original.elements.get(r.elementId!)!;
  const ax = axesOf(original, e);
  if (r.kind === 'barForce') {
    const c = ax.ex;
    return [
      { nodeId: e.nodeI, f: [c[0], c[1], c[2], 0, 0, 0] },
      { nodeId: e.nodeJ, f: [-c[0], -c[1], -c[2], 0, 0, 0] },
    ];
  }
  /*
   * A cut: the member's face at J feels +eₖ in its local axes, at I −eₖ —
   * so Xᵢ reads as the stress resultant at the section, tension positive.
   */
  const k = CUT_INDEX[r.kind];
  const sign = r.end === 'J' ? 1 : -1;
  const local = [0, 0, 0];
  local[k % 3] = sign;
  const g = [0, 1, 2].map((a) => local[0] * ax.ex[a] + local[1] * ax.ey[a] + local[2] * ax.ez[a]);
  const f = k < 3 ? [...g, 0, 0, 0] : [0, 0, 0, ...g];
  return [
    { nodeId: cutNode.get(e.id)!, f },
    { nodeId: r.nodeId, f: f.map((v) => -v) },
  ];
}

function generalised(s: Solved3D, pattern: Array<{ nodeId: number; f: number[] }>): number {
  let v = 0;
  for (const p of pattern) {
    const u = s.disp(p.nodeId);
    for (let k = 0; k < 6; k++) v += p.f[k] * u[k];
  }
  return v;
}

function barState3D(elementId: number, L: number, f: number[], loads: BarLoads3D): BarState {
  const xs = new Set<number>();
  for (let k = 0; k <= 24; k++) xs.add((k / 24) * L);
  for (const p of loads.point) if (p.a > 0 && p.a < L) { xs.add(p.a - 1e-9); xs.add(p.a + 1e-9); }
  return {
    elementId, L,
    ends: {
      nStart: -f[0], vStart: f[1], mStart: f[5], nEnd: f[6], vEnd: -f[7], mEnd: -f[11],
      myStart: f[4], myEnd: -f[10], tStart: f[3],
    },
    samples: [...xs].sort((a, b) => a - b).map((x) => {
      const v = internal3D(f, loads, Math.min(x, L - 1e-12));
      return { x, m: v.mz, n: v.n, my: v.my, t: v.t };
    }),
  };
}

function stateOf3D(s: Solved3D): StateResult {
  return {
    bars: [...s.input.elements.values()].map((e) => {
      const L = axesOf(s.input, e).L;
      return barState3D(e.id, L, s.forces(e.id)!, e.type === 'frame' ? barLoads3D(s.input, e.id, L) : NONE);
    }),
    reactions: [...s.reactions].sort((a, b) => a.nodeId - b.nodeId || a.component - b.component),
  };
}

export function solveForceMethod3D(input: SolverInput3D): ForceMethodResult {
  let base: DSMStepData;
  try { base = solveDetailed3D(input); } catch { throw new ForceMethodError('hypostatic'); }
  if (base.nullModes.length > 0) throw new ForceMethodError('unstable', base.nullModes);
  const count = countIndeterminacy3D(input, base);
  if (count.gh < 0) throw new ForceMethodError('hypostatic');
  if (count.gh > FM_MAX_GH) throw new ForceMethodError('tooHyperstatic', [], count.gh);
  const original = geometry3D(input);

  if (count.gh === 0) {
    const st = stateOf3D(solveState3D(input));
    return {
      is3D: true, count, isostatic: true, redundants: [], original, primary: original,
      states: [st], delta: [], delta0: [], prescribed: [], deltaTerms: [], delta0Terms: [],
      deltaCheck: [], delta0Check: [], X: [], final: st,
      verification: { maxForceDiff: 0, maxReactionDiff: 0, scale: 1, ok: true }, stiffness: st,
    };
  }

  const stable = (rs: Redundant[]) => {
    try {
      const d = solveDetailed3D(buildPrimary3D(input, rs, input.loads, { keepPrescribed: true, keepThermal: true }).input);
      return d.nullModes.length === 0 && d.uAll.every(Number.isFinite);
    } catch { return false; }
  };
  const transmits = restraintCarries(base);
  const redundants = chooseRedundants(candidates3D(input, transmits), count.gh, stable);
  if (!redundants) throw new ForceMethodError('noRedundants');
  const n = redundants.length;

  const p0 = buildPrimary3D(input, redundants, input.loads, { keepPrescribed: true, keepThermal: true });
  const s0 = solveState3D(p0.input);
  const patterns = redundants.map((r) => unitPattern3D(input, r, p0.cutNode));
  const unit = patterns.map((pat) => {
    const loads: SolverLoad3D[] = pat.map((p) => ({
      type: 'nodal', data: { nodeId: p.nodeId, fx: p.f[0], fy: p.f[1], fz: p.f[2], mx: p.f[3], my: p.f[4], mz: p.f[5] },
    }));
    return solveState3D(buildPrimary3D(input, redundants, loads, { keepPrescribed: false, keepThermal: false }).input);
  });

  const bars = [...p0.input.elements.values()].map((e) => {
    const mat = input.materials.get(e.materialId)!;
    const sec = input.sections.get(e.sectionId)!;
    const E = mat.e * 1000;
    const G = E / (2 * (1 + (mat.nu ?? 0.3)));
    const L = axesOf(p0.input, e).L;
    return {
      e, L, sec, EA: E * sec.a, EIy: E * sec.iy, EIz: E * sec.iz, GJ: G * sec.j,
      loads: e.type === 'frame' ? barLoads3D(p0.input, e.id, L) : NONE,
    };
  });

  const mohr = (a: Solved3D, la: (id: number) => BarLoads3D, b: Solved3D, lb: (id: number) => BarLoads3D): TermRow[] => {
    const rows: TermRow[] = [];
    for (const bar of bars) {
      const fa = a.forces(bar.e.id);
      const fb = b.forces(bar.e.id);
      if (!fa || !fb) continue;
      if (bar.e.type === 'truss') {
        rows.push({ elementId: bar.e.id, source: 'axial', value: (fa[0] * fb[0] * bar.L) / bar.EA });
        continue;
      }
      const A = la(bar.e.id);
      const B = lb(bar.e.id);
      const pts = breakpoints(bar.L, asPlane(A), asPlane(B));
      const ia = (x: number) => internal3D(fa, A, x);
      const ib = (x: number) => internal3D(fb, B, x);
      rows.push({
        elementId: bar.e.id, source: 'bending',
        value: integrate(pts, (x) => { const p = ia(x), q = ib(x); return p.mz * q.mz / bar.EIz + p.my * q.my / bar.EIy; }),
      });
      rows.push({ elementId: bar.e.id, source: 'axial', value: integrate(pts, (x) => ia(x).n * ib(x).n) / bar.EA });
      rows.push({ elementId: bar.e.id, source: 'torsion', value: (fa[3] * fb[3] * bar.L) / bar.GJ });
    }
    for (const s of p0.input.supports.values()) {
      const k = realSprings3D(s);
      if (!k.some((v) => v > 0)) continue;
      const ua = a.disp(s.nodeId);
      const ub = b.disp(s.nodeId);
      rows.push({ elementId: null, source: 'spring', value: k.reduce((acc: number, kk, c) => acc + (kk ?? 0) * ua[c] * ub[c], 0) });
    }
    return rows;
  };
  const none = () => NONE;
  const real = (id: number) => bars.find((b) => b.e.id === id)?.loads ?? NONE;
  const sum = (rows: TermRow[]) => rows.reduce((acc, r) => acc + r.value, 0);

  const deltaTerms: TermRow[][][] = [];
  const delta: number[][] = [];
  for (let i = 0; i < n; i++) {
    deltaTerms.push([]); delta.push([]);
    for (let j = 0; j < n; j++) {
      const rows = mohr(unit[i], none, unit[j], none);
      const ri = redundants[i];
      if (i === j && ri.kind === 'barForce') {
        const e = input.elements.get(ri.elementId!)!;
        const sec = input.sections.get(e.sectionId)!;
        const mat = input.materials.get(e.materialId)!;
        rows.push({ elementId: e.id, source: 'bar', value: axesOf(input, e).L / (mat.e * 1000 * sec.a) });
      }
      deltaTerms[i].push(rows);
      delta[i].push(sum(rows));
    }
  }

  const thermalOf = (id: number) => {
    let u = 0, gy = 0, gz = 0;
    for (const l of input.loads) {
      if (l.type === 'thermal' && l.data.elementId === id) { u += l.data.dtUniform ?? 0; gy += l.data.dtGradientY ?? 0; gz += l.data.dtGradientZ ?? 0; }
    }
    return { u, gy, gz };
  };

  const delta0Terms: TermRow[][] = [];
  const delta0: number[] = [];
  for (let i = 0; i < n; i++) {
    const rows = mohr(unit[i], none, s0, real);
    for (const bar of bars) {
      const th = thermalOf(bar.e.id);
      if (!th.u && !th.gy && !th.gz) continue;
      const f = unit[i].forces(bar.e.id)!;
      let v = th.u ? (-f[0]) * ALPHA * th.u * bar.L : 0;
      if (bar.e.type === 'frame' && (th.gy || th.gz)) {
        const hy = Math.sqrt((12 * bar.sec.iz) / bar.sec.a);
        const hz = Math.sqrt((12 * bar.sec.iy) / bar.sec.a);
        /* Signs pinned by reading δᵢ₀ both ways on a heated space portal. */
        const kz = -(ALPHA * th.gy) / hy;
        const ky = -(ALPHA * th.gz) / hz;
        v += integrate([0, bar.L], (x) => { const p = internal3D(f, NONE, x); return p.mz * kz + p.my * ky; });
      }
      rows.push({ elementId: bar.e.id, source: 'thermal', value: v });
    }
    const ri = redundants[i];
    if (ri.kind === 'barForce') {
      const th = thermalOf(ri.elementId!);
      const e = input.elements.get(ri.elementId!)!;
      if (th.u) rows.push({ elementId: e.id, source: 'thermal', value: ALPHA * th.u * axesOf(input, e).L });
    }
    let settle = 0;
    for (const s of p0.input.supports.values()) {
      [s.dx, s.dy, s.dz, s.drx, s.dry, s.drz].forEach((d, c) => {
        if (!d) return;
        const R = unit[i].reactions.find((q) => q.nodeId === s.nodeId && q.component === c);
        if (R) settle -= R.value * d;
      });
    }
    if (settle) rows.push({ elementId: null, source: 'settlement', value: settle });
    delta0Terms.push(rows);
    delta0.push(sum(rows));
  }

  const deltaCheck = redundants.map((ri, i) => redundants.map((_, j) => {
    let v = generalised(unit[j], patterns[i]);
    if (i === j && ri.kind === 'barForce') v += sum(deltaTerms[i][j].filter((r) => r.source === 'bar'));
    return v;
  }));
  const delta0Check = redundants.map((ri, i) => {
    let v = generalised(s0, patterns[i]);
    if (ri.kind === 'barForce') v += sum(delta0Terms[i].filter((r) => r.source === 'thermal' && r.elementId === ri.elementId));
    return v;
  });

  const prescribed = redundants.map((r) => r.prescribed ?? 0);
  const X = solveSystem(delta, prescribed.map((d, i) => d - delta0[i]));

  const finalBars: BarState[] = bars.map((bar) => {
    const f = [...s0.forces(bar.e.id)!];
    unit.forEach((u, j) => { const fj = u.forces(bar.e.id)!; for (let k = 0; k < 12; k++) f[k] += X[j] * fj[k]; });
    return barState3D(bar.e.id, bar.L, f, bar.loads);
  });
  redundants.forEach((r, i) => {
    if (r.kind !== 'barForce') return;
    const e = input.elements.get(r.elementId!)!;
    finalBars.push(barState3D(e.id, axesOf(input, e).L, [-X[i], 0, 0, 0, 0, 0, X[i], 0, 0, 0, 0, 0], NONE));
  });
  finalBars.sort((a, b) => a.elementId - b.elementId);
  const finalReactions = s0.reactions.map((r) => {
    let v = r.value;
    unit.forEach((u, j) => {
      const m = u.reactions.find((q) => q.nodeId === r.nodeId && q.component === r.component);
      if (m) v += X[j] * m.value;
    });
    return { ...r, value: v };
  });
  redundants.forEach((r, i) => {
    if (r.kind === 'reaction') finalReactions.push({ nodeId: r.nodeId, component: r.component!, value: X[i] });
  });
  finalReactions.sort((a, b) => a.nodeId - b.nodeId || a.component - b.component);
  const final: StateResult = { bars: finalBars, reactions: finalReactions };

  const stiffness = stateOf3D(solveState3D(input));
  let scale = 1e-6; // 1 mN: see the plane method
  for (const b of stiffness.bars) for (const v of Object.values(b.ends)) scale = Math.max(scale, Math.abs(v ?? 0));
  for (const r of stiffness.reactions) scale = Math.max(scale, Math.abs(r.value));
  let maxForceDiff = 0;
  for (const b of stiffness.bars) {
    const mine = final.bars.find((q) => q.elementId === b.elementId);
    if (!mine) continue;
    const truss = input.elements.get(b.elementId)!.type === 'truss';
    for (const k of Object.keys(b.ends) as Array<keyof BarState['ends']>) {
      if (truss && k !== 'nStart' && k !== 'nEnd') continue;
      maxForceDiff = Math.max(maxForceDiff, Math.abs((mine.ends[k] ?? 0) - (b.ends[k] ?? 0)));
    }
  }
  let maxReactionDiff = 0;
  for (const r of stiffness.reactions) {
    const mine = final.reactions.find((q) => q.nodeId === r.nodeId && q.component === r.component);
    maxReactionDiff = Math.max(maxReactionDiff, Math.abs((mine?.value ?? 0) - r.value));
  }

  return {
    is3D: true, count, isostatic: false, redundants, original, primary: geometry3D(p0.input),
    states: [stateOf3D(s0), ...unit.map(stateOf3D)],
    delta, delta0, prescribed, deltaTerms, delta0Terms, deltaCheck, delta0Check, X, final,
    verification: { maxForceDiff, maxReactionDiff, scale, ok: Math.max(maxForceDiff, maxReactionDiff) / scale < 1e-6 },
    stiffness,
  };
}
