/**
 * The matrix method written with a compatibility matrix, p = A q,
 * K = Aᵀ k A, for plane trusses and frames alike.
 */
import type { MethodContext } from './registry';
import type { Applicability, Block, Cell, CompareRow, Step, StepDoc, Tex } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import type { PlaneModel, PMember } from './plane-model';
import { hasSpecialSupports, hasThermal, loadsOn, membersAt, nodalLoadAt } from './plane-model';
import { sketchOf } from './sketch';
import { fixedEnd, fixedEndBlocks } from './fem';
import type { Known } from './truss-common';
import {
  EPS, KN, KNM, MM, P, nodeName, memberKey, nTex,
  rTex, pinEnded, reactionComps, forceScale, solveDense, snapper, structureSketch, freeBodySketch,
  axialSketch, memberForceTable, reactionTable, refuse, sizeOf,
} from './truss-common';

// ─── The compatibility-matrix method ─────────────────────────────────

const MAX_DOFS = 40;

type DofKind = 'ux' | 'uz' | 'ry';
interface Dof { node: number; kind: DofKind }
type MKind = 'frame' | 'hingeI' | 'hingeJ' | 'truss';
interface Coord { member: number; local: 1 | 2 | 3 }

interface FixedEndActs { Mi: number; Mj: number; Vi: number; Vj: number; Ni: number; Nj: number; loaded: boolean }

interface Compat {
  dofs: Dof[];
  dofIndex: Map<string, number>;
  coords: Coord[];
  byMember: Map<number, number[]>;
  kinds: Map<number, MKind>;
  kBlock: Map<number, number[][]>;
  A: number[][]; k: number[][]; K: number[][];
  Qj: number[]; Qe: number[]; Q: number[];
  q: number[]; p: number[]; P0: number[]; P: number[];
  fe: Map<number, FixedEndActs>;
  /** End actions on each member (local): N tension positive at each end, V along +y, M counter-clockwise. */
  ends: Map<number, { Ni: number; Nj: number; Vi: number; Vj: number; Mi: number; Mj: number }>;
  reactions: Map<number, { rx: number; rz: number; my: number }>;
  residual: number;
}

const memberKind = (m: PMember): MKind => (pinEnded(m) ? 'truss' : m.hingeI ? 'hingeI' : m.hingeJ ? 'hingeJ' : 'frame');
const localsOf = (k: MKind): Array<1 | 2 | 3> => (k === 'frame' ? [1, 2, 3] : k === 'hingeI' ? [2, 3] : k === 'hingeJ' ? [1, 3] : [3]);
const rigidAt = (m: PMember, node: number) => !pinEnded(m) && ((m.i === node && !m.hingeI) || (m.j === node && !m.hingeJ));

/** The uncoupled stiffness of a member in its own coordinates (a hinged end condensed out: 3EI/L). */
function memberK(m: PMember, kind: MKind): number[][] {
  const a = m.EA / m.L, b4 = (4 * m.EI) / m.L, b2 = (2 * m.EI) / m.L, b3 = (3 * m.EI) / m.L;
  if (kind === 'frame') return [[b4, b2, 0], [b2, b4, 0], [0, 0, a]];
  if (kind === 'truss') return [[a]];
  return [[b3, 0], [0, a]];
}

/** A's entry: element coordinate `local` of member m when the global coordinate `d` is 1 and the rest 0. */
function aEntry(m: PMember, local: 1 | 2 | 3, d: Dof): number {
  let dux = 0, duz = 0, thI = 0, thJ = 0;
  const sg = d.node === m.j ? 1 : d.node === m.i ? -1 : 0;
  if (sg === 0) return 0;
  if (d.kind === 'ux') dux = sg;
  else if (d.kind === 'uz') duz = sg;
  else if (d.node === m.i) thI = 1; else thJ = 1;
  const delta = dux * m.c + duz * m.s;
  const psi = (-dux * m.s + duz * m.c) / m.L;
  const v = local === 3 ? delta : local === 1 ? thI - psi : thJ - psi;
  return Math.abs(v) < 1e-14 ? 0 : v;
}

/** The fixed-end actions of a member's span loads, with a hinged end released (as the engine condenses them). */
function fixedEndActs(pm: PlaneModel, m: PMember, kind: MKind): FixedEndActs {
  const loads = loadsOn(pm, m.id).filter((l) => l.kind !== 'thermal');
  if (!loads.length) return { Mi: 0, Mj: 0, Vi: 0, Vj: 0, Ni: 0, Nj: 0, loaded: false };
  const fe = fixedEnd(m, loads, { i: nodeName(pm, m.i), j: nodeName(pm, m.j) });
  let { Mi, Mj, Vi, Vj } = fe;
  let dMi = 0, dMj = 0;
  if (kind === 'truss') { dMi = -Mi; dMj = -Mj; }
  else if (kind === 'hingeI') { dMi = -Mi; dMj = -Mi / 2; }
  else if (kind === 'hingeJ') { dMj = -Mj; dMi = -Mj / 2; }
  Mi += dMi; Mj += dMj; Vi += (dMi + dMj) / m.L; Vj -= (dMi + dMj) / m.L;
  // Axial point loads: a fixed bar takes P·b/L in tension before the load and P·a/L in compression after it.
  let Ni = 0, px = 0;
  for (const l of loads) if (l.kind === 'point' && Math.abs(l.px) > EPS) { Ni += (l.px * (m.L - l.a)) / m.L; px += l.px; }
  return { Mi, Mj, Vi, Vj, Ni, Nj: Ni - px, loaded: true };
}

