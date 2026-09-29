/**
 * What the three frame methods (methods/frames) share around their own
 * solution: the member data, names and TeX pieces, the opening of the
 * document (structure, kinematics, fixed-end moments), the checks of the
 * final end moments, and everything after them: shears from each member's
 * free body, axial forces and reactions from the joints, the comparison with
 * the matrix solve and the diagrams sampled from this solution.
 */
import type { MethodContext } from './registry';
import type { Block, Cell, CompareRow, Step, Txt } from './doc';
import { tx } from './doc';
import { num, numText, par, term } from './format';
import type { PlaneModel, PMember, PMemberLoad } from './plane-model';
import { hasSpecialSupports, hasThermal, loadsOn, nodalLoadAt, orientation } from './plane-model';
import { fixedEnd, fixedEndBlocks, type FixedEnd } from './fem';
import { sketchOf, type Sketch } from './sketch';
import { countIndeterminacy } from '../force-method/primary';
import { endKey as key, frameKinematics, modeWork, rref, solveDense, type EndKind, type EndSide, type FrameKin } from './sway-modes';

export const UM = '\\mathrm{kN\\,m}';
export const UF = '\\mathrm{kN}';
/** A document with more rotating joints than this is too long to read. */
const MAX_JOINTS = 12;
const MAX_MODES = 3;

export interface MemberData {
  m: PMember;
  ni: string;
  nj: string;
  ki: EndKind;
  kj: EndKind;
  loads: PMemberLoad[];
  /** Fixed–fixed actions of the span loads. */
  fe: FixedEnd;
  /** Simple-beam reactions of the span loads, along local +y. */
  V0i: number;
  V0j: number;
  /** Axial point loads, summed (towards J). */
  px: number;
}

export function memberData(fk: FrameKin): Map<number, MemberData> {
  const out = new Map<number, MemberData>();
  for (const id of fk.pm.memberOrder) {
    const m = fk.pm.members.get(id)!;
    const ni = fk.pm.nodes.get(m.i)!.name, nj = fk.pm.nodes.get(m.j)!.name;
    const loads = loadsOn(fk.pm, id);
    const fe = fixedEnd(m, loads, { i: ni, j: nj });
    const s = (fe.Mi + fe.Mj) / m.L;
    let px = 0;
    for (const l of loads) if (l.kind === 'point') px += l.px;
    out.set(id, { m, ni, nj, ki: fk.kind.get(m.i)!, kj: fk.kind.get(m.j)!, loads, fe, V0i: fe.Vi - s, V0j: fe.Vj + s, px });
  }
  return out;
}


// ─── Names and TeX pieces ───────────────────────────────────────────────────

export const subOf = (md: MemberData, e: EndSide) => (e === 'i' ? md.ni + md.nj : md.nj + md.ni);
export const Mt = (md: MemberData, e: EndSide) => `M_{${subOf(md, e)}}`;
export const nodeName = (fk: FrameKin, n: number) => fk.pm.nodes.get(n)!.name;
export const thetaSym = (fk: FrameKin, n: number) => `\\theta_{${nodeName(fk, n)}}`;
export const deltaSym = (k: number) => `\\Delta_{${k + 1}}`;
export const list = (xs: string[]) => xs.join(', ');

/** A linear expression c0 + Σ a_k x_k, dropping the terms that are zero. */
export function linTex(c0: number, coefs: number[], syms: string[]): string {
  const big = Math.max(Math.abs(c0), ...coefs.map(Math.abs), 1e-300);
  const tiny = (v: number) => Math.abs(v) <= 1e-9 * big;
  const parts: string[] = [];
  if (!tiny(c0)) parts.push(num(c0));
  coefs.forEach((c, k) => {
    if (tiny(c)) return;
    const a = Math.abs(c);
    const body = Math.abs(a - 1) < 1e-12 ? syms[k] : `${num(a)}\\,${syms[k]}`;
    parts.push(parts.length === 0 ? (c < 0 ? `-${body}` : body) : (c < 0 ? `- ${body}` : `+ ${body}`));
  });
  return parts.length ? parts.join(' ') : '0';
}

export interface End { id: number; e: EndSide; node: number; far: number }

/** Every member end, grouped by node in naming order (the distribution table's columns). */
export function allEnds(fk: FrameKin): End[] {
  const out: End[] = [];
  for (const n of fk.nodes) {
    for (const id of fk.pm.memberOrder) {
      const m = fk.pm.members.get(id)!;
      if (m.i === n) out.push({ id, e: 'i', node: n, far: m.j });
      if (m.j === n) out.push({ id, e: 'j', node: n, far: m.i });
    }
  }
  return out;
}


/** End moments with the joints held from rotating: FEM, modified at a member whose far end is released. */
export function loadStart(fk: FrameKin, md: Map<number, MemberData>): Map<string, number> {
  const M = new Map<string, number>();
  for (const d of md.values()) {
    const Ci = fk.couple.get(d.m.i) ?? 0, Cj = fk.couple.get(d.m.j) ?? 0;
    if (d.kj === 'released') {
      M.set(key(d.m.id, 'i'), d.fe.Mi - d.fe.Mj / 2 + Cj / 2);
      M.set(key(d.m.id, 'j'), Cj);
    } else if (d.ki === 'released') {
      M.set(key(d.m.id, 'j'), d.fe.Mj - d.fe.Mi / 2 + Ci / 2);
      M.set(key(d.m.id, 'i'), Ci);
    } else {
      M.set(key(d.m.id, 'i'), d.fe.Mi);
      M.set(key(d.m.id, 'j'), d.fe.Mj);
    }
  }
  return M;
}


// ─── Sketches ───────────────────────────────────────────────────────────────

