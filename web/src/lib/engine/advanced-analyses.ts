/**
 * What the Advanced panel sends to the engine, built where it can be tested.
 *
 * Each piece here closes a gap between what an analysis claimed and what reached the solve:
 *
 *   · Imperfections: the engine builds its notional loads from NODAL loads only, so a frame
 *     loaded by its members (distributed loads, self-weight) took a fraction of its sway force,
 *     or none. The loads are lumped to the nodes here, all of them, and sent as nodal forces.
 *   · Creep: the engine computes φ but solves every step with the original modulus, so creep
 *     never reached a displacement, and it took the panel's f'c as fcm. The effective modulus
 *     and the shrinkage strain are applied here, on the ordinary linear solve, after EC2 Annex B.
 *   · Staged construction: stages were sent no supports and loads by internal index; here the
 *     supports enter with the first stage and each stage names load cases.
 *   · Pushover: plastic moments keyed by the model's section ids missed the solve-only sections
 *     made for stiffness modifiers, which then took Mp = ∞; they follow them here.
 *
 * Pure: no store, no runes, no i18n. The panel supplies the model pieces.
 */
import type { SolverInput3D, SolverLoad3D } from './types-3d';
import type { SolverMaterial } from './types';
import { computeLocalAxes3D } from './local-axes-3d';
import { ENGINE_ALPHA } from './thermal-alpha';
import { materialFamilyOf } from './steel/material-family';
import { catalogueGradeFamily } from './steel/grade-family';

// ─── Loads lumped at the nodes ────────────────────────────────────

type Vec3 = [number, number, number];

function memberAxes(input: SolverInput3D, elementId: number): { L: number; ex: Vec3; ey: Vec3; ez: Vec3; i: number; j: number } | null {
  const e = input.elements.get(elementId);
  if (!e) return null;
  const ni = input.nodes.get(e.nodeI), nj = input.nodes.get(e.nodeJ);
  if (!ni || !nj) return null;
  const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined
    ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
  const ax = computeLocalAxes3D(ni, nj, localY, e.rollAngle ?? 0, input.leftHand ?? false);
  return { L: ax.L, ex: ax.ex as Vec3, ey: ax.ey as Vec3, ez: ax.ez as Vec3, i: e.nodeI, j: e.nodeJ };
}

/**
 * Each node's share of the model's loads, in global axes: nodal forces as they are, member
 * loads split between the two ends by statics, as a simply supported span would. kN.
 */
export function lumpedNodalForces(input: SolverInput3D): Map<number, Vec3> {
  const out = new Map<number, Vec3>();
  const add = (node: number, f: Vec3) => {
    const v = out.get(node) ?? [0, 0, 0];
    out.set(node, [v[0] + f[0], v[1] + f[1], v[2] + f[2]]);
  };
  const toGlobal = (g: NonNullable<ReturnType<typeof memberAxes>>, fy: number, fz: number, fx = 0): Vec3 => [
    fx * g.ex[0] + fy * g.ey[0] + fz * g.ez[0], fx * g.ex[1] + fy * g.ey[1] + fz * g.ez[1], fx * g.ex[2] + fy * g.ey[2] + fz * g.ez[2],
  ];
  // A resultant R at distance x from end I: I takes R·(L − x)/L, J takes R·x/L.
  const split = (g: NonNullable<ReturnType<typeof memberAxes>>, r: Vec3, x: number) => {
    const s = g.L > 0 ? Math.min(1, Math.max(0, x / g.L)) : 0.5;
    add(g.i, [r[0] * (1 - s), r[1] * (1 - s), r[2] * (1 - s)]);
    add(g.j, [r[0] * s, r[1] * s, r[2] * s]);
  };
  for (const l of input.loads) {
    if (l.type === 'nodal') {
      add(l.data.nodeId, [l.data.fx, l.data.fy, l.data.fz]);
    } else if (l.type === 'distributed') {
      const g = memberAxes(input, l.data.elementId);
      if (!g) continue;
      const a = l.data.a ?? 0, b = l.data.b ?? g.L, c = b - a;
      if (!(c > 0)) continue;
      // Uniform part at mid-length, triangular part at two thirds. The axial part (qX) too: a
      // frame's load along it, a column's own weight for one, reaches the engine as qX.
      const qXI = l.data.qXI ?? 0, qXJ = l.data.qXJ ?? 0;
      const uni = toGlobal(g, l.data.qYI * c, l.data.qZI * c, qXI * c);
      const tri = toGlobal(g, (l.data.qYJ - l.data.qYI) * c / 2, (l.data.qZJ - l.data.qZI) * c / 2, (qXJ - qXI) * c / 2);
      split(g, uni, a + c / 2);
      split(g, tri, a + (2 * c) / 3);
    } else if (l.type === 'pointOnElement') {
      const g = memberAxes(input, l.data.elementId);
      if (!g) continue;
      split(g, toGlobal(g, l.data.py, l.data.pz), l.data.a);
    }
  }
  return out;
}

