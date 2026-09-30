/**
 * The matrix method written with a compatibility matrix, p = A q,
 * K = Aᵀ k A, for plane trusses and frames alike (the numbers come from
 * truss-compatibility-solve). One switchable assumption: frame members that
 * keep their length (the classical hand formulation), with the dependent
 * joint displacements following the independent ones.
 */
import type { MethodContext, MethodOption } from './registry';
import type { Applicability, Block, Cell, CompareRow, Step, StepDoc, Tex } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import type { PlaneModel, PMember } from './plane-model';
import { hasSpecialSupports, hasThermal, loadsOn, membersAt, nodalLoadAt } from './plane-model';
import { sketchOf } from './sketch';
import { fixedEnd, fixedEndBlocks } from './fem';
import type { ETerm, Eq, Known } from './truss-common';
import {
  EPS, KN, KNM, MM, P, nodeName, memberKey, nTex,
  rTex, reactionComps, forceScale, snapper, structureSketch, freeBodySketch,
  axialSketch, memberForceTable, reactionTable, refuse, sizeOf, substTex,
} from './truss-common';
import type { Compat, Dof, DofKind } from './truss-compatibility-solve';
import { compatSolve, memberShape, momentAlong, rigidAt } from './truss-compatibility-solve';

export { compatSolve, momentAlong };

// ─── The compatibility-matrix method ─────────────────────────────────

const MAX_DOFS = 40;

/** Frame members that keep their length: off by default, so the document matches the matrix solve. */
export const INEXT_OPTION: MethodOption = { id: 'inextensible', default: false };
const inextOn = (ctx: MethodContext) => ctx.options?.[INEXT_OPTION.id] ?? INEXT_OPTION.default;

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

/**
 * The rigid members' axial forces from the joints: at each free translation,
 * the member end forces already known (shears, truss members) and the load,
 * plus the unknown N entering along the member axes, add up to zero.
 */
function axialBlocks(pm: PlaneModel, cm: Compat, snap: (v: number) => number): Block[] {
  const out: Block[] = [{ kind: 'p', text: tx(`${P}compat.axialLead`) }, { kind: 'p', text: tx(`${P}compat.axialWhy`), detail: true }];
  const none: Known = new Map();
  for (const row of cm.axialRows) {
    const d = cm.all[row.dof];
    const dir = d.kind === 'ux' ? 'x' : 'z';
    const terms: ETerm[] = [...row.coefs].map(([id, c]) => ({ unk: `n${id}`, sym: nTex(pm, pm.members.get(id)!), coef: c }));
    if (Math.abs(snap(row.known)) > 0) terms.push({ sym: '', val: row.known, coef: 1 });
    const eq: Eq = { terms, formula: '' };
    const single = row.coefs.size === 1 ? [...row.coefs][0] : null;
    out.push({
      kind: 'calc', label: tx(`${P}compat.axialEq`, { n: nodeName(pm, d.node), d: dir }),
      formula: `\\textstyle\\sum F_${dir} = \\sum_k F^{(k)}_${dir} - P_{\\mathrm{${nodeName(pm, d.node)}}${dir}} = 0`,
      subst: `${substTex(eq, none, snap)} = 0`,
      result: single ? `\\boxed{${nTex(pm, pm.members.get(single[0])!)} = ${num(snap(cm.ends.get(single[0])!.Ni))}\\ ${KN}}` : `${substTex(eq, none, snap)} = 0`,
    });
  }
  const rigid = pm.memberOrder.filter((id) => cm.rigid.has(id));
  out.push({ kind: 'calc', label: tx(`${P}compat.axialSolved`), formula: '\\mathbf C^{\\mathsf T}\\,\\mathbf N = -\\mathbf r', result: rigid.map((id) => `\\boxed{${nTex(pm, pm.members.get(id)!)} = ${num(snap(cm.ends.get(id)!.Ni))}\\ ${KN}}`).join(',\\ ') });
  return out;
}