export function loadedSketch(pm: PlaneModel): Sketch {
  const sk = sketchOf(pm);
  sk.dims = 'auto';
  sk.spanLoads = [];
  sk.forces = [];
  sk.couples = [];
  for (const l of pm.memberLoads) {
    const m = pm.members.get(l.member);
    if (!m) continue;
    if (l.kind === 'dist') {
      const same = Math.abs(l.qa - l.qb) < 1e-9;
      sk.spanLoads.push({ member: m.id, a: l.a, b: l.b, wa: -l.qa, wb: -l.qb, label: same ? `${numText(Math.abs(l.qa))} kN/m` : `${numText(Math.abs(l.qa))}–${numText(Math.abs(l.qb))} kN/m` });
    } else if (l.kind === 'point') {
      const ni = pm.nodes.get(m.i)!;
      const x = ni.x + l.a * m.c, z = ni.z + l.a * m.s;
      const fx = l.p * -m.s + l.px * m.c, fz = l.p * m.c + l.px * m.s;
      if (Math.hypot(fx, fz) > 1e-12) sk.forces.push({ x, z, fx, fz, label: `${numText(Math.hypot(fx, fz))} kN`, color: 'load' });
      if (Math.abs(l.m) > 1e-12) sk.couples.push({ x, z, m: l.m, label: `${numText(Math.abs(l.m))} kN·m`, color: 'load' });
    }
  }
  for (const l of pm.nodalLoads) {
    const n = pm.nodes.get(l.node);
    if (!n) continue;
    if (Math.hypot(l.fx, l.fz) > 1e-12) sk.forces.push({ x: n.x, z: n.z, fx: l.fx, fz: l.fz, label: `${numText(Math.hypot(l.fx, l.fz))} kN`, color: 'load' });
    if (Math.abs(l.my) > 1e-12) sk.couples.push({ x: n.x, z: n.z, m: l.my, label: `${numText(Math.abs(l.my))} kN·m`, color: 'load' });
  }
  return sk;
}

export function extent(pm: PlaneModel): number {
  const xs = [...pm.nodes.values()].map((n) => n.x), zs = [...pm.nodes.values()].map((n) => n.z);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
}

export function modeSketch(fk: FrameKin, k: number): Sketch {
  const sk = sketchOf(fk.pm);
  sk.members = sk.members.map((m) => ({ ...m, style: 'faint' as const }));
  const mode = fk.modes[k];
  const s = 0.15 * extent(fk.pm);
  sk.deformed = fk.pm.memberOrder.map((id) => {
    const m = fk.pm.members.get(id)!;
    const a = fk.pm.nodes.get(m.i)!, b = fk.pm.nodes.get(m.j)!;
    const pa = mode.phi.get(m.i)!, pb = mode.phi.get(m.j)!;
    return { points: [{ x: a.x + s * pa.x, z: a.z + s * pa.z }, { x: b.x + s * pb.x, z: b.z + s * pb.z }], color: 'deformed' as const };
  });
  const lead = fk.pm.nodes.get(mode.lead)!, p = mode.phi.get(mode.lead)!;
  sk.forces = [{ x: lead.x, z: lead.z, fx: p.x, fz: p.z, label: `Δ${k + 1}`, color: 'dof' }];
  return sk;
}

export function unknownsSketch(fk: FrameKin): Sketch {
  const sk = sketchOf(fk.pm);
  sk.dofs = fk.joints.map((n) => ({ node: n, kind: 'ry' as const, label: `θ${nodeName(fk, n)}`, color: 'dof' as const }));
  fk.modes.forEach((mode, k) => {
    const p = mode.phi.get(mode.lead)!;
    sk.dofs!.push({ node: mode.lead, kind: Math.abs(p.x) >= Math.abs(p.z) ? 'ux' : 'uz', label: `Δ${k + 1}`, color: 'accent' });
  });
  return sk;
}

// ─── Opening blocks and shared steps ────────────────────────────────────────

export function introBlocks(ctx: MethodContext, fk: FrameKin, md: Map<number, MemberData>, id: string): Block[] {
  const gh = countIndeterminacy(ctx.input).gh;
  const rows: Cell[][] = [...md.values()].map((d) => [
    d.m.name, { tex: num(d.m.L) }, { tex: num(d.m.E) }, { tex: num(d.m.I) }, { tex: num(d.m.EI) },
  ]);
  return [
    { kind: 'p', text: tx(`steps.frames.intro.${id}`) },
    { kind: 'p', text: tx('steps.frames.intro.signs') },
    { kind: 'p', text: tx('steps.frames.intro.axial') },
    { kind: 'fig', sketch: loadedSketch(fk.pm), caption: tx('steps.common.structureCaption') },
    { kind: 'table', head: [tx('steps.common.member'), { tex: 'L\\ [\\mathrm{m}]' }, { tex: 'E\\ [\\mathrm{kN/m^2}]' }, { tex: 'I\\ [\\mathrm{m^4}]' }, { tex: 'EI\\ [\\mathrm{kN\\,m^2}]' }], rows, caption: tx('steps.frames.intro.membersCaption') },
    { kind: 'p', text: gh > 0 ? tx('steps.frames.intro.indeterminate', { g: gh }) : tx('steps.frames.intro.determinate') },
    { kind: 'p', text: tx('steps.common.units') },
  ];
}

