/**
 * The method of sections (Ritter) for one member, the selected one or a
 * diagonal of the middle panel: a cut through three members and, for each,
 * a moment about the point where the other two meet.
 */
import type { MethodContext } from './registry';
import type { Applicability, Block, Step, StepDoc } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import type { PlaneModel, PMember } from './plane-model';
import { nodalLoadAt } from './plane-model';
import type { Sketch } from './sketch';
import { sketchOf } from './sketch';
import type { Known, Dir, RComp, ETerm, Eq, GPoint, GEq } from './truss-common';
import {
  EPS, KN, P, nodeName, memberKey, nTex, nPlain, nId,
  away, reactionComps, forceScale, coefOf, knownSum, substTex, formulaOf, snapper,
  structureSketch, refuse, determinateTruss, forceEq, momentEq, onNode, solveGlobal, mSym,
  geqLabel, reactionBlocks, classificationBlocks, resultSteps, sizeOf, loadForces, reactionForces,
} from './truss-common';

// ─── The method of sections ──────────────────────────────────────────

interface Cut { members: number[]; side: Set<number>; other: Set<number> }

/** The joints split in two when `removed` are taken out; null unless exactly two parts, each cut member joining them. */
function splitBy(pm: PlaneModel, removed: Set<number>): [Set<number>, Set<number>] | null {
  const parent = new Map(pm.nodeOrder.map((id) => [id, id]));
  const find = (a: number): number => { while (parent.get(a) !== a) { const p = parent.get(parent.get(a)!)!; parent.set(a, p); a = p; } return a; };
  for (const m of pm.members.values()) if (!removed.has(m.id)) parent.set(find(m.i), find(m.j));
  const roots = new Map<number, Set<number>>();
  for (const id of pm.nodeOrder) { const r = find(id); if (!roots.has(r)) roots.set(r, new Set()); roots.get(r)!.add(id); }
  if (roots.size !== 2) return null;
  const [a, b] = [...roots.values()];
  for (const id of removed) { const m = pm.members.get(id)!; if (a.has(m.i) === a.has(m.j)) return null; }
  return [a, b];
}

/** Where two members' lines meet; null when they are parallel. */
function meet(pm: PlaneModel, a: PMember, b: PMember): { x: number; z: number } | null {
  const pa = pm.nodes.get(a.i)!, pb = pm.nodes.get(b.i)!;
  const det = a.c * (-b.s) - a.s * (-b.c);
  if (Math.abs(det) < 1e-9) return null;
  const rx = pb.x - pa.x, rz = pb.z - pa.z;
  const t = (rx * (-b.s) - rz * (-b.c)) / det;
  return { x: pa.x + t * a.c, z: pa.z + t * a.s };
}

/**
 * The cuts through `target` and two more members that split the truss in
 * two, with the three forces independent in the free body's equations. The most
 * even split is taken (a cut through a panel, not around a joint), and the
 * side with fewer supports and loads to write is the free body; without the
 * reactions from global equilibrium only a side without supports will do.
 */