export function compatSolve(pm: PlaneModel): Compat | null {
  const dofs: Dof[] = [];
  const members = pm.memberOrder.map((id) => pm.members.get(id)!);
  for (const id of pm.nodeOrder) {
    const s = pm.supports.get(id);
    const at = membersAt(pm, id);
    if (at.length === 0) continue;
    if (!s?.ux) dofs.push({ node: id, kind: 'ux' });
    if (!s?.uz) dofs.push({ node: id, kind: 'uz' });
    if (!s?.ry && at.some((m) => rigidAt(m, id))) dofs.push({ node: id, kind: 'ry' });
  }
  const dofIndex = new Map(dofs.map((d, k) => [`${d.node}:${d.kind}`, k]));
  const coords: Coord[] = [];
  const byMember = new Map<number, number[]>();
  const kinds = new Map<number, MKind>();
  const kBlock = new Map<number, number[][]>();
  for (const m of members) {
    const kind = memberKind(m);
    kinds.set(m.id, kind);
    const idx: number[] = [];
    for (const l of localsOf(kind)) { idx.push(coords.length); coords.push({ member: m.id, local: l }); }
    byMember.set(m.id, idx);
    kBlock.set(m.id, memberK(m, kind));
  }
  const M = coords.length, n = dofs.length;
  const A = coords.map((c) => dofs.map((d) => aEntry(pm.members.get(c.member)!, c.local, d)));
  const k = coords.map(() => new Array(M).fill(0));
  for (const m of members) {
    const idx = byMember.get(m.id)!, kb = kBlock.get(m.id)!;
    idx.forEach((r, a) => idx.forEach((c, b) => { k[r][c] = kb[a][b]; }));
  }
  // K = Aᵀ k A
  const kA = k.map((row) => dofs.map((_, j) => row.reduce((s, v, r) => s + v * A[r][j], 0)));
  const K = dofs.map((_, i) => dofs.map((_, j) => A.reduce((s, row, r) => s + row[i] * kA[r][j], 0)));

  const Qj = dofs.map((d) => { const l = nodalLoadAt(pm, d.node); return d.kind === 'ux' ? l.fx : d.kind === 'uz' ? l.fz : l.my; });
  const Qe = new Array(n).fill(0);
  const fe = new Map<number, FixedEndActs>();
  for (const m of members) {
    const f = fixedEndActs(pm, m, kinds.get(m.id)!);
    fe.set(m.id, f);
    if (!f.loaded) continue;
    // The fixed ends hold the member with these forces; the joints take them reversed.
    const gi = { x: -f.Ni * m.c - f.Vi * m.s, z: -f.Ni * m.s + f.Vi * m.c, m: f.Mi };
    const gj = { x: f.Nj * m.c - f.Vj * m.s, z: f.Nj * m.s + f.Vj * m.c, m: f.Mj };
    for (const [node, g] of [[m.i, gi], [m.j, gj]] as const) {
      const ix = dofIndex.get(`${node}:ux`), iz = dofIndex.get(`${node}:uz`), ir = dofIndex.get(`${node}:ry`);
      if (ix !== undefined) Qe[ix] -= g.x;
      if (iz !== undefined) Qe[iz] -= g.z;
      if (ir !== undefined && rigidAt(m, node)) Qe[ir] -= g.m;
    }
  }
  const Q = Qj.map((v, i) => v + Qe[i]);
  const q = n ? solveDense(K, Q) : [];
  if (!q) return null;
  const p = A.map((row) => row.reduce((s, v, j) => s + v * q[j], 0));
  const P0 = coords.map((c) => { const f = fe.get(c.member)!; return c.local === 1 ? f.Mi : c.local === 2 ? f.Mj : f.Ni; });
  const P = coords.map((_, r) => k[r].reduce((s, v, c) => s + v * p[c], 0) + P0[r]);

  const ends = new Map<number, { Ni: number; Nj: number; Vi: number; Vj: number; Mi: number; Mj: number }>();
  const nodeForce = new Map<number, { x: number; z: number; m: number }>();
  const add = (node: number, x: number, z: number, mm: number) => { const o = nodeForce.get(node) ?? { x: 0, z: 0, m: 0 }; o.x += x; o.z += z; o.m += mm; nodeForce.set(node, o); };
  for (const m of members) {
    const idx = byMember.get(m.id)!, cs = idx.map((r) => coords[r].local);
    const val = (l: 1 | 2 | 3) => { const at = cs.indexOf(l); return at >= 0 ? P[idx[at]] : 0; };
    const f = fe.get(m.id)!;
    const Mi = val(1), Mj = val(2), Ni = val(3), Nj = Ni - (f.Ni - f.Nj);
    // The span load's simple-beam reactions plus the shear that balances the end moments.
    const Vsi = f.Vi - (f.Mi + f.Mj) / m.L, Vsj = f.Vj + (f.Mi + f.Mj) / m.L;
    const Vi = Vsi + (Mi + Mj) / m.L, Vj = Vsj - (Mi + Mj) / m.L;
    ends.set(m.id, { Ni, Nj, Vi, Vj, Mi, Mj });
    add(m.i, -Ni * m.c - Vi * m.s, -Ni * m.s + Vi * m.c, Mi);
    add(m.j, Nj * m.c - Vj * m.s, Nj * m.s + Vj * m.c, Mj);
  }
  const reactions = new Map<number, { rx: number; rz: number; my: number }>();
  let residual = 0;
  for (const id of pm.nodeOrder) {
    const f = nodeForce.get(id) ?? { x: 0, z: 0, m: 0 };
    const l = nodalLoadAt(pm, id);
    const s = pm.supports.get(id);
    const r = { rx: f.x - l.fx, rz: f.z - l.fz, my: f.m - l.my };
    const hasRy = dofIndex.has(`${id}:ry`) || !!s?.ry;
    if (s) reactions.set(id, { rx: s.ux ? r.rx : 0, rz: s.uz ? r.rz : 0, my: s.ry ? r.my : 0 });
    if (!s?.ux) residual = Math.max(residual, Math.abs(r.rx));
    if (!s?.uz) residual = Math.max(residual, Math.abs(r.rz));
    if (!s?.ry && hasRy) residual = Math.max(residual, Math.abs(r.my));
  }
  return { dofs, dofIndex, coords, byMember, kinds, kBlock, A, k, K, Qj, Qe, Q, q, p, P0, P, fe, ends, reactions, residual };
}