export function kinematicsStep(fk: FrameKin, md: Map<number, MemberData>, F: Map<number, { x: number; z: number }>): Step {
  const b: Block[] = [];
  const names = (ns: number[]) => list(ns.map((n) => nodeName(fk, n)));
  b.push({ kind: 'p', text: tx('steps.frames.kin.joints', { nodes: names(fk.joints) }) });
  if (fk.fixed.length) b.push({ kind: 'p', text: tx('steps.frames.kin.fixed', { nodes: names(fk.fixed) }) });
  if (fk.released.length) b.push({ kind: 'p', text: tx('steps.frames.kin.released', { nodes: names(fk.released) }) });
  b.push({ kind: 'p', text: tx('steps.frames.kin.inextensible'), detail: true });
  const nm = fk.modes.length;
  b.push({
    kind: 'calc', label: tx('steps.frames.kin.count'),
    formula: 'n_{\\Delta} = 2\\,n - r',
    subst: `n_{\\Delta} = 2 \\cdot ${fk.nodes.length} - ${fk.rank}`,
    result: `\\boxed{n_{\\Delta} = ${nm}}`,
  });
  b.push({ kind: 'p', text: tx('steps.frames.kin.countNote', { n: fk.nodes.length, s: fk.nSupportCons, b: fk.nMemberCons, r: fk.rank }), detail: true });
  b.push({ kind: 'fig', sketch: unknownsSketch(fk), caption: tx('steps.frames.kin.figCaption') });
  if (nm === 0) {
    b.push({ kind: 'note', tone: 'info', text: tx('steps.frames.kin.noSway') });
    return { title: tx('steps.frames.kin.title'), blocks: b };
  }
  b.push({ kind: 'p', text: tx('steps.frames.kin.modes', { n: nm }) });
  b.push({ kind: 'p', text: tx('steps.frames.kin.psiSign'), detail: true });
  fk.modes.forEach((mode, k) => {
    const rows: Cell[][] = [];
    for (const id of fk.pm.memberOrder) {
      const p = mode.psi.get(id)!;
      if (p === 0) continue;
      const d = md.get(id)!;
      rows.push([d.m.name, { tex: `\\psi_{${d.ni}${d.nj}} = ${linTex(0, [p], [deltaSym(k)])}` }]);
    }
    const blocks: Block[] = [
      { kind: 'fig', sketch: modeSketch(fk, k), caption: tx(mode.story ? 'steps.frames.kin.storyCaption' : 'steps.frames.kin.modeCaption', { k: k + 1, n: nodeName(fk, mode.lead) }) },
      { kind: 'table', head: [tx('steps.common.member'), { tex: `\\psi` }], rows, caption: tx('steps.frames.kin.psiCaption', { k: k + 1 }) },
    ];
    b.push({ kind: 'sub', title: tx('steps.frames.kin.mode', { k: k + 1 }), blocks });
  });
  b.push({ kind: 'p', text: tx('steps.frames.kin.virtualWork') });
  b.push({ kind: 'eq', tex: '-\\sum_{m} \\psi_{ij,k}\\,(M_{ij} + M_{ji}) = W_k, \\qquad W_k = \\sum_{n} \\mathbf{F}_n \\cdot \\boldsymbol{\\phi}_{k,n}', note: tx('steps.frames.kin.virtualWorkNote') });
  b.push({ kind: 'p', text: tx('steps.frames.kin.virtualWorkWhy'), detail: true });
  if (fk.modes.some((m) => m.story)) {
    b.push({ kind: 'p', text: tx('steps.frames.kin.storyShear') });
    b.push({ kind: 'eq', tex: '\\sum_{\\text{col}} \\frac{M_{ij} + M_{ji}}{h} = W_k' });
  }
  // The loads on the joints and each mode's work.
  const rows: Cell[][] = [];
  for (const n of fk.nodes) {
    const f = F.get(n)!;
    if (Math.abs(f.x) < 1e-12 && Math.abs(f.z) < 1e-12) continue;
    rows.push([nodeName(fk, n), { tex: num(f.x) }, { tex: num(f.z) }]);
  }
  b.push({ kind: 'p', text: tx('steps.frames.kin.jointLoads'), detail: true });
  if (rows.length) b.push({ kind: 'table', head: [tx('steps.common.node'), { tex: 'F_x\\ [\\mathrm{kN}]' }, { tex: 'F_z\\ [\\mathrm{kN}]' }], rows, caption: tx('steps.frames.kin.jointLoadsCaption') });
  fk.modes.forEach((mode, k) => {
    const terms: string[] = [];
    for (const [n, f] of F) {
      const p = mode.phi.get(n)!;
      if (p.x !== 0 && Math.abs(f.x) > 1e-12) terms.push(`${par(f.x)}\\cdot${par(p.x)}`);
      if (p.z !== 0 && Math.abs(f.z) > 1e-12) terms.push(`${par(f.z)}\\cdot${par(p.z)}`);
    }
    b.push({
      kind: 'calc', label: tx('steps.frames.kin.work', { k: k + 1 }),
      formula: `W_{${k + 1}} = \\sum_n \\mathbf{F}_n \\cdot \\boldsymbol{\\phi}_{${k + 1},n}`,
      subst: `W_{${k + 1}} = ${terms.join(' + ') || '0'}`,
      result: `\\boxed{W_{${k + 1}} = ${num(modeWork(fk, F, k))}\\ ${UF}}`,
    });
  });
  return { title: tx('steps.frames.kin.title'), blocks: b };
}

export function femStep(fk: FrameKin, md: Map<number, MemberData>): Step {
  const b: Block[] = [{ kind: 'p', text: tx('steps.frames.fem.intro') }];
  const anyReleased = [...md.values()].some((d) => d.ki === 'released' || d.kj === 'released');
  if (anyReleased) b.push({ kind: 'p', text: tx('steps.frames.fem.modifiedWhy'), detail: true });
  for (const d of md.values()) {
    const blocks = fixedEndBlocks(d.fe, { i: d.ni, j: d.nj }, { shears: false });
    const rel: EndSide | null = d.kj === 'released' ? 'j' : d.ki === 'released' ? 'i' : null;
    if (rel) {
      const near: EndSide = rel === 'j' ? 'i' : 'j';
      const nearS = subOf(d, near), farS = subOf(d, rel);
      const Fn = near === 'i' ? d.fe.Mi : d.fe.Mj, Ff = near === 'i' ? d.fe.Mj : d.fe.Mi;
      const C = fk.couple.get(rel === 'j' ? d.m.j : d.m.i) ?? 0;
      const farN = rel === 'j' ? d.nj : d.ni;
      blocks.push({
        kind: 'calc', label: tx('steps.frames.fem.modified', { n: farN }),
        formula: `\\mathrm{FEM}^{*}_{${nearS}} = \\mathrm{FEM}_{${nearS}} - \\tfrac{1}{2}\\,\\mathrm{FEM}_{${farS}} + \\tfrac{1}{2}\\,C_{${farN}}, \\qquad M_{${farS}} = C_{${farN}}`,
        subst: `\\mathrm{FEM}^{*}_{${nearS}} = ${num(Fn)} - \\tfrac{1}{2}${par(Ff)} + \\tfrac{1}{2}${par(C)}`,
        result: `\\boxed{\\mathrm{FEM}^{*}_{${nearS}} = ${num(Fn - Ff / 2 + C / 2)}\\ ${UM}}, \\qquad \\boxed{M_{${farS}} = ${num(C)}\\ ${UM}}`,
      });
    }
    b.push({ kind: 'sub', title: tx('steps.frames.memberN', { m: d.m.name }), blocks });
  }
  return { title: tx('steps.frames.fem.title'), blocks: b };
}