/**
 * Notional loads for an out-of-plumbness `ratio`, along X or Y: at each node, the ratio times
 * the downward load the node carries. A node whose loads point up overall takes none.
 */
export function notionalLoads3D(input: SolverInput3D, ratio: number, dir: 'X' | 'Y'): SolverLoad3D[] {
  const out: SolverLoad3D[] = [];
  for (const [nodeId, f] of lumpedNodalForces(input)) {
    const down = -f[2];
    if (!(down > 1e-12)) continue;
    const h = ratio * down;
    out.push({ type: 'nodal', data: { nodeId, fx: dir === 'X' ? h : 0, fy: dir === 'Y' ? h : 0, fz: 0, mx: 0, my: 0, mz: 0 } });
  }
  return out;
}

/** The input with the notional loads added, and their total, kN. */
export function withNotionalLoads(input: SolverInput3D, ratio: number, dir: 'X' | 'Y'): { input: SolverInput3D; totalH: number; totalV: number } {
  const notional = notionalLoads3D(input, ratio, dir);
  let totalH = 0;
  for (const l of notional) if (l.type === 'nodal') totalH += l.data.fx + l.data.fy;
  return { input: { ...input, loads: [...input.loads, ...notional] }, totalH, totalV: ratio > 0 ? totalH / ratio : 0 };
}

// ─── Creep and shrinkage, EN 1992-1-1 Annex B and 3.1.4 ──────────

export type CementClass = 'S' | 'N' | 'R';

export interface CreepSettings {
  /** Characteristic strength f'c (fck), MPa. fcm = fck + 8. */
  fck: number;
  /** Relative humidity, %. */
  rh: number;
  /** Notional size 2·Ac/u, mm. */
  h0: number;
  /** Age at loading, days. */
  t0: number;
  cement: CementClass;
}

/** φ(t, t0), EN 1992-1-1 B.1. */
export function ec2CreepCoefficient(s: CreepSettings, t: number): number {
  if (!(t > s.t0)) return 0;
  const fcm = s.fck + 8;
  const a1 = (35 / fcm) ** 0.7, a2 = (35 / fcm) ** 0.2, a3 = (35 / fcm) ** 0.5;
  const dry = (1 - s.rh / 100) / (0.1 * Math.cbrt(s.h0));
  // (B.3a) for fcm ≤ 35 MPa carries no α; (B.3b) above it does.
  const phiRH = fcm <= 35 ? 1 + dry : (1 + dry * a1) * a2;
  const betaFcm = 16.8 / Math.sqrt(fcm);
  // (B.9): the cement class moves the age at loading by α = −1 (S), 0 (N), 1 (R).
  const alpha = s.cement === 'S' ? -1 : s.cement === 'R' ? 1 : 0;
  const t0adj = Math.max(0.5, s.t0 * (9 / (2 + s.t0 ** 1.2) + 1) ** alpha);
  const betaT0 = 1 / (0.1 + t0adj ** 0.2);
  const phi0 = phiRH * betaFcm * betaT0;
  const base = 1.5 * (1 + (0.012 * s.rh) ** 18) * s.h0;
  const betaH = fcm <= 35 ? Math.min(base + 250, 1500) : Math.min(base + 250 * a3, 1500 * a3);
  const dt = t - s.t0;
  return phi0 * (dt / (betaH + dt)) ** 0.3;
}

/** kh of Table 3.3, interpolated. */
function khOf(h0: number): number {
  const pts: Array<[number, number]> = [[100, 1.0], [200, 0.85], [300, 0.75], [500, 0.70]];
  if (h0 <= 100) return 1.0;
  if (h0 >= 500) return 0.70;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i]!, [x0, y0] = pts[i - 1]!;
    if (h0 <= x1) return y0 + (y1 - y0) * (h0 - x0) / (x1 - x0);
  }
  return 0.70;
}

/** Total shrinkage strain εcs(t), positive as shortening, drying from `ts` days (3.1.4, B.2). */
export function ec2ShrinkageStrain(s: CreepSettings, t: number, ts = 3): number {
  const fcm = s.fck + 8;
  const ads1 = s.cement === 'S' ? 3 : s.cement === 'R' ? 6 : 4;
  const ads2 = s.cement === 'S' ? 0.13 : s.cement === 'R' ? 0.11 : 0.12;
  const betaRH = 1.55 * (1 - (s.rh / 100) ** 3);
  const ecd0 = 0.85 * ((220 + 110 * ads1) * Math.exp(-ads2 * fcm / 10)) * 1e-6 * betaRH;
  const dt = Math.max(0, t - ts);
  const betaDs = dt / (dt + 0.04 * Math.sqrt(s.h0 ** 3));
  const ecd = betaDs * khOf(s.h0) * ecd0;
  const ecaInf = 2.5 * Math.max(0, s.fck - 10) * 1e-6;
  const eca = (1 - Math.exp(-0.2 * Math.sqrt(Math.max(0, t)))) * ecaInf;
  return ecd + eca;
}

