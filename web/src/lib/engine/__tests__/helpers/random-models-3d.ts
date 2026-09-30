/**
 * Seeded random 3D models for the Basic-3D advanced-function sweep
 * (`advanced-sweep-3d.test.ts`).
 *
 * Every model is built through the model store API, exactly as a user drawing
 * in Basic 3D would build it (addNode / addElement / addSupport / 3D loads /
 * updateElement for releases, roll angles and local axes). Nothing here goes
 * around the store, so what the sweep exercises is the JS layer the panels
 * call plus the WASM engine behind it.
 */
import { historyStore, modelStore, uiStore } from '../../../store';
import type { SupportType } from '../../../store/model.svelte';
import type { SolverInput3D, AnalysisResults3D } from '../../types-3d';
import { computeLocalAxes3D } from '../../local-axes-3d';

// ─── RNG ─────────────────────────────────────────────────────────

export class Rng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 1; }
  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uni(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(this.uni(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number): boolean { return this.next() < p; }
  sgn(): number { return this.next() < 0.5 ? -1 : 1; }
}

// ─── Model scaffolding ───────────────────────────────────────────

export function resetModel3D(): void {
  historyStore.clear();
  uiStore.analysisMode = '3d';
  modelStore.clear();
  uiStore.viewportPresentation3D = 'native3d';
}

export interface Palette {
  /** Default IPN 300 (geometry-backed, id 1). */
  ipn: number;
  /** Stiff properties-only section. */
  stiff: number;
  /** Flexible properties-only section. */
  flex: number;
  /** Circular hollow section (geometry-backed). */
  tube: number;
  /** Solid rectangle 30x50 (geometry-backed). */
  rect: number;
  /** Small bar for truss members. */
  bar: number;
  /** Rectangular hollow section declared by its shape (geometry-backed when the engine resolves it). */
  rhs: number;
  steel: number;
  concrete: number;
}

export function addPalette(): Palette {
  const stiff = modelStore.addSection({ name: 'stiff', a: 0.02, iy: 4e-4, iz: 1.2e-4, j: 5e-5 });
  const flex = modelStore.addSection({ name: 'flex', a: 1.2e-3, iy: 2.5e-6, iz: 6e-7, j: 2e-7 });
  // Declared by shape, so the engine resolves them geometry-backed (as catalogue profiles are).
  const tube = modelStore.addSection({ name: 'CHS 168.3x7.1', shape: 'CHS', b: 0.1683, h: 0.1683, t: 0.0071, a: 3.6e-3, iy: 1.1e-5, iz: 1.1e-5, j: 2.2e-5 });
  const rect = modelStore.addSection({ name: 'rect 30x50', shape: 'rect', a: 0.3 * 0.5, iy: (0.3 * 0.5 ** 3) / 12, iz: (0.5 * 0.3 ** 3) / 12, j: 0.0028, b: 0.3, h: 0.5 });
  const bar = modelStore.addSection({ name: 'bar', a: 1.5e-3, iy: 1e-6, iz: 1e-6, j: 2e-6 });
  const rhs = modelStore.addSection({ name: 'RHS 150x100x6', shape: 'RHS', b: 0.1, h: 0.15, t: 0.006, a: 2.856e-3, iy: 8.85e-6, iz: 4.66e-6, j: 9.24e-6 });
  const concrete = modelStore.addMaterial({ name: 'H-25', e: 30000, nu: 0.2, rho: 25 });
  return { ipn: 1, stiff, flex, tube, rect, bar, rhs, steel: 1, concrete };
}

export function frame(ni: number, nj: number, sec: number, mat = 1): number {
  const id = modelStore.addElement(ni, nj, 'frame');
  modelStore.updateElement(id, { sectionId: sec, materialId: mat });
  return id;
}

export function truss(ni: number, nj: number, sec: number, mat = 1): number {
  const id = modelStore.addElement(ni, nj, 'truss');
  modelStore.updateElement(id, { sectionId: sec, materialId: mat });
  return id;
}

export function support(nodeId: number, type: SupportType, dofs?: { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean }, springs?: { kx?: number; ky?: number; kz?: number; krx?: number; kry?: number; krz?: number }): number {
  const t: SupportType = dofs ? 'custom3d' : type;
  return modelStore.addSupport(nodeId, t, springs, dofs ? { dofRestraints: dofs } : undefined);
}

export const DOF = (s: string) => ({
  tx: s.includes('x'), ty: s.includes('y'), tz: s.includes('z'),
  rx: s.includes('X'), ry: s.includes('Y'), rz: s.includes('Z'),
});

/** A model the sweep runs, with what the generator knows about it. */
export interface ModelCase {
  family: string;
  seed: number;
  /** Frame members carrying member loads (distributed / point). */
  loadedFrames: number[];
  /** Generator knows this is a mechanism. */
  mechanism?: boolean;
  /** Generator added springs or prescribed displacements (no E-scaling linearity). */
  hasSprings?: boolean;
}

// ─── Loads ───────────────────────────────────────────────────────

function randNodal(r: Rng, nodeId: number, scale: number, moments = true): void {
  const f = () => (r.chance(0.6) ? r.uni(-scale, scale) : 0);
  const m = () => (moments && r.chance(0.35) ? r.uni(-scale, scale) * 0.5 : 0);
  let fx = f(), fy = f(), fz = f();
  if (fx === 0 && fy === 0 && fz === 0) fz = -scale;
  modelStore.addNodalLoad3D(nodeId, fx, fy, fz, m(), m(), m());
}

function randMemberLoad(r: Rng, elemId: number, L: number, scale: number, cs: ModelCase): void {
  if (r.chance(0.7)) {
    const qZ = r.uni(-scale, 0.3 * scale), qY = r.chance(0.5) ? r.uni(-0.5 * scale, 0.5 * scale) : 0;
    const tri = r.chance(0.3);
    if (r.chance(0.2)) {
      const a = r.uni(0, 0.4 * L), b = r.uni(0.6 * L, L);
      modelStore.addDistributedLoad3D(elemId, qY, tri ? 0 : qY, qZ, tri ? 2 * qZ : qZ, a, b);
    } else {
      modelStore.addDistributedLoad3D(elemId, qY, tri ? 0 : qY, qZ, tri ? 2 * qZ : qZ);
    }
  } else {
    modelStore.addPointLoadOnElement3D(elemId, r.uni(0.1, 0.9) * L, r.uni(-scale, scale), r.uni(-2 * scale, scale));
  }
  cs.loadedFrames.push(elemId);
}

function lengthOf(elemId: number): number {
  const e = modelStore.elements.get(elemId)!;
  const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
  return Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
}

function sprinkleLoads(r: Rng, cs: ModelCase, opts: { nodes: number[]; frames: number[]; scale: number; pNodal?: number; pMember?: number; moments?: boolean }): void {
  const { nodes, frames, scale } = opts;
  let any = false;
  for (const n of nodes) if (r.chance(opts.pNodal ?? 0.4)) { randNodal(r, n, scale, opts.moments ?? true); any = true; }
  for (const e of frames) if (r.chance(opts.pMember ?? 0.35)) { randMemberLoad(r, e, lengthOf(e), scale / 2, cs); any = true; }
  if (!any && nodes.length) randNodal(r, nodes[nodes.length - 1], scale, opts.moments ?? true);
}

function randomRoll(r: Rng, elemId: number): void {
  const kind = r.int(0, 3);
  if (kind === 1) modelStore.updateElement(elemId, { rollAngle: r.pick([90, 180, 270]) });
  else if (kind === 2) modelStore.updateElement(elemId, { rollAngle: Math.round(r.uni(0, 360)) });
  else if (kind === 3) {
    // Explicit local Y, kept away from the member axis.
    const e = modelStore.elements.get(elemId)!;
    const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
    const ex = [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)];
    const L = Math.hypot(ex[0], ex[1], ex[2]);
    for (let k = 0; k < 10; k++) {
      const v = [r.uni(-1, 1), r.uni(-1, 1), r.uni(-1, 1)];
      const vn = Math.hypot(v[0], v[1], v[2]);
      const c = [ex[1] * v[2] - ex[2] * v[1], ex[2] * v[0] - ex[0] * v[2], ex[0] * v[1] - ex[1] * v[0]];
      if (vn > 0.3 && Math.hypot(c[0], c[1], c[2]) / (L * vn) > 0.3) {
        modelStore.updateElement(elemId, { localYx: v[0] / vn, localYy: v[1] / vn, localYz: v[2] / vn });
        break;
      }
    }
  }
}