/** The equilibrium the final moments must satisfy: each joint, and each mode's equation. */
export function checkBlocks(fk: FrameKin, md: Map<number, MemberData>, M: Map<string, number>, F: Map<number, { x: number; z: number }>): Block[] {
  const out: Block[] = [];
  const ends = allEnds(fk);
  for (const n of fk.joints) {
    const at = ends.filter((x) => x.node === n);
    const nn = nodeName(fk, n);
    const sum = at.reduce((s, x) => s + M.get(key(x.id, x.e))!, 0);
    const C = fk.couple.get(n) ?? 0;
    out.push({
      kind: 'calc', label: tx('steps.frames.check.joint', { n: nn }),
      formula: `${at.map((x) => Mt(md.get(x.id)!, x.e)).join(' + ')} = C_{${nn}}`,
      subst: `${at.map((x) => par(M.get(key(x.id, x.e))!)).join(' + ')} = ${num(sum)}`,
      result: `\\boxed{\\sum M_{${nn}} = ${num(sum)}\\ ${UM}}`,
      check: `C_{${nn}} = ${num(C)}\\ ${UM}\\ \\checkmark`,
    });
  }
  fk.modes.forEach((mode, k) => {
    const W = modeWork(fk, F, k);
    const terms: string[] = [];
    let s = 0;
    for (const [id, p] of mode.psi) {
      if (p === 0) continue;
      const mi = M.get(key(id, 'i'))!, mj = M.get(key(id, 'j'))!;
      terms.push(`${par(p)}\\big(${par(mi)} + ${par(mj)}\\big)`);
      s += p * (mi + mj);
    }
    out.push({
      kind: 'calc', label: tx('steps.frames.check.sway', { k: k + 1 }),
      formula: `-\\sum \\psi_{ij,${k + 1}}\\,(M_{ij} + M_{ji}) = W_{${k + 1}}`,
      subst: `-\\big[${terms.join(' + ')}\\big] = ${num(-s)}`,
      result: `\\boxed{${num(-s)}\\ ${UF}}`,
      check: `W_{${k + 1}} = ${num(W)}\\ ${UF}\\ \\checkmark`,
    });
  });
  return out;
}

export function finalTable(md: Map<number, MemberData>, M: Map<string, number>): Block {
  const rows: Cell[][] = [];
  for (const d of md.values()) rows.push([d.m.name, { tex: `${Mt(d, 'i')} = ${num(M.get(key(d.m.id, 'i'))!)}` }, { tex: `${Mt(d, 'j')} = ${num(M.get(key(d.m.id, 'j'))!)}` }]);
  return { kind: 'table', head: [tx('steps.common.member'), tx('steps.frames.head.endI'), tx('steps.frames.head.endJ')], rows, caption: tx('steps.frames.final.caption') };
}

// ─── From end moments to everything else ────────────────────────────────────

const G3 = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]] as const;
function gauss(a: number, b: number, f: (x: number) => number): number {
  const h = (b - a) / 2, c = (a + b) / 2;
  let s = 0;
  for (const [x, w] of G3) s += w * f(c + h * x);
  return s * h;
}

/** Bending moment (sagging, tension on local −y positive) and classical shear at x from the I end. */
export function sectionAt(d: MemberData, Mi: number, Vi: number, x: number): { M: number; V: number } {
  let M = -Mi + Vi * x, V = Vi;
  for (const l of d.loads) {
    if (l.kind === 'dist') {
      const c = Math.min(l.b, x);
      if (c <= l.a || l.b <= l.a) continue;
      const q = (xi: number) => l.qa + ((l.qb - l.qa) * (xi - l.a)) / (l.b - l.a);
      M += gauss(l.a, c, (xi) => q(xi) * (x - xi));
      V += gauss(l.a, c, q);
    } else if (l.kind === 'point' && l.a < x) {
      M += l.p * (x - l.a) - l.m;
      V += l.p;
    }
  }
  return { M, V };
}

export interface Solution {
  M: Map<string, number>;
  V: Map<string, number>;
  N: Map<number, number>;
  R: Map<number, { rx: number; rz: number; my: number }>;
}