export function findCut(pm: PlaneModel, target: number, reactionsKnown: boolean): Cut | null {
  const ids = pm.memberOrder.filter((id) => id !== target);
  const size = sizeOf(pm);
  let best: { cut: Cut; score: number } | null = null;
  const loaded = (s: Set<number>) => [...s].filter((id) => { const l = nodalLoadAt(pm, id); return Math.abs(l.fx) + Math.abs(l.fz) > EPS; }).length;
  const supported = (s: Set<number>) => [...s].filter((id) => pm.supports.has(id)).length;
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    const three = [target, ids[a], ids[b]];
    const parts = splitBy(pm, new Set(three));
    if (!parts) continue;
    // The three forces must be independent in ΣFx, ΣFz, ΣM: not concurrent, not all
    // parallel, and no two on one line (the equations could not tell those two apart).
    const ms = three.map((id) => pm.members.get(id)!);
    const rows = ms.map((m) => { const n0 = pm.nodes.get(m.i)!; return [m.c, m.s, (n0.x * m.s - n0.z * m.c) / size]; });
    const det = rows[0][0] * (rows[1][1] * rows[2][2] - rows[1][2] * rows[2][1]) - rows[0][1] * (rows[1][0] * rows[2][2] - rows[1][2] * rows[2][0]) + rows[0][2] * (rows[1][0] * rows[2][1] - rows[1][1] * rows[2][0]);
    if (Math.abs(det) < 1e-6) continue;
    const choices = parts.filter((s) => reactionsKnown || supported(s) === 0);
    if (!choices.length) continue;
    const side = choices.sort((x, y) => (supported(x) * 2 + loaded(x) + x.size * 0.01) - (supported(y) * 2 + loaded(y) + y.size * 0.01))[0];
    const other = side === parts[0] ? parts[1] : parts[0];
    const score = Math.min(parts[0].size, parts[1].size);
    if (!best || score > best.score) best = { cut: { members: three, side, other }, score };
  }
  return best?.cut ?? null;
}

/** The selected member, or a diagonal of the middle panel. */
interface Target { target: number | null; cut: Cut | null; chosen: boolean }
export function sectionTarget(ctx: MethodContext, reactionsKnown: boolean): Target {
  const { pm } = ctx;
  const sel = ctx.selection.members.find((id) => pm.members.has(id));
  if (sel !== undefined) return { target: sel, cut: findCut(pm, sel, reactionsKnown), chosen: true };
  const xs = [...pm.nodes.values()].map((n) => n.x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const mid = (m: PMember) => (pm.nodes.get(m.i)!.x + pm.nodes.get(m.j)!.x) / 2;
  const inclined = (m: PMember) => Math.abs(m.c) > 1e-6 && Math.abs(m.s) > 1e-6;
  const cands = [...pm.members.values()].sort((a, b) => {
    const ia = inclined(a) ? 0 : 1, ib = inclined(b) ? 0 : 1;
    return ia - ib || Math.abs(mid(a) - cx) - Math.abs(mid(b) - cx) || a.id - b.id;
  });
  for (const m of cands) { const cut = findCut(pm, m.id, reactionsKnown); if (cut) return { target: m.id, cut, chosen: false }; }
  return { target: null, cut: null, chosen: false };
}

export function sectionsApplies(ctx: MethodContext): Applicability {
  const base = determinateTruss(ctx);
  if (!base.ok) return base;
  const t = sectionTarget(ctx, solveGlobal(ctx.pm) !== null);
  if (!t.cut) return t.target !== null && t.chosen ? refuse(`${P}req.noCutFor`, { m: ctx.pm.members.get(t.target)!.name }) : refuse(`${P}req.noCut`);
  return { ok: true };
}

/** The cut drawn through the midpoints of the three cut members, a little past both ends. */
function cutLine(pm: PlaneModel, ids: number[]): { a: { x: number; z: number }; b: { x: number; z: number } } {
  const mids = ids.map((id) => { const m = pm.members.get(id)!; const a = pm.nodes.get(m.i)!, b = pm.nodes.get(m.j)!; return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }; });
  let pa = mids[0], pb = mids[1], d = -1;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const dd = Math.hypot(mids[i].x - mids[j].x, mids[i].z - mids[j].z); if (dd > d) { d = dd; pa = mids[i]; pb = mids[j]; } }
  const ux = (pb.x - pa.x) / (d || 1), uz = (pb.z - pa.z) / (d || 1);
  const ext = 0.25 * (d || 1);
  const a = { x: pa.x - ux * ext, z: pa.z - uz * ext }, b = { x: pb.x + ux * ext, z: pb.z + uz * ext };
  return a.z > b.z ? { a: b, b: a } : { a, b };
}