// ─── Families ────────────────────────────────────────────────────

type Builder = (r: Rng, seed: number, P: Palette) => ModelCase;

/** Orthogonal multi-bay, multi-storey space frame. */
const spaceFrame: Builder = (r, seed, P) => {
  const cs: ModelCase = { family: 'space-frame', seed, loadedFrames: [] };
  const bx = r.int(1, 3), by = r.int(1, 2), ns = r.int(1, 4);
  const sx = r.uni(3, 7), sy = r.uni(3, 6), h = r.uni(2.8, 4);
  const colSec = r.pick([P.ipn, P.stiff, P.tube, P.rect]);
  const beamSec = r.pick([P.ipn, P.stiff, P.flex, P.rect, P.rhs]);
  const mat = colSec === P.rect ? P.concrete : P.steel;
  const id = (i: number, j: number, k: number) => ids[(k * (by + 1) + j) * (bx + 1) + i];
  const ids: number[] = [];
  for (let k = 0; k <= ns; k++) for (let j = 0; j <= by; j++) for (let i = 0; i <= bx; i++) ids.push(modelStore.addNode(i * sx, j * sy, k * h));
  const frames: number[] = [];
  for (let k = 1; k <= ns; k++) for (let j = 0; j <= by; j++) for (let i = 0; i <= bx; i++) {
    frames.push(frame(id(i, j, k - 1), id(i, j, k), colSec, mat));
    if (i < bx) frames.push(frame(id(i, j, k), id(i + 1, j, k), beamSec, mat));
    if (j < by) frames.push(frame(id(i, j, k), id(i, j + 1, k), beamSec, mat));
  }
  const base = r.pick(['fixed3d', 'fixed3d', 'pinned3d'] as const);
  for (let j = 0; j <= by; j++) for (let i = 0; i <= bx; i++) support(id(i, j, 0), base);
  const upper = ids.filter((_, n) => n >= (bx + 1) * (by + 1));
  sprinkleLoads(r, cs, { nodes: upper, frames: frames.filter((e) => lengthOf(e) > 0 && modelStore.elements.get(e)!.nodeI !== modelStore.elements.get(e)!.nodeJ), scale: r.uni(5, 40) });
  return cs;
};