export function shearStep(fk: FrameKin, md: Map<number, MemberData>, M: Map<string, number>, V: Map<string, number>): Step {
  const b: Block[] = [{ kind: 'p', text: tx('steps.frames.shear.intro') }, { kind: 'p', text: tx('steps.frames.shear.why'), detail: true }];
  for (const d of md.values()) {
    const id = d.m.id;
    const mi = M.get(key(id, 'i'))!, mj = M.get(key(id, 'j'))!;
    const vi = d.V0i + (mi + mj) / d.m.L, vj = d.V0j - (mi + mj) / d.m.L;
    V.set(key(id, 'i'), vi); V.set(key(id, 'j'), vj);
    const si = subOf(d, 'i'), sj = subOf(d, 'j');
    const a = fk.pm.nodes.get(d.m.i)!, c = fk.pm.nodes.get(d.m.j)!;
    const nx = -d.m.s, nz = d.m.c;
    const sk: Sketch = {
      nodes: [{ id: a.id, x: a.x, z: a.z, label: a.name }, { id: c.id, x: c.x, z: c.z, label: c.name }],
      members: [{ id, i: a.id, j: c.id, style: 'highlight' }],
      spanLoads: d.loads.flatMap((l) => (l.kind === 'dist' ? [{ member: id, a: l.a, b: l.b, wa: -l.qa, wb: -l.qb }] : [])),
      forces: [
        { x: a.x, z: a.z, fx: nx, fz: nz, label: `V${si}`, color: 'unknown', dashed: true },
        { x: c.x, z: c.z, fx: nx, fz: nz, label: `V${sj}`, color: 'unknown', dashed: true },
      ],
      couples: [
        { x: a.x, z: a.z, m: mi, label: `M${si} = ${numText(mi)}`, color: 'moment' },
        { x: c.x, z: c.z, m: mj, label: `M${sj} = ${numText(mj)}`, color: 'moment' },
      ],
    };
    for (const l of d.loads) {
      if (l.kind !== 'point') continue;
      const x = a.x + l.a * d.m.c, z = a.z + l.a * d.m.s;
      const fx = l.p * nx + l.px * d.m.c, fz = l.p * nz + l.px * d.m.s;
      if (Math.hypot(fx, fz) > 1e-12) sk.forces!.push({ x, z, fx, fz, label: `${numText(Math.hypot(fx, fz))} kN`, color: 'load' });
      if (Math.abs(l.m) > 1e-12) sk.couples!.push({ x, z, m: l.m, label: `${numText(Math.abs(l.m))} kN·m`, color: 'load' });
    }
    const blocks: Block[] = [{ kind: 'fig', sketch: sk, caption: tx('steps.frames.shear.fbCaption', { m: d.m.name }) }];
    const R = d.fe.resultant, Mw = d.V0j * d.m.L;
    if (d.fe.terms.length === 0) blocks.push({ kind: 'p', text: tx('steps.frames.shear.noLoad') });
    else blocks.push({
      kind: 'calc', label: tx('steps.frames.shear.simple'),
      formula: `V^{0}_{${sj}} = \\frac{M^{w}_{${d.ni}}}{L}, \\qquad V^{0}_{${si}} = R - V^{0}_{${sj}}`,
      subst: `V^{0}_{${sj}} = \\frac{${num(Mw)}}{${num(d.m.L)}}, \\qquad V^{0}_{${si}} = ${num(R)} - ${par(d.V0j)}`,
      result: `\\boxed{V^{0}_{${si}} = ${num(d.V0i)}\\ ${UF}}, \\qquad \\boxed{V^{0}_{${sj}} = ${num(d.V0j)}\\ ${UF}}`,
    });
    blocks.push({
      kind: 'calc', label: tx('steps.frames.shear.ends'),
      formula: `V_{${si}} = V^{0}_{${si}} + \\frac{M_{${si}} + M_{${sj}}}{L}, \\qquad V_{${sj}} = V^{0}_{${sj}} - \\frac{M_{${si}} + M_{${sj}}}{L}`,
      subst: `V_{${si}} = ${num(d.V0i)} + \\frac{${par(mi)} + ${par(mj)}}{${num(d.m.L)}}, \\qquad V_{${sj}} = ${num(d.V0j)} - \\frac{${par(mi)} + ${par(mj)}}{${num(d.m.L)}}`,
      result: `\\boxed{V_{${si}} = ${num(vi)}\\ ${UF}}, \\qquad \\boxed{V_{${sj}} = ${num(vj)}\\ ${UF}}`,
      check: `V_{${si}} + V_{${sj}} = ${num(vi + vj)} = R = ${num(R)}\\ ${UF}\\ \\checkmark`,
    });
    b.push({ kind: 'sub', title: tx('steps.frames.memberN', { m: d.m.name }), blocks });
  }
  return { title: tx('steps.frames.shear.title'), blocks: b };
}

/**
 * Axial forces and translation reactions from the equilibrium of every node.
 * With members that keep their length the system can have more unknowns than
 * independent equations (a closed triangle of members, a beam between two
 * pinned supports); the axial forces are then shared by each member's axial
 * flexibility L/EA, the least complementary energy among the equilibrium
 * solutions, and the document says so.
 */