function cutSketch(pm: PlaneModel, cut: Cut, target: number, comps: RComp[], known: Known | null, snap: (v: number) => number, values?: Known): Sketch {
  const sk = sketchOf(pm);
  const cutSet = new Set(cut.members);
  sk.members = sk.members.map((mm) => {
    if (cutSet.has(mm.id)) return { ...mm, style: mm.id === target ? 'highlight' as const : 'solid' as const, color: 'unknown' as const };
    const inSide = cut.side.has(mm.i) && cut.side.has(mm.j);
    return { ...mm, style: inSide ? 'solid' as const : 'faint' as const };
  });
  sk.supports = (sk.supports ?? []).filter((s) => cut.other.has(s.node));
  const forces: NonNullable<Sketch['forces']> = [];
  for (const id of cut.members) {
    const m = pm.members.get(id)!;
    const near = cut.side.has(m.i) ? m.i : m.j;
    const e = away(m, near);
    const n0 = pm.nodes.get(near)!;
    const t = 0.62 * m.L;
    const v = values?.get(nId(id));
    forces.push({ x: n0.x + e.x * t, z: n0.z + e.z * t, fx: e.x, fz: e.z, label: v === undefined ? nPlain(pm, m) : `${nPlain(pm, m)} = ${numText(snap(v))}`, color: v === undefined ? 'unknown' : 'accent' });
  }
  sk.forces = [...forces, ...loadForces(pm, cut.side), ...reactionForces(pm, comps, known, cut.side)];
  sk.cut = { ...cutLine(pm, cut.members), label: 's–s' };
  return sk;
}