/** Skewed, jittered frame: inclined columns, skew beams, roll angles and explicit local axes. */
const skewFrame: Builder = (r, seed, P) => {
  const cs: ModelCase = { family: 'skew-frame', seed, loadedFrames: [] };
  const bx = r.int(1, 2), by = r.int(1, 2), ns = r.int(1, 3);
  const s = r.uni(3, 6), h = r.uni(3, 4);
  const ids: number[] = [];
  const idx = (i: number, j: number, k: number) => ids[(k * (by + 1) + j) * (bx + 1) + i];
  for (let k = 0; k <= ns; k++) for (let j = 0; j <= by; j++) for (let i = 0; i <= bx; i++) {
    const jit = k === 0 ? 0.15 : 0.3;
    ids.push(modelStore.addNode(i * s + r.uni(-jit, jit) * s + 0.2 * k * j, j * s + r.uni(-jit, jit) * s, k * h + (k === 0 ? 0 : r.uni(-0.4, 0.4))));
  }
  const frames: number[] = [];
  const secs = [P.ipn, P.stiff, P.tube, P.flex, P.rect, P.rhs];
  for (let k = 1; k <= ns; k++) for (let j = 0; j <= by; j++) for (let i = 0; i <= bx; i++) {
    frames.push(frame(idx(i, j, k - 1), idx(i, j, k), r.pick(secs)));
    if (i < bx) frames.push(frame(idx(i, j, k), idx(i + 1, j, k), r.pick(secs)));
    if (j < by) frames.push(frame(idx(i, j, k), idx(i, j + 1, k), r.pick(secs)));
    if (i < bx && j < by && r.chance(0.3)) frames.push(frame(idx(i, j, k), idx(i + 1, j + 1, k), r.pick(secs)));
  }
  for (const e of frames) if (r.chance(0.5)) randomRoll(r, e);
  for (let j = 0; j <= by; j++) for (let i = 0; i <= bx; i++) support(idx(i, j, 0), r.pick(['fixed3d', 'fixed3d', 'pinned3d'] as const));
  // At least one fixed base, so pinned bases cannot leave a torsion mechanism of the whole frame.
  support(idx(0, 0, 0), 'fixed3d');
  sprinkleLoads(r, cs, { nodes: ids.slice((bx + 1) * (by + 1)), frames, scale: r.uni(5, 30), pMember: 0.5 });
  return cs;
};