export function compatApplies(ctx: MethodContext): Applicability {
  const { pm, input } = ctx;
  if (pm.members.size === 0) return refuse('steps.req.noMembers');
  if ((input.constraints?.length ?? 0) > 0 || (input.connectors?.size ?? 0) > 0) return refuse(`${P}req.constraints`);
  if (hasSpecialSupports(pm)) return refuse('steps.req.special');
  if (hasThermal(pm)) return refuse('steps.req.thermal');
  for (const s of pm.supports.values()) {
    if (!['fixed', 'pinned', 'rollerX', 'rollerZ'].includes(s.type)) return refuse(`${P}req.supportTypeCompat`, { n: nodeName(pm, s.node) });
  }
  for (const l of pm.memberLoads) {
    const m = pm.members.get(l.member);
    if (m?.truss) return refuse(`${P}req.trussSpanLoad`, { m: m.name });
  }
  for (const id of pm.nodeOrder) {
    const at = membersAt(pm, id);
    if (at.length === 0) return refuse(`${P}req.looseNode`, { n: nodeName(pm, id) });
    if (Math.abs(nodalLoadAt(pm, id).my) > EPS && !at.some((m) => rigidAt(m, id)) && !pm.supports.get(id)?.ry) return refuse(`${P}req.momentAtPin`, { n: nodeName(pm, id) });
  }
  if (!ctx.ref) return refuse('steps.req.unstable');
  let n = 0;
  for (const id of pm.nodeOrder) {
    const s = pm.supports.get(id);
    if (!s?.ux) n++;
    if (!s?.uz) n++;
    if (!s?.ry && membersAt(pm, id).some((m) => rigidAt(m, id))) n++;
  }
  if (n > MAX_DOFS) return refuse(`${P}req.tooManyDofs`, { n, max: MAX_DOFS });
  if (!compatSolve(pm)) return refuse('steps.req.unstable');
  return { ok: true };
}

const dofTex = (pm: PlaneModel, d: Dof) => (d.kind === 'ry' ? `\\theta_{\\mathrm{${nodeName(pm, d.node)}}}` : `u_{${d.kind === 'ux' ? 'x' : 'z'},\\mathrm{${nodeName(pm, d.node)}}}`);
const dofWord = (d: Dof) => tx(`${P}compat.dir.${d.kind}`);
const coordMeaning = (pm: PlaneModel, m: PMember, l: 1 | 2 | 3): Tex => {
  const a = nodeName(pm, m.i), b = nodeName(pm, m.j);
  return l === 3 ? `\\delta_{\\mathrm{${a}${b}}}` : l === 1 ? `\\theta_{\\mathrm{${a}}} - \\psi_{\\mathrm{${a}${b}}}` : `\\theta_{\\mathrm{${b}}} - \\psi_{\\mathrm{${a}${b}}}`;
};
const forceMeaning = (pm: PlaneModel, m: PMember, l: 1 | 2 | 3): Tex => {
  const a = nodeName(pm, m.i), b = nodeName(pm, m.j);
  return l === 3 ? `N_{\\mathrm{${a}${b}}}` : l === 1 ? `M_{\\mathrm{${a}${b}}}` : `M_{\\mathrm{${b}${a}}}`;
};

/** A member's displaced shape: axial motion linear, transverse by the Hermite cubic from end displacements and rotations. */
function memberShape(pm: PlaneModel, m: PMember, kind: MKind, u: (node: number) => { x: number; z: number; r: number }, n = 12): Array<{ x: number; z: number }> {
  const a = pm.nodes.get(m.i)!, b = pm.nodes.get(m.j)!;
  const ua = u(m.i), ub = u(m.j);
  const vI = -ua.x * m.s + ua.z * m.c, vJ = -ub.x * m.s + ub.z * m.c;
  const wI = ua.x * m.c + ua.z * m.s, wJ = ub.x * m.c + ub.z * m.s;
  const psi = (vJ - vI) / m.L;
  let tI = ua.r, tJ = ub.r;
  if (kind === 'truss') { tI = psi; tJ = psi; }
  else if (kind === 'hingeI') tI = psi - (tJ - psi) / 2;
  else if (kind === 'hingeJ') tJ = psi - (tI - psi) / 2;
  const pts: Array<{ x: number; z: number }> = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, L = m.L;
    const h1 = 1 - 3 * t * t + 2 * t ** 3, h2 = L * (t - 2 * t * t + t ** 3), h3 = 3 * t * t - 2 * t ** 3, h4 = L * (-t * t + t ** 3);
    const v = h1 * vI + h2 * tI + h3 * vJ + h4 * tJ;
    const w = wI + (wJ - wI) * t;
    const x0 = a.x + (b.x - a.x) * t, z0 = a.z + (b.z - a.z) * t;
    pts.push({ x: x0 + w * m.c - v * m.s, z: z0 + w * m.s + v * m.c });
  }
  return pts;
}

/** Bending moment along a member (sagging positive), from its end actions and span loads. */
export function momentAlong(pm: PlaneModel, m: PMember, e: { Vi: number; Mi: number }, t: number): number {
  const x = t * m.L;
  let M = -e.Mi + e.Vi * x;
  for (const l of loadsOn(pm, m.id)) {
    if (l.kind === 'dist') {
      const hi = Math.min(x, l.b);
      if (hi <= l.a) continue;
      const q = (s: number) => (l.b > l.a ? l.qa + ((l.qb - l.qa) * (s - l.a)) / (l.b - l.a) : 0);
      // ∫ q(s)(x − s) ds over [a, min(x, b)]: a cubic, Simpson is exact.
      const mid = (l.a + hi) / 2;
      M += ((hi - l.a) / 6) * (q(l.a) * (x - l.a) + 4 * q(mid) * (x - mid) + q(hi) * (x - hi));
    } else if (l.kind === 'point' && l.a < x) {
      M += l.p * (x - l.a) - l.m;
    }
  }
  return M;
}

/** K₁₁ written out: the products A·k·A that are not zero (the first six). */
function k11Terms(cm: Compat): Tex {
  const nz = cm.coords.map((_, r) => r).filter((r) => Math.abs(cm.A[r][0]) > 1e-14);
  const parts: string[] = [];
  for (const r of nz) for (const s of nz) {
    const k = cm.k[r][s];
    if (Math.abs(k) < 1e-12) continue;
    parts.push(r === s ? `${par(cm.A[r][0])}^2 \\cdot ${num(k)}` : `${par(cm.A[r][0])} \\cdot ${num(k)} \\cdot ${par(cm.A[s][0])}`);
  }
  return parts.length > 6 ? `${parts.slice(0, 6).join(' + ')} + \\dots` : parts.join(' + ') || '0';
}