/**
 * The input at time `t`: each creeping material with E/(1 + φ), for the sustained loads.
 * `phiOf` names the materials that creep and their φ.
 */
export function effectiveModulusInput(input: SolverInput3D, phiOf: Map<number, number>): SolverInput3D {
  const materials = new Map(input.materials);
  for (const [id, phi] of phiOf) {
    const m = materials.get(id) as SolverMaterial | undefined;
    if (m) materials.set(id, { ...m, e: m.e / (1 + phi) });
  }
  return { ...input, materials };
}

/**
 * The input for shrinkage alone at time `t`: no loads but a uniform shortening of each creeping
 * member, sent as the temperature drop the engine's α turns into that strain, on the
 * age-adjusted modulus E/(1 + χ·φ). Shells do not shrink here.
 */
export function shrinkageInput(input: SolverInput3D, phiOf: Map<number, number>, epsOf: Map<number, number>, chi = 0.8): SolverInput3D {
  const materials = new Map(input.materials);
  for (const [id, phi] of phiOf) {
    const m = materials.get(id) as SolverMaterial | undefined;
    if (m) materials.set(id, { ...m, e: m.e / (1 + chi * phi) });
  }
  const loads: SolverLoad3D[] = [];
  for (const e of input.elements.values()) {
    const eps = epsOf.get(e.materialId);
    if (!eps) continue;
    loads.push({ type: 'thermal', data: { elementId: e.id, dtUniform: -eps / ENGINE_ALPHA, dtGradientY: 0, dtGradientZ: 0 } });
  }
  return { ...input, materials, loads };
}

/** Two linear results added node by node: displacements, reactions and member end forces. */
export function superpose<R extends { displacements: any[]; reactions: any[]; elementForces: any[] }>(a: R, b: R): R {
  const addRows = (xs: any[], ys: any[], key: string) => {
    const byId = new Map(ys.map((y) => [y[key], y]));
    return xs.map((x) => {
      const y = byId.get(x[key]);
      if (!y) return x;
      const out: Record<string, unknown> = { ...x };
      for (const k of Object.keys(x)) if (k !== key && typeof x[k] === 'number' && typeof y[k] === 'number' && k !== 'length') out[k] = x[k] + y[k];
      return out;
    });
  };
  return {
    ...a,
    displacements: addRows(a.displacements, b.displacements, 'nodeId'),
    reactions: addRows(a.reactions, b.reactions, 'nodeId'),
    elementForces: addRows(a.elementForces, b.elementForces, 'elementId'),
  };
}

// ─── Staged construction ──────────────────────────────────────────

/**
 * The staged input's loads, case after case, and the indices each case occupies. A stage names
 * cases; the engine takes indices into this list.
 */
export function stagedLoadsByCase(caseLoads: Map<number, SolverLoad3D[]>): { loads: SolverLoad3D[]; indicesOf: Map<number, number[]> } {
  const loads: SolverLoad3D[] = [];
  const indicesOf = new Map<number, number[]>();
  for (const [caseId, list] of caseLoads) {
    const idx: number[] = [];
    for (const l of list) { idx.push(loads.length); loads.push(l); }
    indicesOf.set(caseId, idx);
  }
  return { loads, indicesOf };
}

/** Why staged construction cannot take this input, as an i18n key, or null. */
export function stagedRefusal(input: SolverInput3D): string | null {
  if ((input.curvedShells?.size ?? 0) > 0) return 'adv.stagedNoCurvedShells';
  if ((input.connectors?.size ?? 0) > 0) return 'adv.stagedNoConnectors';
  return null;
}

// ─── Pushover ─────────────────────────────────────────────────────

/**
 * The plastic payload keyed by the sections the solve actually uses. A member with stiffness
 * modifiers is solved on a section of its own (`applyStiffnessModifiers`); its Mp is its model
 * section's, since a cracked inertia does not change a steel member's strength.
 */
export function plasticForSolve<P extends { sections: Record<string, unknown>; mpOverrides: Record<string, [number, number]> }>(
  p: P,
  input: SolverInput3D,
  modelSectionOf: (elementId: number) => number | undefined,
): P {
  const sections = { ...p.sections };
  const mpOverrides = { ...p.mpOverrides };
  for (const [id, el] of input.elements) {
    const own = modelSectionOf(id);
    if (own === undefined || own === el.sectionId) continue;
    const from = String(own), to = String(el.sectionId);
    if (mpOverrides[to] || !mpOverrides[from]) continue;
    mpOverrides[to] = mpOverrides[from]!;
    if (sections[from]) sections[to] = sections[from];
  }
  return { ...p, sections, mpOverrides };
}