/** Horizontal grillage of beams (all nodes at one level). */
const grillage: Builder = (r, seed, P) => {
  const cs: ModelCase = { family: 'grillage', seed, loadedFrames: [] };
  const nx = r.int(2, 5), ny = r.int(1, 4), sx = r.uni(2, 5), sy = r.uni(2, 5);
  const z0 = r.pick([0, 0, 3]);
  const ids: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) ids.push(modelStore.addNode(i * sx, j * sy, z0));
  const at = (i: number, j: number) => ids[j * (nx + 1) + i];
  const frames: number[] = [];
  const sec = r.pick([P.ipn, P.stiff, P.rect, P.tube]);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    if (i < nx) frames.push(frame(at(i, j), at(i + 1, j), sec));
    if (j < ny) frames.push(frame(at(i, j), at(i, j + 1), r.chance(0.3) ? P.flex : sec));
  }
  const corners = [at(0, 0), at(nx, 0), at(0, ny), at(nx, ny)];
  const mode = r.int(0, 2);
  if (mode === 0) for (const c of corners) support(c, 'pinned3d');
  else if (mode === 1) { support(corners[0], 'fixed3d'); support(corners[3], 'pinned3d'); }
  else for (let i = 0; i <= nx; i++) { support(at(i, 0), 'pinned3d'); support(at(i, ny), i % 2 ? 'rollerXY' : 'pinned3d'); }
  if (mode === 2) support(at(0, 0), 'fixed3d');
  // Grillage loads: vertical forces and in-plane moments, member gravity loads.
  for (const n of ids) if (r.chance(0.4)) modelStore.addNodalLoad3D(n, 0, 0, -r.uni(2, 20), r.uni(-5, 5), r.uni(-5, 5), 0);
  for (const e of frames) if (r.chance(0.4)) { modelStore.addDistributedLoad3D(e, 0, 0, -r.uni(1, 10), -r.uni(1, 10)); cs.loadedFrames.push(e); }
  if (cs.loadedFrames.length === 0) modelStore.addNodalLoad3D(at(1, 0), 0, 0, -10, 0, 0, 0);
  return cs;
};

/** Triangulated triangular-prism space truss. */
const spaceTruss: Builder = (r, seed, P) => {
  const cs: ModelCase = { family: 'space-truss', seed, loadedFrames: [] };
  const n = r.int(2, 6), s = r.uni(1.5, 3), w = r.uni(1.5, 3), h = r.uni(1.2, 3);
  const BL: number[] = [], BR: number[] = [], T: number[] = [];
  for (let i = 0; i <= n; i++) {
    BL.push(modelStore.addNode(i * s, 0, 0));
    BR.push(modelStore.addNode(i * s, w, 0));
    T.push(modelStore.addNode(i * s, w / 2, h));
  }
  const sec = r.pick([P.bar, P.tube]);
  for (let i = 0; i <= n; i++) {
    truss(BL[i], BR[i], sec); truss(BL[i], T[i], sec); truss(BR[i], T[i], sec);
    if (i < n) {
      truss(BL[i], BL[i + 1], sec); truss(BR[i], BR[i + 1], sec); truss(T[i], T[i + 1], sec);
      truss(BL[i], BR[i + 1], sec); truss(BL[i], T[i + 1], sec); truss(BR[i], T[i + 1], sec);
    }
  }
  if (r.chance(0.5)) {
    support(BL[0], 'pinned3d'); support(BR[0], 'custom3d', DOF('xz')); support(BL[n], 'custom3d', DOF('z'));
  } else {
    support(BL[0], 'pinned3d'); support(BR[0], 'pinned3d'); support(BL[n], 'pinned3d'); support(BR[n], 'rollerXY');
  }
  const all = [...BL, ...BR, ...T];
  for (const nd of all) if (r.chance(0.35)) modelStore.addNodalLoad3D(nd, r.uni(-5, 5), r.uni(-5, 5), -r.uni(2, 20), 0, 0, 0);
  modelStore.addNodalLoad3D(T[Math.floor(n / 2)], 0, 0, -10, 0, 0, 0);
  return cs;
};