export function buildSections(ctx: MethodContext): StepDoc {
  const { pm } = ctx;
  const S = forceScale(pm);
  const snap = snapper(S);
  const comps = reactionComps(pm);
  const gs = solveGlobal(pm);
  const t = sectionTarget(ctx, gs !== null);
  const target = pm.members.get(t.target!)!;
  const cut = t.cut!;
  const known: Known = new Map(gs ? gs.values : []);
  const cms = cut.members.map((id) => pm.members.get(id)!);

  const hl = structureSketch(pm);
  hl.members = hl.members.map((mm) => (mm.id === target.id ? { ...mm, style: 'highlight' as const, label: target.name } : mm));
  const intro: Block[] = [
    { kind: 'p', text: tx(`${P}sections.intro`) },
    { kind: 'p', text: tx(`${P}signTension`), detail: true },
    { kind: 'p', text: tx(t.chosen ? `${P}sections.targetSelected` : `${P}sections.targetDefault`, { m: target.name }) },
    { kind: 'p', text: tx(`${P}sections.changeTarget`), detail: true },
    { kind: 'fig', sketch: hl, caption: tx(`${P}sections.structureCaption`, { m: target.name }) },
    { kind: 'p', text: tx('steps.common.units') },
  ];
  const steps: Step[] = [{ title: tx('steps.common.classification'), blocks: classificationBlocks(pm, `${P}classify.stabilitySections`) }];

  const sideHasSupports = [...cut.side].some((id) => pm.supports.has(id));
  if (gs) steps.push({ title: tx('steps.common.reactions'), blocks: reactionBlocks(pm, gs, snap) });
  else steps.push({ title: tx('steps.common.reactions'), blocks: [{ kind: 'p', text: tx(`${P}sections.noReactionsNeeded`) }] });

  const sideNames = pm.nodeOrder.filter((id) => cut.side.has(id)).map((id) => nodeName(pm, id)).join(', ');
  const cutBlocks: Block[] = [
    { kind: 'p', text: tx(`${P}sections.cutLead`, { a: cms[0].name, b: cms[1].name, c: cms[2].name }) },
    { kind: 'p', text: tx(`${P}sections.whyThree`), detail: true },
    { kind: 'fig', sketch: cutSketch(pm, cut, target.id, comps, gs ? known : null, snap), caption: tx(`${P}sections.cutCaption`) },
    { kind: 'p', text: tx(sideHasSupports ? `${P}sections.sideWithSupport` : `${P}sections.sideFree`, { joints: sideNames }) },
  ];
  steps.push({ title: tx(`${P}sections.cutTitle`), blocks: cutBlocks });

  // Ritter: one equation per cut member, with only that member's force in it.
  const ritter: Block[] = [{ kind: 'p', text: tx(`${P}sections.ritterLead`), detail: true }];
  const values: Known = new Map(known);
  let usedFx = false, usedFz = false;
  for (let k = 0; k < 3; k++) {
    const m = cms[k];
    const [o1, o2] = cms.filter((_, q) => q !== k);
    const near = cut.side.has(m.i) ? m.i : m.j;
    const e = away(m, near);
    const pNear = pm.nodes.get(near)!;
    const O = meet(pm, o1, o2);
    const sub: Block[] = [];
    const nTerms = (coefFor: (mm: PMember) => number): ETerm[] => cms.map((mm) => ({ unk: nId(mm.id), sym: nTex(pm, mm), coef: coefFor(mm) }));
    if (O) {
      const oName = onNode(pm, O);
      const Op: GPoint = { ...O, name: oName };
      sub.push({ kind: 'p', text: oName ? tx(`${P}sections.pointAtJoint`, { a: o1.name, b: o2.name, p: oName }) : tx(`${P}sections.pointAt`, { a: o1.name, b: o2.name, x: numText(O.x), z: numText(O.z) }) });
      const armOf = (mm: PMember) => {
        const nr = cut.side.has(mm.i) ? mm.i : mm.j;
        const ee = away(mm, nr), pn = pm.nodes.get(nr)!;
        const a = (pn.x - O.x) * ee.z - (pn.z - O.z) * ee.x;
        return Math.abs(a) < 1e-9 ? 0 : a;
      };
      const arm = armOf(m);
      sub.push({
        kind: 'calc', label: tx(`${P}sections.arm`, { m: m.name }),
        formula: `d = \\left| (x_{\\mathrm{${pNear.name}}} - x_O)\\sin\\alpha - (z_{\\mathrm{${pNear.name}}} - z_O)\\cos\\alpha \\right|`,
        subst: `d = \\left| (${num(pNear.x)} - ${par(O.x)}) \\cdot ${par(e.z)} - (${num(pNear.z)} - ${par(O.z)}) \\cdot ${par(e.x)} \\right|`,
        result: `\\boxed{d = ${num(Math.abs(arm))}\\ \\mathrm{m}}`,
      });
      const mEq = momentEq(pm, comps, O, cut.side);
      const eq: Eq = { terms: [...nTerms(armOf), ...mEq.terms], formula: '' };
      const before = new Map(values);
      const v = -knownSum(eq, values) / arm;
      values.set(nId(m.id), v);
      const g: GEq = { kind: 'M', O: Op, eq };
      sub.push({
        kind: 'calc', label: geqLabel(g),
        formula: `\\textstyle\\sum ${mSym(Op)} = 0:\\quad ${nTex(pm, m)}\\,(\\pm d) + \\sum P\\,d_P + \\sum R\\,d_R = 0`,
        subst: `${substTex(eq, before, snap)} = 0`,
        result: `\\boxed{${nTex(pm, m)} = ${num(snap(v))}\\ ${KN}}`,
      });
    } else {
      // The other two are parallel: the forces across them give the equation.
      let nx = -o1.s, nz = o1.c;
      if (Math.abs(nz) >= Math.abs(nx) ? nz < 0 : nx < 0) { nx = -nx; nz = -nz; }
      const isZ = Math.abs(nx) < 1e-9, isX = Math.abs(nz) < 1e-9;
      if (isZ) usedFz = true;
      if (isX) usedFx = true;
      sub.push({ kind: 'p', text: tx(`${P}sections.parallel`, { a: o1.name, b: o2.name }) });
      const terms: ETerm[] = [...nTerms((mm) => { const nr = cut.side.has(mm.i) ? mm.i : mm.j; const ee = away(mm, nr); const c = ee.x * nx + ee.z * nz; return Math.abs(c) < 1e-12 ? 0 : c; })];
      for (const t2 of forceEq(pm, comps, 'x', cut.side).terms) terms.push({ ...t2, coef: t2.coef * nx });
      for (const t2 of forceEq(pm, comps, 'z', cut.side).terms) terms.push({ ...t2, coef: t2.coef * nz });
      const eq: Eq = { terms: terms.filter((q) => Math.abs(q.coef) > 1e-12), formula: '' };
      const before = new Map(values);
      const v = -knownSum(eq, values) / coefOf(eq, nId(m.id));
      values.set(nId(m.id), v);
      const head = isZ ? '\\textstyle\\sum F_z = 0' : isX ? '\\textstyle\\sum F_x = 0' : '\\textstyle\\sum F_n = 0';
      sub.push({
        kind: 'calc', label: isZ ? tx(`${P}eq.sumFz`) : isX ? tx(`${P}eq.sumFx`) : tx(`${P}eq.sumFn`, { x: numText(nx), z: numText(nz) }),
        formula: `${head}:\\quad ${nTex(pm, m)}\\,(\\hat{\\mathbf e}\\cdot\\hat{\\mathbf n}) + \\sum (P + R)\\cdot\\hat{\\mathbf n} = 0`,
        subst: `${substTex(eq, before, snap)} = 0`,
        result: `\\boxed{${nTex(pm, m)} = ${num(snap(v))}\\ ${KN}}`,
      });
    }
    const vv = snap(values.get(nId(m.id))!);
    sub.push({ kind: 'p', text: tx(vv > 0 ? `${P}sections.isTension` : vv < 0 ? `${P}sections.isCompression` : `${P}sections.isZero`, { m: m.name }) });
    ritter.push({ kind: 'sub', title: tx(`${P}sections.forMember`, { m: m.name }), blocks: sub });
  }
  steps.push({ title: tx(`${P}sections.ritterTitle`), blocks: ritter });

  // The check: the side's force equations not used, with all three forces known.
  const checks: Block[] = [{ kind: 'p', text: tx(`${P}sections.checkLead`) }];
  const cutTerms = (dir: Dir): ETerm[] => cms.map((mm) => { const nr = cut.side.has(mm.i) ? mm.i : mm.j; const ee = away(mm, nr); const c = dir === 'x' ? ee.x : ee.z; return { unk: nId(mm.id), sym: nTex(pm, mm), coef: Math.abs(c) < 1e-12 ? 0 : c, f: `${nTex(pm, mm)}${dir === 'x' ? '\\cos' : '\\sin'}\\alpha_{\\mathrm{${memberKey(pm, mm)}}}` }; });
  for (const dir of ['x', 'z'] as const) {
    if ((dir === 'x' && usedFx) || (dir === 'z' && usedFz)) continue;
    const fe = forceEq(pm, comps, dir, cut.side);
    const terms = [...cutTerms(dir), ...fe.terms];
    const eq: Eq = { terms, formula: formulaOf(terms, `\\textstyle\\sum P_${dir}`) };
    checks.push({ kind: 'calc', label: tx(dir === 'x' ? `${P}eq.checkFx` : `${P}eq.checkFz`), formula: `\\textstyle\\sum F_${dir} = 0:\\quad ${eq.formula} = 0`, subst: substTex(eq, values, snap), result: num(snap(knownSum(eq, values))), check: '= 0\\ \\checkmark' });
  }
  checks.push({ kind: 'fig', sketch: cutSketch(pm, cut, target.id, comps, gs ? known : null, snap, values), caption: tx(`${P}sections.solvedCaption`) });
  steps.push({ title: tx(`${P}sections.checkTitle`), blocks: checks });

  const N = new Map(cut.members.map((id) => [id, values.get(nId(id))!]));
  const out = resultSteps(ctx, N, known, gs ? comps : [], snap, cut.members, []);
  if (!gs) out.splice(1, 1);
  steps.push(...out);
  return { method: 'sections', title: tx('steps.m.sections.title'), subtitle: tx(`${P}subtitle`), intro, steps };
}