export function buildCompat(ctx: MethodContext): StepDoc {
  const { pm, ref } = ctx;
  const asked = inextOn(ctx);
  const cm = compatSolve(pm, asked)!;
  const on = cm.inext === 'on';
  const S = Math.max(1, ...cm.Q.map(Math.abs), ...cm.QjAll.map(Math.abs), ...cm.QeAll.map(Math.abs), forceScale(pm));
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
  // The assumption, as applied, or why it could not be.
  if (asked) intro.push({ kind: 'note', tone: on ? 'info' : 'warn', text: tx(`${P}compat.inext.${cm.inext}`) });
  if (on && members.some((m) => !cm.rigid.has(m.id))) intro.push({ kind: 'note', tone: 'info', text: tx(`${P}compat.inext.mixed`) });
  const steps: Step[] = [];
  const depTex = (i: number) => `${dofTex(pm, cm.all[i])}${cm.deps.includes(i) ? '^{\\dagger}' : ''}`;
  /** A dependent displacement in terms of q: Σ T_ij q_j. */
  const relation = (i: number): Tex => {
    const parts = cm.dofs.map((_, j) => cm.T[i][j]).map((c, j) => ({ c, j })).filter((t) => t.c !== 0)
      .map(({ c, j }, k) => {
        const qj = `q_{${j + 1}}`;
        const body = Math.abs(Math.abs(c) - 1) < 1e-12 ? qj : `${num(Math.abs(c))}\\,${qj}`;
        return c < 0 ? (k === 0 ? `-${body}` : ` - ${body}`) : (k === 0 ? body : ` + ${body}`);
      });
    return parts.length ? parts.join('') : '0';
  };

  // 1. Global coordinates.
  const dofSketch = sketchOf(pm);
  dofSketch.dofs = cm.dofs.map((d, k) => ({ node: d.node, kind: d.kind, label: String(k + 1) }));
  // The dependent displacements that move are drawn too, marked †.
  if (on) for (const i of cm.deps) if (relation(i) !== '0') dofSketch.dofs.push({ node: cm.all[i].node, kind: cm.all[i].kind, label: '†', color: 'muted' });
  const qBlocks1: Block[] = [
    { kind: 'p', text: on ? tx(`${P}compat.qLeadInext`, { n, d: cm.deps.length }) : tx(`${P}compat.qLead`, { n }) },
    { kind: 'p', text: tx(hasFrame ? `${P}compat.qWhyFrame` : `${P}compat.qWhyTruss`), detail: true },
  ];
  if (on) qBlocks1.push({ kind: 'p', text: tx(`${P}compat.qWhyInext`), detail: true });
  qBlocks1.push(
    { kind: 'fig', sketch: dofSketch, caption: tx(on ? `${P}compat.qCaptionInext` : `${P}compat.qCaption`) },
    { kind: 'table', head: [{ tex: 'q_i' }, tx('steps.common.node'), tx(`${P}compat.direction`)], rows: cm.dofs.map((d, k) => [{ tex: `q_{${k + 1}}` }, nodeName(pm, d.node), dofWord(d)]), caption: tx(`${P}compat.qTable`) },
  );
  if (on) {
    qBlocks1.push({ kind: 'eq', tex: '\\mathbf u = \\mathbf T\\,\\mathbf q', note: tx(`${P}compat.uTq`) });
    qBlocks1.push({ kind: 'table', head: [tx(`${P}compat.depDof`), tx('steps.common.node'), tx(`${P}compat.direction`), tx(`${P}compat.depRelation`)],
      rows: cm.deps.map((i) => [{ tex: depTex(i) }, nodeName(pm, cm.all[i].node), dofWord(cm.all[i]), { tex: `${depTex(i)} = ${relation(i)}` }]), caption: tx(`${P}compat.depTable`) });
  }
  steps.push({ title: tx(`${P}compat.qTitle`), blocks: qBlocks1 });

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
      { kind: 'p', text: tx(on ? `${P}compat.pLeadInext` : hasFrame ? `${P}compat.pLeadFrame` : `${P}compat.pLeadTruss`, { m: M }) },
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
    if (cm.rigid.has(m.id)) sub.push({ kind: 'p', text: tx(`${P}compat.kRigid`) });
    else sub.push({ kind: 'calc', label: tx(`${P}compat.kAxial`), formula: 'k_a = \\frac{EA}{L}', subst: `k_a = \\frac{${num(m.E)} \\cdot ${num(m.A)}}{${num(m.L)}}`, result: `\\boxed{k_a = ${num(m.EA / m.L)}\\ \\mathrm{kN/m}}` });
    if (kind === 'frame') {
      sub.push({ kind: 'calc', label: tx(`${P}compat.kBend`), formula: 'k_{11} = k_{22} = \\frac{4EI}{L}, \\qquad k_{12} = k_{21} = \\frac{2EI}{L}', subst: `k_{11} = \\frac{4 \\cdot ${num(m.EI)}}{${num(m.L)}}, \\qquad k_{12} = \\frac{2 \\cdot ${num(m.EI)}}{${num(m.L)}}`, result: `\\boxed{k_{11} = k_{22} = ${num((4 * m.EI) / m.L)}\\ \\mathrm{kN\\,m}}, \\qquad \\boxed{k_{12} = k_{21} = ${num((2 * m.EI) / m.L)}\\ \\mathrm{kN\\,m}}` });
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
    // The unit state: q_j = 1 and the dependent displacements it drags along (none when flexible).
    const unit = (node: number) => {
      const g = (kd: DofKind) => { const i = cm.allIndex.get(`${node}:${kd}`); return i === undefined ? 0 : cm.T[i][j]; };
      return { x: g('ux'), z: g('uz'), r: g('ry') };
    };
    // Drawn at a visible size: a tenth of the structure, or half a radian.
    const unitScale = d.kind === 'ry' ? 0.5 : 0.12 * size;
    const uAt = (node: number) => { const u = unit(node); return { x: u.x * unitScale, z: u.z * unitScale, r: u.r * unitScale }; };
    const moves = (node: number) => { const u = unit(node); return u.x !== 0 || u.z !== 0 || u.r !== 0; };
    const affected = members.filter((m) => moves(m.i) || moves(m.j));
    const sk = sketchOf(pm);
    const aff = new Set(affected.map((m) => m.id));
    sk.members = sk.members.map((mm) => ({ ...mm, style: aff.has(mm.id) ? 'solid' as const : 'faint' as const }));
    sk.deformed = affected.map((m) => ({ points: memberShape(pm, m, cm.kinds.get(m.id)!, uAt) }));
    sk.dofs = [{ node: d.node, kind: d.kind, label: `q${j + 1} = 1` }];
    const dragged = cm.deps.filter((i) => cm.T[i][j] !== 0);
    for (const i of dragged) sk.dofs.push({ node: cm.all[i].node, kind: cm.all[i].kind, label: `† ${numText(cm.T[i][j])}`, color: 'muted' });
    const sub: Block[] = [{ kind: 'fig', sketch: sk, caption: tx(`${P}compat.unitCaption`, { j: j + 1 }) }];
    for (const m of affected) {
      const ui = unit(m.i), uj = unit(m.j);
      const dux = uj.x - ui.x, duz = uj.z - ui.z;
      for (const r of cm.byMember.get(m.id)!) {
        const c = cm.coords[r];
        const v = cm.A[r][j];
        // A zero elongation shows the projection at work; a zero end rotation only adds noise.
        if (c.local !== 3 && v === 0) continue;
        const a = nodeName(pm, m.i), b = nodeName(pm, m.j);
        if (c.local === 3) {
          if (dux === 0 && duz === 0) continue;
          sub.push({ kind: 'calc', label: tx(`${P}compat.elong`, { m: m.name, p: r + 1 }), formula: `p_{${r + 1}} = \\delta_{\\mathrm{${a}${b}}} = \\Delta u_x\\cos\\alpha + \\Delta u_z\\sin\\alpha`, subst: `(${num(dux)})(${num(m.c)}) + (${num(duz)})(${num(m.s)})`, result: `\\boxed{A_{${r + 1},${j + 1}} = ${num(v)}}` });
        } else {
          const th = c.local === 1 ? ui.r : uj.r;
          const end = c.local === 1 ? a : b;
          sub.push({ kind: 'calc', label: tx(`${P}compat.rot`, { m: m.name, p: r + 1 }), formula: `p_{${r + 1}} = \\theta_{\\mathrm{${end}}} - \\psi, \\quad \\psi = \\frac{-\\Delta u_x\\sin\\alpha + \\Delta u_z\\cos\\alpha}{L}`, subst: `${num(th)} - \\frac{-(${num(dux)})(${num(m.s)}) + (${num(duz)})(${num(m.c)})}{${num(m.L)}}`, result: `\\boxed{A_{${r + 1},${j + 1}} = ${num(v)}}` });
        }
      }
    }
    const nz = cm.coords.map((_, r) => r).filter((r) => Math.abs(cm.A[r][j]) > 1e-14);
    sub.push({ kind: 'matrix', name: `\\mathbf A_{\\bullet ${j + 1}}`, rows: nz.map((r) => [cm.A[r][j]]), rowLabels: nz.map((r) => pLab[r]), colLabels: [qLab[j]], caption: tx(`${P}compat.columnCaption`, { j: j + 1 }) });
    const lead = dragged.length
      ? tx(`${P}compat.unitLeadInext`, { j: j + 1, n: nodeName(pm, d.node), list: dragged.map((i) => `${cm.all[i].kind === 'ux' ? 'u_x' : 'u_z'} ${nodeName(pm, cm.all[i].node)} = ${numText(cm.T[i][j])}`).join(', ') })
      : tx(`${P}compat.unitLead`, { j: j + 1, n: nodeName(pm, d.node) });
    aBlocks.push({ kind: 'sub', title: tx(`${P}compat.unitTitle`, { j: j + 1, n: nodeName(pm, d.node) }), blocks: [{ kind: 'p', text: lead }, ...sub] });
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
  if (on) {
    // Q_j = Σ_i T_ij Q*_i: what the loads on every free displacement do through unit state j.
    qBlocks.push({ kind: 'p', text: tx(`${P}compat.QInext`) });
    cm.dofs.forEach((_, j) => {
      const terms = cm.all.map((__, i) => i).filter((i) => cm.T[i][j] !== 0 && Math.abs(snap(cm.QjAll[i] + cm.QeAll[i])) > 0);
      if (!cm.all.some((__, i) => i !== cm.indep[j] && cm.T[i][j] !== 0)) return;
      const subst = terms.map((i) => `${par(cm.T[i][j])} \\cdot ${par(snap(cm.QjAll[i] + cm.QeAll[i]))}`).join(' + ') || '0';
      qBlocks.push({ kind: 'calc', label: tx(`${P}compat.QWork`, { j: j + 1 }), formula: `Q_{${j + 1}} = \\sum_i T_{i,${j + 1}}\\,Q^{*}_i`, subst: `Q_{${j + 1}} = ${subst}`, result: `\\boxed{Q_{${j + 1}} = ${num(snap(cm.Q[j]))}}` });
    });
  }
  qBlocks.push({ kind: 'matrix', name: '\\mathbf Q', rows: cm.Q.map((v) => [snap(v)]), rowLabels: qLab });
  steps.push({ title: tx(`${P}compat.QTitle`), blocks: qBlocks });

  // 7. Displacements.
  const umax = Math.max(1e-15, ...cm.all.map((d, k) => (d.kind === 'ry' ? 0 : Math.abs(cm.u[k]))));
  const mag = (0.08 * size) / umax;
  const disp = (node: number) => {
    const g = (kd: DofKind) => { const i = cm.allIndex.get(`${node}:${kd}`); return i === undefined ? 0 : cm.u[i]; };
    return { x: g('ux'), z: g('uz'), r: g('ry') };
  };
  const defSk = sketchOf(pm);
  defSk.members = defSk.members.map((mm) => ({ ...mm, style: 'faint' as const }));
  defSk.deformed = members.map((m) => ({ points: memberShape(pm, m, cm.kinds.get(m.id)!, (nd) => { const u = disp(nd); return { x: u.x * mag, z: u.z * mag, r: u.r * mag }; }) }));
  const dispRows: Cell[][] = pm.nodeOrder.filter((id) => membersAt(pm, id).length).map((id) => {
    const u = disp(id);
    const has = (kd: DofKind) => cm.allIndex.has(`${id}:${kd}`);
    return [nodeName(pm, id), has('ux') ? { tex: num(u.x * 1000) } : '0', has('uz') ? { tex: num(u.z * 1000) } : '0', ...(hasFrame ? [has('ry') ? { tex: num(u.r) } as Cell : '—'] : [])];
  });
  steps.push({
    title: tx(`${P}compat.solveTitle`),
    blocks: [
      { kind: 'eq', tex: '\\mathbf q = \\mathbf K^{-1}\\,\\mathbf Q', note: tx(`${P}compat.solveLead`) },
      { kind: 'matrix', name: '\\mathbf q', rows: cm.q.map((v) => [v]), rowLabels: qLab, caption: tx(`${P}compat.qUnits`) },
      ...(on ? [{ kind: 'eq' as const, tex: '\\mathbf u = \\mathbf T\\,\\mathbf q', note: tx(`${P}compat.depSolved`) }] : []),
      { kind: 'table', head: [tx('steps.common.node'), { tex: `u_x\\ [${MM}]` }, { tex: `u_z\\ [${MM}]` }, ...(hasFrame ? [{ tex: '\\theta\\ [\\mathrm{rad}]' } as Cell] : [])], rows: dispRows, caption: tx(`${P}compat.dispTable`) },
      { kind: 'fig', sketch: defSk, caption: tx(`${P}compat.deformedCaption`, { f: numText(mag, 3) }) },
    ],
  });

  // 8. Element deformations and forces.
  const Pb: Block[] = [
    { kind: 'eq', tex: '\\mathbf p = \\mathbf A\\,\\mathbf q', note: tx(`${P}compat.pqLead`) },
    { kind: 'eq', tex: '\\mathbf P = \\mathbf k\\,\\mathbf p + \\mathbf P^0', note: tx(`${P}compat.PLead`) },
  ];
  // One force written out: the first axial coordinate, or with every member rigid, the first end moment.
  const axialAt = cm.coords.findIndex((c) => c.local === 3);
  const exR = axialAt >= 0 ? axialAt : 0;
  const exC = cm.coords[exR], ex = pm.members.get(exC.member)!;
  const exRow = cm.k[exR].map((v, c) => ({ v, c })).filter((t) => t.v !== 0);
  Pb.push({
    kind: 'calc', label: tx(exC.local === 3 ? `${P}compat.PExample` : `${P}compat.PExampleM`, { m: ex.name }),
    formula: `P_{${exR + 1}} = ${exRow.map((t) => `k_{${exRow.length === 1 ? exR + 1 : `${exR + 1},${t.c + 1}`}}\\,p_{${t.c + 1}}`).join(' + ')} + P^0_{${exR + 1}}`,
    subst: `P_{${exR + 1}} = ${exRow.map((t) => `${num(t.v)} \\cdot ${par(cm.p[t.c])}`).join(' + ')} + ${par(snap(cm.P0[exR]))}`,
    result: `\\boxed{${forceMeaning(pm, ex, exC.local)} = ${num(snap(cm.P[exR]))}\\ ${exC.local === 3 ? KN : KNM}}`,
  });
  Pb.push({ kind: 'table', head: [{ tex: 'i' }, tx('steps.common.member'), tx(`${P}compat.meaning`), { tex: 'p_i' }, { tex: 'k\\,p' }, { tex: 'P^0_i' }, { tex: 'P_i' }],
    rows: cm.coords.map((c, r) => {
      const m = pm.members.get(c.member)!;
      const kp = cm.P[r] - cm.P0[r];
      return [{ tex: `${r + 1}` }, m.name, { tex: forceMeaning(pm, m, c.local) }, { tex: num(cm.p[r]) }, { tex: num(snap(kp)) }, { tex: num(snap(cm.P0[r])) }, { tex: num(snap(cm.P[r])) }];
    }), caption: tx(`${P}compat.PTable`) });
  steps.push({ title: tx(`${P}compat.PTitle`), blocks: Pb });

  // 8b. With the frame members rigid, their axial forces come from the joints.
  if (on) steps.push({ title: tx(`${P}compat.axialTitle`), blocks: axialBlocks(pm, cm, snap) });

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
    for (const [k, d] of cm.all.entries()) {
      const u = ref.displacements.get(d.node);
      if (!u) continue;
      if (d.kind === 'ry') rows.push({ label: depTex(k), method: cm.u[k], matrix: u.ry, unit: 'rad' });
      else rows.push({ label: depTex(k), method: cm.u[k] * 1000, matrix: (d.kind === 'ux' ? u.ux : u.uz) * 1000, unit: 'mm' });
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
  steps.push({ title: tx('steps.common.compare'), blocks: [{ kind: 'compare', rows, caption: tx(`${P}compareCaption`) }, { kind: 'p', text: tx(on ? `${P}compat.compareNoteInext` : `${P}compat.compareNote`) }] });

  return { method: 'compatibility', title: tx('steps.m.compatibility.title'), subtitle: tx(hasFrame ? `${P}compat.subtitleFrame` : `${P}subtitle`), intro, steps };
}