/** Four-legged braced tower. */
const tower: Builder = (r, seed, P) => {
  const cs: ModelCase = { family: 'tower', seed, loadedFrames: [] };
  const nl = r.int(2, 6), b0 = r.uni(3, 6), taper = r.uni(0.4, 1), h = r.uni(2.5, 4);
  const lv: number[][] = [];
  for (let k = 0; k <= nl; k++) {
    const b = b0 * (1 - (1 - taper) * (k / nl));
    const c = (b0 - b) / 2;
    lv.push([
      modelStore.addNode(c, c, k * h), modelStore.addNode(c + b, c, k * h),
      modelStore.addNode(c + b, c + b, k * h), modelStore.addNode(c, c + b, k * h),
    ]);
  }
  const leg = r.pick([P.tube, P.stiff, P.ipn, P.rhs]);
  const brace = r.pick([P.bar, P.tube]);
  const frames: number[] = [];
  const braceAsTruss = r.chance(0.7);
  for (let k = 1; k <= nl; k++) for (let q = 0; q < 4; q++) {
    frames.push(frame(lv[k - 1][q], lv[k][q], leg));
    const hz = frame(lv[k][q], lv[k][(q + 1) % 4], r.pick([P.tube, P.ipn]));
    frames.push(hz);
    const d1 = lv[k - 1][q], d2 = lv[k][(q + 1) % 4];
    if (braceAsTruss) truss(d1, d2, brace); else frames.push(frame(d1, d2, brace));
    if (r.chance(0.5)) { if (braceAsTruss) truss(lv[k - 1][(q + 1) % 4], lv[k][q], brace); else frames.push(frame(lv[k - 1][(q + 1) % 4], lv[k][q], brace)); }
  }
  const base = r.pick(['fixed3d', 'pinned3d'] as const);
  for (const n of lv[0]) support(n, base);
  const top = lv[nl];
  modelStore.addNodalLoad3D(top[0], r.uni(-20, 20), r.uni(-20, 20), -r.uni(0, 30), 0, 0, r.uni(-10, 10));
  for (let k = 1; k < nl; k++) if (r.chance(0.5)) modelStore.addNodalLoad3D(lv[k][r.int(0, 3)], r.uni(-10, 10), r.uni(-10, 10), 0, 0, 0, 0);
  for (const e of frames) if (r.chance(0.15)) randMemberLoad(r, e, lengthOf(e), 3, cs);
  return cs;
};

/** Cantilevers with torsion: straight (any direction), subdivided, or L-shaped. */
const cantileverTorsion: Builder = (r, seed, P) => {
  const cs: ModelCase = { family: 'cantilever-torsion', seed, loadedFrames: [] };
  const L = r.uni(2, 6), nSub = r.int(1, 5);
  const th = r.uni(0, 2 * Math.PI), incl = r.chance(0.3) ? r.uni(-0.5, 0.5) : 0;
  const dir = [Math.cos(th) * Math.cos(incl), Math.sin(th) * Math.cos(incl), Math.sin(incl)];
  const sec = r.pick([P.ipn, P.stiff, P.tube, P.rect, P.flex, P.rhs]);
  const ids = [modelStore.addNode(0, 0, 1)];
  const frames: number[] = [];
  for (let i = 1; i <= nSub; i++) {
    ids.push(modelStore.addNode(dir[0] * L * i / nSub, dir[1] * L * i / nSub, 1 + dir[2] * L * i / nSub));
    frames.push(frame(ids[i - 1], ids[i], sec));
  }
  let tip = ids[ids.length - 1];
  if (r.chance(0.5)) {
    // L-shape: a second leg at right angle in plan, so a tip load twists the first.
    const d2 = [-dir[1], dir[0], 0];
    const tn = modelStore.nodes.get(tip)!;
    const L2 = r.uni(1, 3);
    const n2 = modelStore.addNode(tn.x + d2[0] * L2, tn.y + d2[1] * L2, (tn.z ?? 0));
    frames.push(frame(tip, n2, sec));
    tip = n2;
  }
  for (const e of frames) if (r.chance(0.4)) randomRoll(r, e);
  support(ids[0], 'fixed3d');
  // Torque kept to a twist of about 0.02 rad, so the linear answer is still a linear answer.
  const js = modelStore.sections.get(sec)!;
  const T = r.uni(-1, 1) * Math.min(15, 0.02 * (80e6 * (js.j ?? 1e-6)) / L);
  // Forces kept to a tip deflection of about L/100 for the weaker axis (3EI·δ/L³), for the same reason.
  const Ltot = L + 3;
  const F = Math.min(10, (3 * 200e6 * Math.min(js.iy ?? js.iz, js.iz) * (Ltot / 100)) / Ltot ** 3);
  modelStore.addNodalLoad3D(tip, r.uni(-0.5, 0.5) * F, r.uni(-0.5, 0.5) * F, -r.uni(0, 1) * F, T * dir[0], T * dir[1], T * dir[2]);
  for (const e of frames) if (r.chance(0.4)) randMemberLoad(r, e, lengthOf(e), 0.4 * F / Ltot, cs);
  return cs;
};