export function axialAndReactions(fk: FrameKin, md: Map<number, MemberData>, M: Map<string, number>, V: Map<string, number>, sol: Solution): { blocks: Block[]; selfStress: boolean } {
  const pm = fk.pm;
  type U = { kind: 'N'; id: number } | { kind: 'Rx' | 'Rz'; node: number };
  const unknowns: U[] = pm.memberOrder.map((id) => ({ kind: 'N', id }));
  const supported = fk.nodes.filter((n) => pm.supports.has(n));
  for (const n of supported) {
    const s = pm.supports.get(n)!;
    if (s.ux) unknowns.push({ kind: 'Rx', node: n });
    if (s.uz) unknowns.push({ kind: 'Rz', node: n });
  }
  const sym = (u: U) => (u.kind === 'N' ? `N_{${md.get(u.id)!.ni}${md.get(u.id)!.nj}}` : `${nodeName(fk, u.node)}_${u.kind === 'Rx' ? 'x' : 'z'}`);
  const A: number[][] = [], f: number[] = [];
  const shown: Block[] = [];
  for (const n of fk.nodes) {
    const rowX = new Array(unknowns.length).fill(0), rowZ = new Array(unknowns.length).fill(0);
    const pieces: { x: string[]; z: string[] } = { x: [], z: [] };
    let cx = 0, cz = 0;
    const push = (dir: 'x' | 'z', v: number) => {
      if (Math.abs(v) < 1e-12) return;
      pieces[dir].push(term(v));
      if (dir === 'x') cx += v; else cz += v;
    };
    for (const d of md.values()) {
      const nx = -d.m.s, nz = d.m.c;
      const k = unknowns.findIndex((u) => u.kind === 'N' && u.id === d.m.id);
      if (d.m.i === n) {
        rowX[k] += d.m.c; rowZ[k] += d.m.s;
        const v = V.get(key(d.m.id, 'i'))!;
        push('x', -v * nx); push('z', -v * nz);
      }
      if (d.m.j === n) {
        rowX[k] -= d.m.c; rowZ[k] -= d.m.s;
        const v = V.get(key(d.m.id, 'j'))!;
        push('x', -v * nx + d.px * d.m.c); push('z', -v * nz + d.px * d.m.s);
      }
    }
    const P = nodalLoadAt(pm, n);
    push('x', P.fx); push('z', P.fz);
    unknowns.forEach((u, k) => {
      if (u.kind === 'Rx' && u.node === n) rowX[k] = 1;
      if (u.kind === 'Rz' && u.node === n) rowZ[k] = 1;
    });
    A.push(rowX, rowZ); f.push(-cx, -cz);
    const lhs = (row: number[], p: string[]) => {
      const t = linTex(0, row, unknowns.map(sym));
      const rest = p.join(' ');
      if (t === '0') return rest ? rest.replace(/^\+ /, '') : '0';
      return rest ? `${t} ${rest}` : t;
    };
    shown.push({
      kind: 'sub', title: tx('steps.frames.jointN', { n: nodeName(fk, n) }), blocks: [
        { kind: 'eq', tex: `\\sum F_x = 0: \\quad ${lhs(rowX, pieces.x)} = 0` },
        { kind: 'eq', tex: `\\sum F_z = 0: \\quad ${lhs(rowZ, pieces.z)} = 0` },
      ],
    });
  }
  // General solution: a particular one plus the self-stress states, which take the least L/EA energy.
  const nu = unknowns.length;
  const aug = A.map((r, k) => [...r, f[k]]);
  const { R, pivots } = rref(aug, nu);
  const free = [...Array(nu).keys()].filter((c) => !pivots.includes(c));
  const x0 = new Array(nu).fill(0);
  pivots.forEach((p, r) => { x0[p] = R[r][nu]; });
  let x = x0;
  if (free.length) {
    const S = free.map((fc) => { const v = new Array(nu).fill(0); v[fc] = 1; pivots.forEach((p, r) => { v[p] = -R[r][fc]; }); return v; });
    const w = unknowns.map((u) => (u.kind === 'N' ? pm.members.get(u.id)!.L / Math.max(pm.members.get(u.id)!.EA, 1e-300) : 0));
    const K = S.map((a) => S.map((c) => a.reduce((s, v, k) => s + v * w[k] * c[k], 0)));
    const rhs = S.map((a) => -a.reduce((s, v, k) => s + v * w[k] * x0[k], 0));
    const cs = solveDense(K, rhs) ?? new Array(free.length).fill(0);
    x = x0.map((v, k) => v + S.reduce((s, vec, q) => s + vec[k] * cs[q], 0));
  }
  unknowns.forEach((u, k) => {
    if (u.kind === 'N') sol.N.set(u.id, x[k]);
  });
  for (const n of supported) {
    const s = pm.supports.get(n)!;
    const rx = unknowns.findIndex((u) => u.kind === 'Rx' && u.node === n);
    const rz = unknowns.findIndex((u) => u.kind === 'Rz' && u.node === n);
    let my = 0;
    if (s.ry) for (const e of allEnds(fk)) if (e.node === n) my += M.get(key(e.id, e.e))!;
    if (s.ry) my -= fk.couple.get(n) ?? 0;
    sol.R.set(n, { rx: rx >= 0 ? x[rx] : 0, rz: rz >= 0 ? x[rz] : 0, my });
  }
  const nVals = pm.memberOrder.map((id) => `N_{${md.get(id)!.ni}${md.get(id)!.nj}} = ${num(sol.N.get(id)!)}`);
  const blocks: Block[] = [...shown, {
    kind: 'calc', label: tx('steps.frames.axial.solved'),
    formula: '\\sum F_x = 0, \\quad \\sum F_z = 0',
    result: `\\boxed{${nVals.join(',\\ ')}}\\ ${UF}`,
  }];
  return { blocks, selfStress: free.length > 0 };
}

export function axialStep(fk: FrameKin, md: Map<number, MemberData>, sol: Solution): Step {
  const r = axialAndReactions(fk, md, sol.M, sol.V, sol);
  const rows: Cell[][] = fk.pm.memberOrder.map((id) => {
    const N = sol.N.get(id)!;
    const big = Math.max(...[...sol.N.values()].map(Math.abs), 1e-9);
    const state = Math.abs(N) <= 1e-6 * big ? 'steps.frames.axial.zero' : N > 0 ? 'steps.frames.axial.tension' : 'steps.frames.axial.compression';
    return [md.get(id)!.m.name, { tex: num(N) }, tx(state)];
  });
  const blocks: Block[] = [
    { kind: 'p', text: tx('steps.frames.axial.intro') },
    { kind: 'p', text: tx('steps.frames.axial.why'), detail: true },
    ...r.blocks,
    { kind: 'table', head: [tx('steps.common.member'), { tex: 'N\\ [\\mathrm{kN}]' }, tx('steps.frames.axial.state')], rows, caption: tx('steps.frames.axial.caption') },
  ];
  if (r.selfStress) blocks.push({ kind: 'note', tone: 'info', text: tx('steps.frames.axial.selfStress') });
  return { title: tx('steps.frames.axial.title'), blocks };
}