export function buildCompat(ctx: MethodContext): StepDoc {
  const { pm, ref } = ctx;
  const cm = compatSolve(pm)!;
  const S = Math.max(1, ...cm.Q.map(Math.abs), forceScale(pm));
  const snap = snapper(S);
  const members = pm.memberOrder.map((id) => pm.members.get(id)!);
  const hasFrame = members.some((m) => cm.kinds.get(m.id) !== 'truss');
  const n = cm.dofs.length, M = cm.coords.length;
  const qLab = cm.dofs.map((_, k) => `q${k + 1}`);
  const pLab = cm.coords.map((_, k) => `p${k + 1}`);

  const intro: Block[] = [
    { kind: 'p', text: tx(`${P}compat.intro`) },
    { kind: 'eq', tex: '\\mathbf p = \\mathbf A\\,\\mathbf q, \\qquad \\mathbf P = \\mathbf k\\,\\mathbf p + \\mathbf P^0, \\qquad \\mathbf K = \\mathbf A^{\\mathsf T}\\mathbf k\\,\\mathbf A, \\qquad \\mathbf K\\,\\mathbf q = \\mathbf Q', note: tx(`${P}compat.equations`) },
    { kind: 'p', text: tx(`${P}compat.signs`), detail: true },
    { kind: 'fig', sketch: structureSketch(pm), caption: tx('steps.common.structureCaption') },
    { kind: 'p', text: tx('steps.common.units') },
  ];
  if (members.some((m) => m.hingeI || m.hingeJ)) intro.push({ kind: 'note', tone: 'info', text: tx(`${P}compat.hinges`) });
  const steps: Step[] = [];

  // 1. Global coordinates.
  const dofSketch = sketchOf(pm);
  dofSketch.dofs = cm.dofs.map((d, k) => ({ node: d.node, kind: d.kind, label: String(k + 1) }));
  steps.push({
    title: tx(`${P}compat.qTitle`),
    blocks: [
      { kind: 'p', text: tx(`${P}compat.qLead`, { n }) },
      { kind: 'p', text: tx(hasFrame ? `${P}compat.qWhyFrame` : `${P}compat.qWhyTruss`), detail: true },
      { kind: 'fig', sketch: dofSketch, caption: tx(`${P}compat.qCaption`) },
      { kind: 'table', head: [{ tex: 'q_i' }, tx('steps.common.node'), tx(`${P}compat.direction`)], rows: cm.dofs.map((d, k) => [{ tex: `q_{${k + 1}}` }, nodeName(pm, d.node), dofWord(d)]), caption: tx(`${P}compat.qTable`) },
    ],
  });

  // 2. Element coordinates.
  const pRows: Cell[][] = members.map((m) => {
    const idx = cm.byMember.get(m.id)!;
    return [m.name, tx(`${P}compat.kind.${cm.kinds.get(m.id)}`), { tex: num(m.L) }, { tex: num(m.c) }, { tex: num(m.s) },
      { tex: idx.map((r) => `p_{${r + 1}} = ${coordMeaning(pm, m, cm.coords[r].local)}`).join(',\\ ') }];
  });
  const pSketch = sketchOf(pm);
  pSketch.members = pSketch.members.map((mm) => ({ ...mm, label: cm.byMember.get(mm.id)!.map((r) => `p${r + 1}`).join(',') }));
  steps.push({
    title: tx(`${P}compat.pTitle`),
    blocks: [
      { kind: 'p', text: tx(hasFrame ? `${P}compat.pLeadFrame` : `${P}compat.pLeadTruss`, { m: M }) },
      { kind: 'eq', tex: '\\delta = (\\mathbf u_J - \\mathbf u_I)\\cdot\\hat{\\mathbf e} = \\Delta u_x\\cos\\alpha + \\Delta u_z\\sin\\alpha' + (hasFrame ? ', \\qquad \\psi = \\frac{-\\Delta u_x\\sin\\alpha + \\Delta u_z\\cos\\alpha}{L}' : ''), note: tx(hasFrame ? `${P}compat.pDefFrame` : `${P}compat.pDefTruss`) },
      { kind: 'fig', sketch: pSketch, caption: tx(`${P}compat.pCaption`) },
      { kind: 'table', head: [tx('steps.common.member'), tx(`${P}compat.type`), { tex: 'L\\ [\\mathrm m]' }, { tex: '\\cos\\alpha' }, { tex: '\\sin\\alpha' }, tx(`${P}compat.coords`)], rows: pRows, caption: tx(`${P}compat.pTable`) },
    ],
  });

  // 3. Uncoupled stiffness.
  const kBlocks: Block[] = [{ kind: 'p', text: tx(`${P}compat.kLead`) }];
  for (const m of members) {
    const kind = cm.kinds.get(m.id)!;
    const sub: Block[] = [];
    sub.push({ kind: 'calc', label: tx(`${P}compat.kAxial`), formula: 'k_a = \\frac{EA}{L}', subst: `k_a = \\frac{${num(m.E)} \\cdot ${num(m.A)}}{${num(m.L)}}`, result: `\\boxed{k_a = ${num(m.EA / m.L)}\\ \\mathrm{kN/m}}` });
    if (kind === 'frame') {
      sub.push({ kind: 'calc', label: tx(`${P}compat.kBend`), formula: '\\frac{4EI}{L}, \\qquad \\frac{2EI}{L}', subst: `\\frac{4 \\cdot ${num(m.EI)}}{${num(m.L)}}, \\qquad \\frac{2 \\cdot ${num(m.EI)}}{${num(m.L)}}`, result: `\\boxed{${num((4 * m.EI) / m.L)}}, \\quad \\boxed{${num((2 * m.EI) / m.L)}\\ \\mathrm{kN\\,m}}` });
    } else if (kind !== 'truss') {
      sub.push({ kind: 'calc', label: tx(`${P}compat.kBendHinge`), formula: '\\frac{3EI}{L}', subst: `\\frac{3 \\cdot ${num(m.EI)}}{${num(m.L)}}`, result: `\\boxed{${num((3 * m.EI) / m.L)}\\ \\mathrm{kN\\,m}}` });
      sub.push({ kind: 'p', text: tx(`${P}compat.condensed`, { n: nodeName(pm, kind === 'hingeI' ? m.i : m.j) }), detail: true });
    }
    const idx = cm.byMember.get(m.id)!;
    if (idx.length > 1) sub.push({ kind: 'matrix', name: `\\mathbf k_{\\mathrm{${memberKey(pm, m)}}}`, rows: cm.kBlock.get(m.id)!, rowLabels: idx.map((r) => pLab[r]), colLabels: idx.map((r) => pLab[r]) });
    kBlocks.push({ kind: 'sub', title: tx(`${P}compat.memberTitle`, { m: m.name }), blocks: sub });
  }
  kBlocks.push({ kind: 'p', text: tx(`${P}compat.kAssembly`), detail: true });
  if (M <= 12) kBlocks.push({ kind: 'matrix', name: '\\mathbf k', rows: cm.k, rowLabels: pLab, colLabels: pLab, caption: tx(`${P}compat.kCaption`) });
  else if (!hasFrame) kBlocks.push({ kind: 'table', head: [{ tex: 'p_i' }, tx('steps.common.member'), { tex: 'k_{ii}\\ [\\mathrm{kN/m}]' }], rows: cm.coords.map((c, r) => [{ tex: `p_{${r + 1}}` }, pm.members.get(c.member)!.name, { tex: num(cm.k[r][r]) }]), caption: tx(`${P}compat.kDiagonal`, { m: M }) });
  else kBlocks.push({ kind: 'p', text: tx(`${P}compat.kStructure`, { m: M }) });
  steps.push({ title: tx(`${P}compat.kTitle`), blocks: kBlocks });

  // 4. The compatibility matrix, column by column.
  const aBlocks: Block[] = [{ kind: 'p', text: tx(`${P}compat.aLead`) }, { kind: 'p', text: tx(`${P}compat.aWhy`), detail: true }];
  const size = sizeOf(pm);
  const shown = Math.min(6, n);
  for (let j = 0; j < shown; j++) {
    const d = cm.dofs[j];
    // A unit movement drawn at a visible size: a tenth of the structure, or half a radian.
    const unitScale = d.kind === 'ry' ? 0.5 : 0.12 * size;
    const uAt = (node: number) => (node === d.node ? { x: d.kind === 'ux' ? unitScale : 0, z: d.kind === 'uz' ? unitScale : 0, r: d.kind === 'ry' ? unitScale : 0 } : { x: 0, z: 0, r: 0 });
    const affected = members.filter((m) => m.i === d.node || m.j === d.node);
    const sk = sketchOf(pm);
    const aff = new Set(affected.map((m) => m.id));
    sk.members = sk.members.map((mm) => ({ ...mm, style: aff.has(mm.id) ? 'solid' as const : 'faint' as const }));
    sk.deformed = affected.map((m) => ({ points: memberShape(pm, m, cm.kinds.get(m.id)!, uAt) }));
    sk.dofs = [{ node: d.node, kind: d.kind, label: `q${j + 1} = 1` }];
    const sub: Block[] = [{ kind: 'fig', sketch: sk, caption: tx(`${P}compat.unitCaption`, { j: j + 1 }) }];
    for (const m of affected) {
      for (const r of cm.byMember.get(m.id)!) {
        const c = cm.coords[r];
        const v = cm.A[r][j];
        // A zero elongation shows the projection at work; a zero end rotation only adds noise.
        if (c.local !== 3 && v === 0) continue;
        const a = nodeName(pm, m.i), b = nodeName(pm, m.j);
        let dux = 0, duz = 0;
        const sg = d.node === m.j ? 1 : -1;
        if (d.kind === 'ux') dux = sg; else if (d.kind === 'uz') duz = sg;
        if (c.local === 3) {
          if (d.kind === 'ry') continue;
          sub.push({ kind: 'calc', label: tx(`${P}compat.elong`, { m: m.name, p: r + 1 }), formula: `p_{${r + 1}} = \\delta_{\\mathrm{${a}${b}}} = \\Delta u_x\\cos\\alpha + \\Delta u_z\\sin\\alpha`, subst: `(${dux})(${num(m.c)}) + (${duz})(${num(m.s)})`, result: `\\boxed{A_{${r + 1},${j + 1}} = ${num(v)}}` });
        } else {
          const th = d.kind === 'ry' && ((c.local === 1 && d.node === m.i) || (c.local === 2 && d.node === m.j)) ? 1 : 0;
          const end = c.local === 1 ? a : b;
          sub.push({ kind: 'calc', label: tx(`${P}compat.rot`, { m: m.name, p: r + 1 }), formula: `p_{${r + 1}} = \\theta_{\\mathrm{${end}}} - \\psi, \\quad \\psi = \\frac{-\\Delta u_x\\sin\\alpha + \\Delta u_z\\cos\\alpha}{L}`, subst: `${th} - \\frac{-(${dux})(${num(m.s)}) + (${duz})(${num(m.c)})}{${num(m.L)}}`, result: `\\boxed{A_{${r + 1},${j + 1}} = ${num(v)}}` });
        }
      }
    }
    const nz = cm.coords.map((_, r) => r).filter((r) => Math.abs(cm.A[r][j]) > 1e-14);
    sub.push({ kind: 'matrix', name: `\\mathbf A_{\\bullet ${j + 1}}`, rows: nz.map((r) => [cm.A[r][j]]), rowLabels: nz.map((r) => pLab[r]), colLabels: [qLab[j]], caption: tx(`${P}compat.columnCaption`, { j: j + 1 }) });
    aBlocks.push({ kind: 'sub', title: tx(`${P}compat.unitTitle`, { j: j + 1, n: nodeName(pm, d.node) }), blocks: [{ kind: 'p', text: tx(`${P}compat.unitLead`, { j: j + 1, n: nodeName(pm, d.node) }) }, ...sub] });
  }
  if (n > shown) aBlocks.push({ kind: 'p', text: tx(n === shown + 1 ? `${P}compat.aRestOne` : `${P}compat.aRest`, { k: shown + 1, n }) });
  if (n <= 15) aBlocks.push({ kind: 'matrix', name: '\\mathbf A', rows: cm.A, rowLabels: pLab, colLabels: qLab, caption: tx(`${P}compat.aCaption`, { m: M, n }) });
  else aBlocks.push({ kind: 'p', text: tx(`${P}compat.aSize`, { m: M, n }) });
  steps.push({ title: tx(`${P}compat.aTitle`), blocks: aBlocks });

  // 5. K = Aᵀ k A.
  const Kb: Block[] = [
    { kind: 'eq', tex: '\\mathbf K = \\mathbf A^{\\mathsf T}\\,\\mathbf k\\,\\mathbf A', note: tx(`${P}compat.KLead`) },
    { kind: 'p', text: tx(`${P}compat.KWhy`), detail: true },
  ];
  if (n > 0) Kb.push({ kind: 'calc', label: tx(`${P}compat.KEntry`), formula: 'K_{ij} = \\sum_{r,s} A_{ri}\\,k_{rs}\\,A_{sj}', subst: `K_{11} = ${k11Terms(cm)}`, result: `\\boxed{K_{11} = ${num(cm.K[0][0])}}` });
  if (n <= 14) Kb.push({ kind: 'matrix', name: '\\mathbf K', rows: cm.K, rowLabels: qLab, colLabels: qLab, caption: tx(`${P}compat.KCaption`) });
  else Kb.push({ kind: 'p', text: tx(`${P}compat.KSize`, { n }) });
  steps.push({ title: tx(`${P}compat.KTitle`), blocks: Kb });

  // 6. Loads.
  const qBlocks: Block[] = [{ kind: 'p', text: tx(`${P}compat.QLead`) }];
  const loadedMembers = members.filter((m) => cm.fe.get(m.id)!.loaded);
  if (loadedMembers.length) {
    qBlocks.push({ kind: 'p', text: tx(`${P}compat.QSpan`), detail: true });
    for (const m of loadedMembers) {
      const f = cm.fe.get(m.id)!;
      const names = { i: nodeName(pm, m.i), j: nodeName(pm, m.j) };
      const sub: Block[] = [...fixedEndBlocks(fixedEnd(m, loadsOn(pm, m.id).filter((l) => l.kind !== 'thermal'), names), names)];
      const kind = cm.kinds.get(m.id)!;
      if (kind !== 'frame') sub.push({ kind: 'p', text: tx(`${P}compat.feHinge`) });
      if (Math.abs(f.Ni) > EPS || Math.abs(f.Nj) > EPS) sub.push({ kind: 'p', text: tx(`${P}compat.feAxial`, { ni: numText(f.Ni), nj: numText(f.Nj) }) });
      sub.push({ kind: 'table', head: ['', { tex: `M\\ [${KNM}]` }, { tex: `V\\ [${KN}]` }, { tex: `N\\ [${KN}]` }], rows: [[names.i, { tex: num(snap(f.Mi)) }, { tex: num(snap(f.Vi)) }, { tex: num(snap(f.Ni)) }], [names.j, { tex: num(snap(f.Mj)) }, { tex: num(snap(f.Vj)) }, { tex: num(snap(f.Nj)) }]], caption: tx(`${P}compat.feTable`) });
      qBlocks.push({ kind: 'sub', title: tx(`${P}compat.memberTitle`, { m: m.name }), blocks: sub });
    }
  }
  qBlocks.push({ kind: 'table', head: [{ tex: 'q_i' }, tx('steps.common.node'), tx(`${P}compat.direction`), tx(`${P}compat.jointLoad`), tx(`${P}compat.spanLoad`), { tex: 'Q_i' }],
    rows: cm.dofs.map((d, k) => [{ tex: `q_{${k + 1}}` }, nodeName(pm, d.node), dofWord(d), { tex: num(snap(cm.Qj[k])) }, { tex: num(snap(cm.Qe[k])) }, { tex: num(snap(cm.Q[k])) }]), caption: tx(`${P}compat.QTable`) });
  qBlocks.push({ kind: 'matrix', name: '\\mathbf Q', rows: cm.Q.map((v) => [snap(v)]), rowLabels: qLab });
  steps.push({ title: tx(`${P}compat.QTitle`), blocks: qBlocks });

  // 7. Displacements.
  const umax = Math.max(1e-15, ...cm.dofs.map((d, k) => (d.kind === 'ry' ? 0 : Math.abs(cm.q[k]))));
  const mag = (0.08 * size) / umax;
  const disp = (node: number) => {
    const g = (kd: DofKind) => { const i = cm.dofIndex.get(`${node}:${kd}`); return i === undefined ? 0 : cm.q[i]; };
    return { x: g('ux'), z: g('uz'), r: g('ry') };
  };
  const defSk = sketchOf(pm);
  defSk.members = defSk.members.map((mm) => ({ ...mm, style: 'faint' as const }));
  defSk.deformed = members.map((m) => ({ points: memberShape(pm, m, cm.kinds.get(m.id)!, (nd) => { const u = disp(nd); return { x: u.x * mag, z: u.z * mag, r: u.r * mag }; }) }));
  const dispRows: Cell[][] = pm.nodeOrder.filter((id) => membersAt(pm, id).length).map((id) => {
    const u = disp(id);
    const has = (kd: DofKind) => cm.dofIndex.has(`${id}:${kd}`);
    return [nodeName(pm, id), has('ux') ? { tex: num(u.x * 1000) } : '0', has('uz') ? { tex: num(u.z * 1000) } : '0', ...(hasFrame ? [has('ry') ? { tex: num(u.r) } as Cell : '—'] : [])];
  });
  steps.push({
    title: tx(`${P}compat.solveTitle`),
    blocks: [
      { kind: 'eq', tex: '\\mathbf q = \\mathbf K^{-1}\\,\\mathbf Q', note: tx(`${P}compat.solveLead`) },
      { kind: 'matrix', name: '\\mathbf q', rows: cm.q.map((v) => [v]), rowLabels: qLab, caption: tx(`${P}compat.qUnits`) },
      { kind: 'table', head: [tx('steps.common.node'), { tex: `u_x\\ [${MM}]` }, { tex: `u_z\\ [${MM}]` }, ...(hasFrame ? [{ tex: '\\theta\\ [\\mathrm{rad}]' } as Cell] : [])], rows: dispRows, caption: tx(`${P}compat.dispTable`) },
      { kind: 'fig', sketch: defSk, caption: tx(`${P}compat.deformedCaption`, { f: numText(mag, 3) }) },
    ],
  });

  // 8. Element deformations and forces.
  const Pb: Block[] = [
    { kind: 'eq', tex: '\\mathbf p = \\mathbf A\\,\\mathbf q', note: tx(`${P}compat.pqLead`) },
    { kind: 'eq', tex: '\\mathbf P = \\mathbf k\\,\\mathbf p + \\mathbf P^0', note: tx(`${P}compat.PLead`) },
  ];
  const ex = members[0];
  const exR = cm.byMember.get(ex.id)!.at(-1)!;
  Pb.push({ kind: 'calc', label: tx(`${P}compat.PExample`, { m: ex.name }), formula: `P_{${exR + 1}} = k_{${exR + 1}}\\,p_{${exR + 1}} + P^0_{${exR + 1}}`, subst: `P_{${exR + 1}} = ${num(cm.k[exR][exR])} \\cdot ${par(cm.p[exR])} + ${par(snap(cm.P0[exR]))}`, result: `\\boxed{${forceMeaning(pm, ex, 3)} = ${num(snap(cm.P[exR]))}\\ ${KN}}` });
  Pb.push({ kind: 'table', head: [{ tex: 'i' }, tx('steps.common.member'), tx(`${P}compat.meaning`), { tex: 'p_i' }, { tex: 'k\\,p' }, { tex: 'P^0_i' }, { tex: 'P_i' }],
    rows: cm.coords.map((c, r) => {
      const m = pm.members.get(c.member)!;
      const kp = cm.P[r] - cm.P0[r];
      return [{ tex: `${r + 1}` }, m.name, { tex: forceMeaning(pm, m, c.local) }, { tex: num(cm.p[r]) }, { tex: num(snap(kp)) }, { tex: num(snap(cm.P0[r])) }, { tex: num(snap(cm.P[r])) }];
    }), caption: tx(`${P}compat.PTable`) });
  steps.push({ title: tx(`${P}compat.PTitle`), blocks: Pb });

  // 9. End forces, reactions, equilibrium.
  const eb: Block[] = [{ kind: 'p', text: tx(hasFrame ? `${P}compat.endsLeadFrame` : `${P}compat.endsLeadTruss`) }];
  if (hasFrame) {
    eb.push({ kind: 'eq', tex: 'V_{I} = V^{s}_{I} + \\frac{M_{I} + M_{J}}{L}, \\qquad V_{J} = V^{s}_{J} - \\frac{M_{I} + M_{J}}{L}', note: tx(`${P}compat.shearNote`) });
    eb.push({ kind: 'table', head: [tx('steps.common.member'), { tex: `N_I\\ [${KN}]` }, { tex: `V_I\\ [${KN}]` }, { tex: `M_I\\ [${KNM}]` }, { tex: `N_J\\ [${KN}]` }, { tex: `V_J\\ [${KN}]` }, { tex: `M_J\\ [${KNM}]` }],
      rows: members.map((m) => { const e = cm.ends.get(m.id)!; return [m.name, { tex: num(snap(e.Ni)) }, { tex: num(snap(e.Vi)) }, { tex: num(snap(e.Mi)) }, { tex: num(snap(e.Nj)) }, { tex: num(snap(e.Vj)) }, { tex: num(snap(e.Mj)) }]; }), caption: tx(`${P}compat.endsTable`) });
  }
  const comps = reactionComps(pm);
  const known: Known = new Map();
  const moments = new Map<number, number>();
  for (const c of comps) { const r = cm.reactions.get(c.node)!; known.set(c.id, c.dir === 'x' ? r.rx : r.rz); }
  for (const s of pm.supports.values()) if (s.ry) moments.set(s.node, cm.reactions.get(s.node)!.my);
  for (const s of [...pm.supports.values()].sort((a, b) => pm.nodeOrder.indexOf(a.node) - pm.nodeOrder.indexOf(b.node))) {
    const at = membersAt(pm, s.node);
    const nm = nodeName(pm, s.node);
    const l = nodalLoadAt(pm, s.node);
    const r = cm.reactions.get(s.node)!;
    const contrib = (dir: 'x' | 'z') => at.map((m) => {
      const e = cm.ends.get(m.id)!;
      const atI = m.i === s.node;
      const N = atI ? -e.Ni : e.Nj, V = atI ? e.Vi : e.Vj;
      const v = dir === 'x' ? N * m.c - V * m.s : N * m.s + V * m.c;
      return par(snap(v));
    }).join(' + ');
    const sub: Block[] = [];
    if (s.ux) sub.push({ kind: 'calc', label: tx(`${P}eq.sumFx`), formula: `R_{\\mathrm{${nm}}x} = \\sum_k F^{(k)}_x - P_{\\mathrm{${nm}}x}`, subst: `R_{\\mathrm{${nm}}x} = ${contrib('x')} - ${par(snap(l.fx))}`, result: `\\boxed{R_{\\mathrm{${nm}}x} = ${num(snap(r.rx))}\\ ${KN}}` });
    if (s.uz) sub.push({ kind: 'calc', label: tx(`${P}eq.sumFz`), formula: `R_{\\mathrm{${nm}}z} = \\sum_k F^{(k)}_z - P_{\\mathrm{${nm}}z}`, subst: `R_{\\mathrm{${nm}}z} = ${contrib('z')} - ${par(snap(l.fz))}`, result: `\\boxed{R_{\\mathrm{${nm}}z} = ${num(snap(r.rz))}\\ ${KN}}` });
    if (s.ry) sub.push({ kind: 'calc', label: tx(`${P}eq.sumM`), formula: `M_{\\mathrm{${nm}}} = \\sum_k M^{(k)} - M^{P}_{\\mathrm{${nm}}}`, subst: `M_{\\mathrm{${nm}}} = ${at.map((m) => par(snap(m.i === s.node ? cm.ends.get(m.id)!.Mi : cm.ends.get(m.id)!.Mj))).join(' + ')} - ${par(snap(l.my))}`, result: `\\boxed{M_{\\mathrm{${nm}}} = ${num(snap(r.my))}\\ ${KNM}}` });
    eb.push({ kind: 'sub', title: tx(`${P}compat.supportTitle`, { n: nm }), blocks: sub });
  }
  eb.push(reactionTable(pm, comps, known, snap, moments.size ? moments : undefined));
  const rsk = freeBodySketch(pm, comps, known);
  rsk.couples = [...(rsk.couples ?? []), ...[...moments].filter(([, v]) => Math.abs(snap(v)) > 0).map(([node, v]) => { const nd = pm.nodes.get(node)!; return { x: nd.x, z: nd.z, m: v, label: `M_${nd.name} = ${numText(Math.abs(snap(v)))} kN·m`, color: 'reaction' as const }; })];
  eb.push({ kind: 'fig', sketch: rsk, caption: tx(`${P}reactionsFig`) });
  // Global equilibrium of the whole structure: reactions against every load, span loads included.
  let gx = 0, gz = 0;
  for (const l of pm.nodalLoads) { gx += l.fx; gz += l.fz; }
  for (const l of pm.memberLoads) {
    const m = pm.members.get(l.member)!;
    if (l.kind === 'dist') { const R = ((l.qa + l.qb) / 2) * (l.b - l.a); gx += -m.s * R; gz += m.c * R; }
    else if (l.kind === 'point') { gx += -m.s * l.p + m.c * l.px; gz += m.c * l.p + m.s * l.px; }
  }
  let rx = 0, rz = 0;
  for (const r of cm.reactions.values()) { rx += r.rx; rz += r.rz; }
  eb.push({ kind: 'calc', label: tx(`${P}compat.globalCheck`), formula: '\\textstyle\\sum R_x + \\sum P_x = 0, \\qquad \\sum R_z + \\sum P_z = 0', subst: `${par(snap(rx))} + ${par(snap(gx))}, \\qquad ${par(snap(rz))} + ${par(snap(gz))}`, result: `${num(snap(rx + gx))}, \\qquad ${num(snap(rz + gz))}`, check: '= 0\\ \\checkmark' });
  eb.push({ kind: 'p', text: tx(`${P}compat.residual`, { r: numText(cm.residual, 2) }) });
  eb.push({ kind: 'note', tone: cm.residual < 1e-6 * S ? 'ok' : 'warn', text: tx(cm.residual < 1e-6 * S ? `${P}compat.residualOk` : `${P}compat.residualBad`) });
  steps.push({ title: tx(`${P}compat.endsTitle`), blocks: eb });

  // 10. Diagrams.
  const Nmap = new Map(members.map((m) => [m.id, cm.ends.get(m.id)!.Ni]));
  const diag: Block[] = [memberForceTable(pm, pm.memberOrder, Nmap, snap), { kind: 'fig', sketch: axialSketch(pm, Nmap, snap), caption: tx(`${P}axialCaption`) }];
  if (hasFrame) {
    const msk = sketchOf(pm);
    msk.diagram = { color: 'moment', marks: true, unit: 'kN·m', members: members.map((m) => ({ member: m.id, values: Array.from({ length: 21 }, (_, k) => [k / 20, snap(momentAlong(pm, m, cm.ends.get(m.id)!, k / 20))] as [number, number]) })) };
    diag.push({ kind: 'fig', sketch: msk, caption: tx(`${P}compat.momentCaption`) });
  }
  steps.push({ title: tx('steps.common.diagrams'), blocks: diag });

  // 11. Comparison.
  const rows: CompareRow[] = [];
  if (ref) {
    for (const [k, d] of cm.dofs.entries()) {
      const u = ref.displacements.get(d.node);
      if (!u) continue;
      if (d.kind === 'ry') rows.push({ label: dofTex(pm, d), method: cm.q[k], matrix: u.ry, unit: 'rad' });
      else rows.push({ label: dofTex(pm, d), method: cm.q[k] * 1000, matrix: (d.kind === 'ux' ? u.ux : u.uz) * 1000, unit: 'mm' });
    }
    for (const m of members) {
      rows.push({ label: nTex(pm, m), method: snap(cm.ends.get(m.id)!.Ni), matrix: snap(ref.axial.get(m.id) ?? NaN), unit: 'kN' });
      const em = ref.endMoments.get(m.id);
      if (cm.kinds.get(m.id) !== 'truss' && em) {
        if (!m.hingeI) rows.push({ label: forceMeaning(pm, m, 1), method: snap(cm.ends.get(m.id)!.Mi), matrix: snap(em.Mi), unit: 'kN·m' });
        if (!m.hingeJ) rows.push({ label: forceMeaning(pm, m, 2), method: snap(cm.ends.get(m.id)!.Mj), matrix: snap(em.Mj), unit: 'kN·m' });
      }
    }
    for (const c of comps) {
      const r = ref.reactions.get(c.node);
      rows.push({ label: rTex(pm, c.node, c.dir), method: snap(known.get(c.id)!), matrix: snap(r ? (c.dir === 'x' ? r.rx : r.rz) : NaN), unit: 'kN' });
    }
    for (const [node, v] of moments) rows.push({ label: `M_{\\mathrm{${nodeName(pm, node)}}}`, method: snap(v), matrix: snap(ref.reactions.get(node)?.my ?? NaN), unit: 'kN·m' });
  }
  steps.push({ title: tx('steps.common.compare'), blocks: [{ kind: 'compare', rows, caption: tx(`${P}compareCaption`) }, { kind: 'p', text: tx(`${P}compat.compareNote`) }] });

  return { method: 'compatibility', title: tx('steps.m.compatibility.title'), subtitle: tx(hasFrame ? `${P}compat.subtitleFrame` : `${P}subtitle`), intro, steps };
}