/** Space frame with random end releases (hinges) on beams; may be a mechanism. */
const hingedFrame: Builder = (r, seed, P) => {
  const cs = spaceFrame(r, seed, P);
  cs.family = 'hinged-frame';
  for (const e of modelStore.elements.values()) {
    const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
    const isBeam = Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-9;
    if (!isBeam) continue;
    for (const end of ['releaseI', 'releaseJ'] as const) {
      if (!r.chance(0.3)) continue;
      const kind = r.int(0, 3);
      const rel = kind === 0 ? { my: true, mz: true, t: false } : kind === 1 ? { my: true, mz: false, t: false } : kind === 2 ? { my: false, mz: true, t: false } : { my: true, mz: true, t: true };
      modelStore.updateElement(e.id, { [end]: rel });
    }
  }
  return cs;
};

/** Frames on springs (translational and rotational), some rigid DOFs mixed in. */
const springFrame: Builder = (r, seed, P) => {
  const cs = spaceFrame(r, seed, P);
  cs.family = 'spring-frame';
  cs.hasSprings = true;
  let first = true;
  for (const s of [...modelStore.supports.values()]) {
    const k = () => (r.chance(0.8) ? 10 ** r.uni(3, 6) : 0);
    if (first) { first = false; continue; } // keep one rigid support
    modelStore.addSupport(s.nodeId, 'spring3d', { kx: k(), ky: k(), kz: 10 ** r.uni(3, 6), krx: k(), kry: k(), krz: k() });
  }
  return cs;
};

/** Portal frames braced by truss diagonals; truss roof on frame columns. */
const mixedFrameTruss: Builder = (r, seed, P) => {
  const cs: ModelCase = { family: 'mixed-frame-truss', seed, loadedFrames: [] };
  const nb = r.int(1, 4), s = r.uni(4, 7), w = r.uni(4, 8), h = r.uni(3, 5), rise = r.uni(0.5, 2);
  const frames: number[] = [];
  const baseA: number[] = [], baseB: number[] = [], topA: number[] = [], topB: number[] = [], ridge: number[] = [];
  // A truss roof with a frame ridge beam would leave the ridge chain free to spin about its own
  // axis (nothing but pin-ended bars meets it): a real mechanism. The ridge line follows the roof.
  const roofAsTruss = r.chance(0.5);
  for (let i = 0; i <= nb; i++) {
    baseA.push(modelStore.addNode(i * s, 0, 0)); baseB.push(modelStore.addNode(i * s, w, 0));
    topA.push(modelStore.addNode(i * s, 0, h)); topB.push(modelStore.addNode(i * s, w, h));
    ridge.push(modelStore.addNode(i * s, w / 2, h + rise));
    frames.push(frame(baseA[i], topA[i], P.ipn), frame(baseB[i], topB[i], P.ipn));
    if (roofAsTruss) { truss(topA[i], ridge[i], P.tube); truss(ridge[i], topB[i], P.tube); truss(topA[i], topB[i], P.bar); }
    else { frames.push(frame(topA[i], ridge[i], P.ipn), frame(ridge[i], topB[i], P.ipn)); }
    support(baseA[i], r.pick(['fixed3d', 'pinned3d'] as const)); support(baseB[i], 'fixed3d');
    if (i > 0) {
      frames.push(frame(topA[i - 1], topA[i], P.tube), frame(topB[i - 1], topB[i], P.tube));
      if (roofAsTruss) truss(ridge[i - 1], ridge[i], P.tube); else frames.push(frame(ridge[i - 1], ridge[i], P.tube));
      truss(baseA[i - 1], topA[i], P.bar); truss(baseB[i - 1], topB[i], P.bar);
      // Without a diagonal to it a truss ridge line slides along X (nothing else holds it that way).
      if (roofAsTruss || r.chance(0.5)) truss(topA[i - 1], ridge[i], P.bar);
    }
  }
  // Inclined rafters carry the member loads here (distributed on inclined members).
  // No nodal moment where only pin-ended bars meet: nothing there can carry it (see D7 in the sweep).
  const sc = r.uni(5, 20);
  sprinkleLoads(r, cs, { nodes: [...topA, ...topB], frames, scale: sc, pMember: 0.5 });
  sprinkleLoads(r, cs, { nodes: ridge, frames: [], scale: sc, moments: !roofAsTruss });
  return cs;
};