export function reactionsStep(fk: FrameKin, md: Map<number, MemberData>, sol: Solution): Step {
  const pm = fk.pm;
  const b: Block[] = [{ kind: 'p', text: tx('steps.frames.react.intro') }];
  const ends = allEnds(fk);
  for (const n of fk.fixed) {
    const at = ends.filter((x) => x.node === n);
    const nn = nodeName(fk, n);
    const C = fk.couple.get(n) ?? 0;
    b.push({
      kind: 'calc', label: tx('steps.frames.react.moment', { n: nn }),
      formula: `M_{${nn}} = ${at.map((x) => Mt(md.get(x.id)!, x.e)).join(' + ')} - C_{${nn}}`,
      subst: `M_{${nn}} = ${at.map((x) => par(sol.M.get(key(x.id, x.e))!)).join(' + ')} - ${par(C)}`,
      result: `\\boxed{M_{${nn}} = ${num(sol.R.get(n)!.my)}\\ ${UM}}`,
    });
  }
  const rows: Cell[][] = [];
  const sk = sketchOf(pm);
  sk.forces = [];
  sk.couples = [];
  for (const n of fk.nodes) {
    const s = pm.supports.get(n);
    if (!s) continue;
    const r = sol.R.get(n)!;
    const nn = nodeName(fk, n);
    rows.push([nn, s.ux ? { tex: num(r.rx) } : '—', s.uz ? { tex: num(r.rz) } : '—', s.ry ? { tex: num(r.my) } : '—']);
    const p = pm.nodes.get(n)!;
    if (s.ux && Math.abs(r.rx) > 1e-9) sk.forces.push({ x: p.x, z: p.z, fx: r.rx, fz: 0, label: `${nn}x = ${numText(r.rx)} kN`, color: 'reaction' });
    if (s.uz && Math.abs(r.rz) > 1e-9) sk.forces.push({ x: p.x, z: p.z, fx: 0, fz: r.rz, label: `${nn}z = ${numText(r.rz)} kN`, color: 'reaction' });
    if (s.ry && Math.abs(r.my) > 1e-9) sk.couples.push({ x: p.x, z: p.z, m: r.my, label: `M${nn} = ${numText(r.my)} kN·m`, color: 'reaction' });
  }
  b.push({ kind: 'table', head: [tx('steps.common.support'), { tex: 'R_x\\ [\\mathrm{kN}]' }, { tex: 'R_z\\ [\\mathrm{kN}]' }, { tex: 'M\\ [\\mathrm{kN\\,m}]' }], rows, caption: tx('steps.frames.react.caption') });
  b.push({ kind: 'fig', sketch: sk, caption: tx('steps.frames.react.figCaption') });
  // Whole-structure check: reactions against every load.
  const o = pm.nodes.get(fk.nodes[0])!;
  let Lx = 0, Lz = 0, Lm = 0;
  for (const l of pm.nodalLoads) {
    const p = pm.nodes.get(l.node);
    if (!p) continue;
    Lx += l.fx; Lz += l.fz; Lm += (p.x - o.x) * l.fz - (p.z - o.z) * l.fx + l.my;
  }
  for (const d of md.values()) {
    const Fx = -d.fe.resultant * -d.m.s + d.px * d.m.c, Fz = -d.fe.resultant * d.m.c + d.px * d.m.s;
    const p = pm.nodes.get(d.m.i)!;
    Lx += Fx; Lz += Fz; Lm += -d.V0j * d.m.L + (p.x - o.x) * Fz - (p.z - o.z) * Fx;
  }
  let Rx = 0, Rz = 0, Rm = 0;
  for (const [n, r] of sol.R) {
    const p = pm.nodes.get(n)!;
    Rx += r.rx; Rz += r.rz; Rm += (p.x - o.x) * r.rz - (p.z - o.z) * r.rx + r.my;
  }
  b.push({
    kind: 'calc', label: tx('steps.frames.react.global', { n: o.name }),
    formula: `\\sum F_x = 0, \\quad \\sum F_z = 0, \\quad \\sum M_{${o.name}} = 0`,
    subst: `${num(Rx)} ${term(Lx)}, \\quad ${num(Rz)} ${term(Lz)}, \\quad ${num(Rm)} ${term(Lm)}`,
    result: `\\boxed{${num(Rx + Lx)},\\ ${num(Rz + Lz)},\\ ${num(Rm + Lm)}}`,
    check: '\\checkmark',
  });
  return { title: tx('steps.common.reactions'), blocks: b };
}

export function compareStep(fk: FrameKin, md: Map<number, MemberData>, sol: Solution, ctx: MethodContext, extra: CompareRow[]): Step {
  const ref = ctx.ref!;
  const rows: CompareRow[] = [];
  for (const d of md.values()) {
    const r = ref.endMoments.get(d.m.id);
    if (!r) continue;
    rows.push({ label: Mt(d, 'i'), method: sol.M.get(key(d.m.id, 'i'))!, matrix: r.Mi, unit: 'kN·m' });
    rows.push({ label: Mt(d, 'j'), method: sol.M.get(key(d.m.id, 'j'))!, matrix: r.Mj, unit: 'kN·m' });
  }
  for (const n of fk.nodes) {
    const s = fk.pm.supports.get(n);
    const r = ref.reactions.get(n), mine = sol.R.get(n);
    if (!s || !r || !mine) continue;
    const nn = nodeName(fk, n);
    if (s.ux) rows.push({ label: `${nn}_x`, method: mine.rx, matrix: r.rx, unit: 'kN' });
    if (s.uz) rows.push({ label: `${nn}_z`, method: mine.rz, matrix: r.rz, unit: 'kN' });
    if (s.ry) rows.push({ label: `M_{${nn}}`, method: mine.my, matrix: r.my, unit: 'kN·m' });
  }
  rows.push(...extra);
  return {
    title: tx('steps.common.compare'),
    blocks: [
      { kind: 'compare', rows, caption: tx('steps.frames.compare.caption') },
      { kind: 'p', text: tx('steps.common.compareNote') },
      { kind: 'p', text: tx('steps.frames.compare.axial'), detail: true },
    ],
  };
}