/**
 * The materials of members a pushover cannot take, by name. Its hinges form at Mp = fy·Zp,
 * a steel section's; a concrete member's `fy` holds f'c, and f'c·Zp is no plastic moment.
 */
export function pushoverNonSteel(
  elements: Iterable<{ materialId: number }>,
  materials: Map<number, { name: string; fy?: number; gradeId?: string }>,
): string[] {
  const out = new Set<string>();
  for (const e of elements) {
    const m = materials.get(e.materialId);
    if (materialFamilyOf(m as never, catalogueGradeFamily).family !== 'steel') out.add(m?.name ?? String(e.materialId));
  }
  return [...out];
}

/** The materials that creep: concrete, by declared grade or by its strength. */
export function concreteMaterials<M extends { fy?: number; gradeId?: string }>(materials: Map<number, M>): Map<number, M> {
  const out = new Map<number, M>();
  for (const [id, m] of materials) if (materialFamilyOf(m as never, catalogueGradeFamily).family === 'concrete') out.set(id, m);
  return out;
}

// ─── Section analyser ─────────────────────────────────────────────

/** Saint-Venant J of a solid rectangle, long side `a`, short side `b` (Roark). */
export function rectangleJ(w: number, h: number): number {
  const a = Math.max(w, h), b = Math.min(w, h);
  if (!(b > 0)) return 0;
  return a * b ** 3 * (1 / 3 - 0.21 * (b / a) * (1 - b ** 4 / (12 * a ** 4)));
}

/** A creep run at each time: φ and εcs of the creeping materials, and the linear result. */
export interface CreepStep<R> { tDays: number; creepCoefficient: number; shrinkageStrain: number; results: R }

/**
 * Creep and shrinkage by the effective-modulus method, one linear solve per effect and time.
 *
 * The sustained loads are solved with E/(1 + φ(t, t0)); the shrinkage strain on the age-adjusted
 * modulus E/(1 + χ·φ); the two add. `settingsOf` names the materials that creep. Materials not in
 * it keep their modulus and do not shrink.
 */
export function creepSteps<R extends { displacements: any[]; reactions: any[]; elementForces: any[] }>(
  input: SolverInput3D,
  settingsOf: Map<number, CreepSettings>,
  times: readonly number[],
  solve: (i: SolverInput3D) => R,
  chi = 0.8,
): CreepStep<R>[] {
  const out: CreepStep<R>[] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    const phiOf = new Map<number, number>(), epsOf = new Map<number, number>();
    let phiMax = 0, epsMax = 0;
    for (const [id, s] of settingsOf) {
      const phi = ec2CreepCoefficient(s, t), eps = ec2ShrinkageStrain(s, t);
      phiOf.set(id, phi); epsOf.set(id, eps);
      phiMax = Math.max(phiMax, phi); epsMax = Math.max(epsMax, eps);
    }
    const loaded = solve(effectiveModulusInput(input, phiOf));
    const shrink = shrinkageInput(input, phiOf, epsOf, chi);
    const results = shrink.loads.length > 0 ? superpose(loaded, solve(shrink)) : loaded;
    out.push({ tDays: t, creepCoefficient: phiMax, shrinkageStrain: epsMax, results });
  }
  return out;
}

/** A stage as the panel edits it: what enters and leaves, and the load cases it applies. */
export interface PanelStage {
  name: string;
  elementsAdded: number[]; elementsRemoved: number[];
  platesAdded: number[]; platesRemoved: number[];
  quadsAdded: number[]; quadsRemoved: number[];
  caseIds: number[];
}

/**
 * The engine's stages. The model's supports enter with the first stage: the engine keeps only
 * the supports a stage names, so springs and supports that are not fully fixed were dropped from
 * every stage when none were named.
 */
export function stagedStagesPayload(stages: readonly PanelStage[], indicesOf: Map<number, number[]>, supportNodeIds: readonly number[]) {
  return stages.map((s, i) => ({
    name: s.name,
    elementsAdded: s.elementsAdded, elementsRemoved: s.elementsRemoved,
    platesAdded: s.platesAdded, platesRemoved: s.platesRemoved,
    quadsAdded: s.quadsAdded, quadsRemoved: s.quadsRemoved,
    supportsAdded: i === 0 ? [...supportNodeIds] : [],
    supportsRemoved: [],
    loadIndices: s.caseIds.flatMap((c) => indicesOf.get(c) ?? []),
  }));
}