/** Pitched portal frames in 3D (nave): inclined rafters, loads in all directions. */
const pitchedNave: Builder = (r, seed, P) => {
  const cs: ModelCase = { family: 'pitched-nave', seed, loadedFrames: [] };
  const nb = r.int(1, 4), s = r.uni(4, 6), w = r.uni(8, 16), h = r.uni(4, 7), rise = r.uni(1, 3);
  const frames: number[] = [];
  const A: number[] = [], B: number[] = [], R: number[] = [];
  for (let i = 0; i <= nb; i++) {
    const a0 = modelStore.addNode(i * s, 0, 0), b0 = modelStore.addNode(i * s, w, 0);
    A.push(modelStore.addNode(i * s, 0, h)); B.push(modelStore.addNode(i * s, w, h));
    R.push(modelStore.addNode(i * s, w / 2, h + rise));
    frames.push(frame(a0, A[i], P.ipn), frame(b0, B[i], P.ipn), frame(A[i], R[i], P.ipn), frame(R[i], B[i], P.ipn));
    support(a0, 'fixed3d'); support(b0, r.pick(['fixed3d', 'pinned3d'] as const));
    if (i > 0) frames.push(frame(A[i - 1], A[i], P.tube), frame(B[i - 1], B[i], P.tube), frame(R[i - 1], R[i], P.tube));
  }
  for (const e of frames) if (r.chance(0.3)) randomRoll(r, e);
  sprinkleLoads(r, cs, { nodes: [...A, ...B, ...R], frames, scale: r.uni(3, 15), pMember: 0.6 });
  return cs;
};

export const FAMILIES: Record<string, Builder> = {
  'space-frame': spaceFrame,
  'skew-frame': skewFrame,
  grillage,
  'space-truss': spaceTruss,
  tower,
  'cantilever-torsion': cantileverTorsion,
  'hinged-frame': hingedFrame,
  'spring-frame': springFrame,
  'mixed-frame-truss': mixedFrameTruss,
  'pitched-nave': pitchedNave,
};

export function buildRandom(family: string, seed: number): ModelCase {
  resetModel3D();
  const r = new Rng(seed * 7919 + family.length * 104729);
  let cs!: ModelCase;
  modelStore.bulkMutate(() => {
    const P = addPalette();
    cs = FAMILIES[family](r, seed, P);
  });
  return cs;
}

// ─── Physics helpers ─────────────────────────────────────────────

export interface Wrench { f: [number, number, number]; m: [number, number, number] }