export function diagramStep(fk: FrameKin, md: Map<number, MemberData>, sol: Solution): Step {
  const mom: Array<{ member: number; values: Array<[number, number]> }> = [];
  const shr: Array<{ member: number; values: Array<[number, number]> }> = [];
  for (const d of md.values()) {
    const L = d.m.L;
    const ts = new Set<number>();
    for (let k = 0; k <= 24; k++) ts.add(k / 24);
    for (const l of d.loads) {
      const at = l.kind === 'dist' ? [l.a, l.b] : l.kind === 'point' ? [l.a] : [];
      for (const a of at) { const t = a / L; if (t > 1e-6) ts.add(t - 1e-6); if (t < 1 - 1e-6) ts.add(t + 1e-6); }
    }
    const tsSorted = [...ts].sort((a, b) => a - b);
    const Mi = sol.M.get(key(d.m.id, 'i'))!, Vi = sol.V.get(key(d.m.id, 'i'))!;
    mom.push({ member: d.m.id, values: tsSorted.map((t) => [t, sectionAt(d, Mi, Vi, t * L).M]) });
    shr.push({ member: d.m.id, values: tsSorted.map((t) => [t, sectionAt(d, Mi, Vi, t * L).V]) });
  }
  const skM = sketchOf(fk.pm);
  skM.diagram = { color: 'diagram', marks: true, unit: 'kN·m', members: mom };
  const skV = sketchOf(fk.pm);
  skV.diagram = { color: 'diagram', marks: true, unit: 'kN', members: shr };
  return {
    title: tx('steps.common.diagrams'),
    blocks: [
      { kind: 'p', text: tx('steps.frames.diag.intro') },
      { kind: 'fig', sketch: skM, caption: tx('steps.frames.diag.moment') },
      { kind: 'fig', sketch: skV, caption: tx('steps.frames.diag.shear') },
      { kind: 'p', text: tx('steps.frames.diag.sign'), detail: true },
    ],
  };
}

/** Everything after the end moments, identical for the three methods. */
export function closingSteps(ctx: MethodContext, fk: FrameKin, md: Map<number, MemberData>, M: Map<string, number>, extra: CompareRow[]): Step[] {
  const sol: Solution = { M, V: new Map(), N: new Map(), R: new Map() };
  const shear = shearStep(fk, md, M, sol.V);
  const axial = axialStep(fk, md, sol);
  const react = reactionsStep(fk, md, sol);
  return [shear, axial, react, compareStep(fk, md, sol, ctx, extra), diagramStep(fk, md, sol)];
}

/** Rotations and translations against the matrix solve, for the methods that find them. */
export function displacementRows(fk: FrameKin, ctx: MethodContext, theta: Map<number, number> | null, delta: number[]): CompareRow[] {
  const ref = ctx.ref!;
  const rows: CompareRow[] = [];
  if (theta) for (const [n, th] of theta) {
    const r = ref.displacements.get(n);
    if (r) rows.push({ label: thetaSym(fk, n), method: th, matrix: r.ry, unit: 'rad' });
  }
  const seen = new Set<number>();
  fk.modes.forEach((mode) => {
    const n = mode.lead;
    if (seen.has(n)) return;
    seen.add(n);
    const r = ref.displacements.get(n);
    if (!r) return;
    let ux = 0, uz = 0;
    fk.modes.forEach((m2, k) => { const p = m2.phi.get(n)!; ux += p.x * delta[k]; uz += p.z * delta[k]; });
    const nn = nodeName(fk, n);
    const p = mode.phi.get(n)!;
    if (Math.abs(p.x) >= Math.abs(p.z)) rows.push({ label: `u_{x,${nn}}`, method: ux * 1000, matrix: r.ux * 1000, unit: 'mm' });
    else rows.push({ label: `u_{z,${nn}}`, method: uz * 1000, matrix: r.uz * 1000, unit: 'mm' });
  });
  return rows;
}

// ─── Applicability ──────────────────────────────────────────────────────────

export type Ready = { ok: true; fk: FrameKin } | { ok: false; reason: Txt };

export function readFrame(ctx: MethodContext): Ready {
  const pm = ctx.pm;
  const fail = (k: string, p?: Record<string, string | number>): Ready => ({ ok: false, reason: tx(k, p) });
  if (pm.members.size === 0) return fail('steps.req.noMembers');
  // A hinge at a member end is harmless where the rotation is free anyway: a
  // pinned support or roller that only this member reaches, which the methods
  // already take as a released end. Any other hinge splits a joint (or frees
  // a fixed end) and is refused.
  const degree = new Map<number, number>();
  for (const m of pm.members.values()) for (const n of [m.i, m.j]) degree.set(n, (degree.get(n) ?? 0) + 1);
  const freeEnd = (n: number) => { const s = pm.supports.get(n); return degree.get(n) === 1 && !!s && !s.ry; };
  for (const m of pm.members.values()) {
    if (m.truss) return fail('steps.frames.req.truss', { m: m.name });
    if ((m.hingeI && !freeEnd(m.i)) || (m.hingeJ && !freeEnd(m.j))) return fail('steps.frames.req.hinge', { m: m.name });
  }
  if (hasSpecialSupports(pm)) return fail('steps.req.special');
  if (hasThermal(pm)) return fail('steps.req.thermal');
  if (!ctx.ref) return fail('steps.req.unstable');
  for (const m of pm.members.values()) if (!(m.EI > 0) || !(m.L > 0)) return fail('steps.req.unstable');
  const fk = frameKinematics(pm);
  if (!fk) return fail('steps.req.unstable');
  for (const m of pm.members.values()) if (fk.kind.get(m.i) === 'released' && fk.kind.get(m.j) === 'released') return fail('steps.frames.req.noJoint');
  if (fk.joints.length === 0) return fail('steps.frames.req.noJoint');
  if (fk.joints.length > MAX_JOINTS) return fail('steps.frames.req.tooLarge', { n: fk.joints.length, max: MAX_JOINTS });
  if (fk.modes.length > MAX_MODES) return fail('steps.frames.req.tooManyModes', { n: fk.modes.length, max: MAX_MODES });
  return { ok: true, fk };
}

export function subtitle(fk: FrameKin): Txt {
  const beam = [...fk.pm.members.values()].every((m) => orientation(m) === 'horizontal');
  return tx(beam ? 'steps.frames.subtitle.beam' : 'steps.frames.subtitle.frame');
}