const cross = (a: number[], b: number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function addForceAt(w: Wrench, p: number[], f: number[]): void {
  w.f[0] += f[0]; w.f[1] += f[1]; w.f[2] += f[2];
  const m = cross(p, f);
  w.m[0] += m[0]; w.m[1] += m[1]; w.m[2] += m[2];
}

/** Resultant of the solver input's loads about the global origin (from the wire the engine gets). */
export function appliedWrench(input: SolverInput3D): Wrench {
  const w: Wrench = { f: [0, 0, 0], m: [0, 0, 0] };
  const axesOf = (elemId: number) => {
    const e = input.elements.get(elemId)!;
    const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
    const ly = e.localYx !== undefined ? { x: e.localYx!, y: e.localYy!, z: e.localYz! } : undefined;
    return { a, b, ax: computeLocalAxes3D(a, b, ly, e.rollAngle, false) };
  };
  for (const l of input.loads) {
    if (l.type === 'nodal') {
      const d = l.data; const n = input.nodes.get(d.nodeId)!;
      addForceAt(w, [n.x, n.y, n.z], [d.fx, d.fy, d.fz]);
      w.m[0] += d.mx; w.m[1] += d.my; w.m[2] += d.mz;
    } else if (l.type === 'distributed') {
      const d = l.data; const { a, ax } = axesOf(d.elementId);
      const x0 = d.a ?? 0, x1 = d.b ?? ax.L;
      const span = x1 - x0;
      if (span <= 0) continue;
      // 2-point Gauss: exact for (linear load) × (linear position).
      for (const g of [-1 / Math.sqrt(3), 1 / Math.sqrt(3)]) {
        const s = (g + 1) / 2, x = x0 + s * span;
        const qy = d.qYI + (d.qYJ - d.qYI) * s, qz = d.qZI + (d.qZJ - d.qZI) * s;
        const f = [0, 1, 2].map((k) => (qy * ax.ey[k] + qz * ax.ez[k]) * span / 2);
        addForceAt(w, [a.x + ax.ex[0] * x, a.y + ax.ex[1] * x, a.z + ax.ex[2] * x], f);
      }
    } else if (l.type === 'pointOnElement') {
      const d = l.data; const { a, ax } = axesOf(d.elementId);
      const f = [0, 1, 2].map((k) => d.py * ax.ey[k] + d.pz * ax.ez[k]);
      addForceAt(w, [a.x + ax.ex[0] * d.a, a.y + ax.ex[1] * d.a, a.z + ax.ex[2] * d.a], f);
    }
  }
  return w;
}

export function reactionWrench(input: SolverInput3D, res: AnalysisResults3D): Wrench {
  const w: Wrench = { f: [0, 0, 0], m: [0, 0, 0] };
  for (const rc of res.reactions) {
    const n = input.nodes.get(rc.nodeId);
    if (!n) continue;
    addForceAt(w, [n.x, n.y, n.z], [rc.fx, rc.fy, rc.fz]);
    w.m[0] += rc.mx; w.m[1] += rc.my; w.m[2] += rc.mz;
  }
  return w;
}

/** Largest residual of ΣR + ΣF relative to the load scale (forces and moments separately). */
export function equilibriumError(input: SolverInput3D, res: AnalysisResults3D): { force: number; moment: number } {
  const A = appliedWrench(input), R = reactionWrench(input, res);
  let Fs = 0, Ms = 0, Lmax = 1;
  for (const n of input.nodes.values()) Lmax = Math.max(Lmax, Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
  for (const l of input.loads) {
    if (l.type === 'nodal') { Fs += Math.hypot(l.data.fx, l.data.fy, l.data.fz); Ms += Math.hypot(l.data.mx, l.data.my, l.data.mz); }
    else if (l.type === 'distributed') { const L = 10; Fs += (Math.abs(l.data.qYI) + Math.abs(l.data.qYJ) + Math.abs(l.data.qZI) + Math.abs(l.data.qZJ)) * L; }
    else if (l.type === 'pointOnElement') Fs += Math.hypot(l.data.py, l.data.pz);
  }
  Fs = Math.max(Fs, 1e-9);
  const fe = Math.max(...[0, 1, 2].map((k) => Math.abs(A.f[k] + R.f[k])));
  const me = Math.max(...[0, 1, 2].map((k) => Math.abs(A.m[k] + R.m[k])));
  return { force: fe / Fs, moment: me / (Ms + Fs * Lmax) };
}

export function allFinite(x: unknown, depth = 0): boolean {
  if (depth > 6) return true;
  if (typeof x === 'number') return Number.isFinite(x);
  if (Array.isArray(x)) return x.every((v) => allFinite(v, depth + 1));
  if (x && typeof x === 'object') return Object.values(x).every((v) => allFinite(v, depth + 1));
  return true;
}

/** A refusal a user can read: not a panic, not a JS internals message. */
export function isClearMessage(msg: string): boolean {
  if (!msg || msg.trim().length < 8) return false;
  return !/unreachable|panicked|RuntimeError|is not a function|Cannot read prop|undefined|NaN|\[object Object\]/i.test(msg);
}

export function errMsg(e: unknown): string {
  if (typeof e === 'string') return e;
  return String((e as Error)?.message ?? e);
}
