/**
 * The method of joints on a statically determinate plane truss: reactions
 * from global equilibrium, then joint by joint in an order where every joint
 * has at most two unknown member forces left, and the joints that are left
 * over as checks.
 */
import type { MethodContext } from './registry';
import type { Applicability, Block, Cell, Step, StepDoc, Tex } from './doc';
import { tx } from './doc';
import { num, numText } from './format';
import type { PlaneModel } from './plane-model';
import { membersAt } from './plane-model';
import type { Sketch } from './sketch';
import type { Known, Dir, RComp } from './truss-common';
import {
  KN, P, nodeName, nTex, nPlain, rTex, rPlain, nId,
  away, otherEnd, reactionComps, forceScale, unknownsIn, coefOf, knownSum, hasTerms,
  substTex, snapper, loadForces, reactionForces, structureSketch, refuse, determinateTruss, jointEqs,
  solveGlobal, reactionBlocks, classificationBlocks, resultSteps,
} from './truss-common';

// ─── The method of joints ────────────────────────────────────────────

interface JointPlan { order: Array<{ node: number; unknowns: string[] }>; checks: number[] }

/**
 * An order of the joints where each has at most two unknowns left (member
 * forces, and reactions when global equilibrium did not give them): the
 * leftmost such joint each time (lowest first when two share an x), so the
 * sweep crosses the truss the way a hand calculation does. Null when the
 * procedure gets stuck.
 */
export function planJoints(pm: PlaneModel, start: Set<string>): JointPlan | null {
  const known = new Set(start);
  const all = [...pm.memberOrder.map(nId), ...reactionComps(pm).map((c) => c.id)];
  const done = new Set<number>();
  const order: JointPlan['order'] = [];
  const eqs = new Map(pm.nodeOrder.map((id) => [id, jointEqs(pm, id)]));
  const unknownAt = (id: number) => {
    const e = eqs.get(id)!;
    return [...new Set([...e.x.terms, ...e.z.terms].filter((t) => t.unk !== undefined && !known.has(t.unk)).map((t) => t.unk!))];
  };
  const solvable = (id: number, u: string[]) => {
    const e = eqs.get(id)!;
    const cx = u.map((k) => coefOf(e.x, k)), cz = u.map((k) => coefOf(e.z, k));
    if (u.length === 1) return Math.max(Math.abs(cx[0]), Math.abs(cz[0])) > 1e-6;
    return Math.abs(cx[0] * cz[1] - cx[1] * cz[0]) > 1e-6;
  };
  const sweep = [...pm.nodeOrder].sort((a, b) => {
    const na = pm.nodes.get(a)!, nb = pm.nodes.get(b)!;
    return na.x - nb.x || na.z - nb.z || a - b;
  });
  while (all.some((u) => !known.has(u))) {
    const next = sweep.find((id) => {
      if (done.has(id)) return false;
      const u = unknownAt(id);
      return u.length >= 1 && u.length <= 2 && solvable(id, u);
    });
    if (next === undefined) return null;
    const u = unknownAt(next);
    order.push({ node: next, unknowns: u });
    for (const k of u) known.add(k);
    done.add(next);
  }
  return { order, checks: sweep.filter((id) => !done.has(id)) };
}

/** A joint's free body: stubs of its members with their forces drawn as tensions, its load and its reactions. */
function jointSketch(pm: PlaneModel, node: number, known: Known, comps: RComp[], snap: (v: number) => number, current: Set<string>): Sketch {
  const n = pm.nodes.get(node)!;
  const nodes: Sketch['nodes'] = [{ id: node, x: n.x, z: n.z, label: n.name }];
  const members: Sketch['members'] = [];
  const forces: NonNullable<Sketch['forces']> = [];
  for (const m of membersAt(pm, node)) {
    const e = away(m, node);
    const tip = { x: n.x + e.x, z: n.z + e.z };
    const stubId = -1 - m.id;
    nodes.push({ id: stubId, x: tip.x, z: tip.z, label: nodeName(pm, otherEnd(m, node)) });
    const v = known.get(nId(m.id));
    const unknown = v === undefined || current.has(nId(m.id));
    members.push({ id: m.id, i: node, j: stubId, style: unknown ? 'solid' : 'faint' });
    forces.push({
      x: tip.x, z: tip.z, fx: e.x, fz: e.z,
      label: unknown ? nPlain(pm, m) : `${nPlain(pm, m)} = ${numText(snap(v!))}`,
      color: unknown ? 'unknown' : 'accent',
    });
  }
  const loads = loadForces(pm, new Set([node]));
  const reac = reactionForces(pm, comps.filter((c) => c.node === node), new Map([...known].filter(([k]) => !current.has(k))), new Set([node]));
  return { nodes, members, forces: [...forces, ...loads, ...reac], height: 220 };
}

function cosTable(pm: PlaneModel, node: number): Block {
  const rows: Cell[][] = membersAt(pm, node).map((m) => {
    const e = away(m, node);
    return [m.name, nodeName(pm, otherEnd(m, node)), { tex: num(e.x) }, { tex: num(e.z) }];
  });
  return { kind: 'table', head: [tx('steps.common.member'), tx(`${P}joints.towards`), { tex: '\\cos\\alpha' }, { tex: '\\sin\\alpha' }], rows, caption: tx(`${P}joints.cosCaption`) };
}

const symOf = (pm: PlaneModel, id: string): Tex => {
  if (id.startsWith('n')) return nTex(pm, pm.members.get(Number(id.slice(1)))!);
  const dir = id.slice(-1) as Dir;
  return rTex(pm, Number(id.slice(1, -1)), dir);
};
const nameOfUnknown = (pm: PlaneModel, id: string): string => {
  if (id.startsWith('n')) return nPlain(pm, pm.members.get(Number(id.slice(1)))!);
  return rPlain(pm, Number(id.slice(1, -1)), id.slice(-1) as Dir);
};

/**
 * The equations of one joint written and solved: the one with a single
 * unknown first when there is one, both together otherwise; an equation
 * with nothing left to find is a check.
 */
function solveJoint(pm: PlaneModel, node: number, unknowns: string[], known: Known, snap: (v: number) => number): { blocks: Block[]; solved: string[] } {
  const eqs = jointEqs(pm, node);
  const lab = { x: tx(`${P}eq.sumFx`), z: tx(`${P}eq.sumFz`) };
  const head = { x: '\\textstyle\\sum F_x = 0:\\quad ', z: '\\textstyle\\sum F_z = 0:\\quad ' };
  const blocks: Block[] = [];
  const unit = (u: string) => (u.startsWith('n') || u.startsWith('r') ? KN : '');
  const boxed = (u: string, v: number) => `\\boxed{${symOf(pm, u)} = ${num(snap(v))}\\ ${unit(u)}}`;
  const checkBlock = (d: Dir) => {
    const eq = eqs[d];
    if (!hasTerms(eq)) return;
    const res = knownSum(eq, known);
    blocks.push({ kind: 'calc', label: tx(d === 'x' ? `${P}eq.checkFx` : `${P}eq.checkFz`), formula: `${head[d]}${eq.formula} = 0`, subst: substTex(eq, known, snap), result: num(snap(res)), check: '= 0\\ \\checkmark' });
  };
  const solveIn = (d: Dir, u: string) => {
    const eq = eqs[d];
    const before = new Map(known);
    const v = -knownSum(eq, known) / coefOf(eq, u);
    known.set(u, v);
    blocks.push({ kind: 'calc', label: lab[d], formula: `${head[d]}${eq.formula} = 0`, subst: `${substTex(eq, before, snap)} = 0`, result: boxed(u, v) });
  };

  if (unknowns.length === 1) {
    const u = unknowns[0];
    const d: Dir = Math.abs(coefOf(eqs.x, u)) >= Math.abs(coefOf(eqs.z, u)) ? 'x' : 'z';
    solveIn(d, u);
    checkBlock(d === 'x' ? 'z' : 'x');
    return { blocks, solved: unknowns };
  }
  const [u1, u2] = unknowns;
  const ux = unknownsIn(eqs.x, known), uz = unknownsIn(eqs.z, known);
  if (ux.length === 1 || uz.length === 1) {
    const d1: Dir = ux.length === 1 ? 'x' : 'z';
    const d2: Dir = d1 === 'x' ? 'z' : 'x';
    solveIn(d1, (d1 === 'x' ? ux : uz)[0]);
    const rest = unknownsIn(eqs[d2], known);
    if (rest.length === 1) solveIn(d2, rest[0]);
    return { blocks, solved: unknowns };
  }
  // Both equations hold both unknowns: write each reduced, then solve the pair.
  const a = [[coefOf(eqs.x, u1), coefOf(eqs.x, u2)], [coefOf(eqs.z, u1), coefOf(eqs.z, u2)]];
  const b = [-knownSum(eqs.x, known), -knownSum(eqs.z, known)];
  const red = (r: number) => `${num(a[r][0])}\\,${symOf(pm, u1)} ${a[r][1] < 0 ? '-' : '+'} ${num(Math.abs(a[r][1]))}\\,${symOf(pm, u2)} = ${num(snap(b[r]))}`;
  for (const [r, d] of [[0, 'x'], [1, 'z']] as const) {
    blocks.push({ kind: 'calc', label: lab[d], formula: `${head[d]}${eqs[d].formula} = 0`, subst: `${substTex(eqs[d], known, snap)} = 0`, result: red(r) });
  }
  const det = a[0][0] * a[1][1] - a[0][1] * a[1][0];
  const v1 = (b[0] * a[1][1] - a[0][1] * b[1]) / det;
  const v2 = (a[0][0] * b[1] - b[0] * a[1][0]) / det;
  known.set(u1, v1); known.set(u2, v2);
  blocks.push({
    kind: 'calc', label: tx(`${P}joints.pair`),
    formula: `\\begin{cases} ${red(0)} \\\\ ${red(1)} \\end{cases}`,
    result: `${boxed(u1, v1)}, \\qquad ${boxed(u2, v2)}`,
  });
  return { blocks, solved: unknowns };
}

export function buildJoints(ctx: MethodContext): StepDoc {
  const { pm } = ctx;
  const S = forceScale(pm);
  const snap = snapper(S);
  const comps = reactionComps(pm);
  const gs = solveGlobal(pm);
  const known: Known = new Map(gs ? gs.values : []);
  const plan = planJoints(pm, new Set(known.keys()))!;

  const intro: Block[] = [
    { kind: 'p', text: tx(`${P}joints.intro`) },
    { kind: 'p', text: tx(`${P}signTension`), detail: true },
    { kind: 'fig', sketch: structureSketch(pm), caption: tx('steps.common.structureCaption') },
    { kind: 'p', text: tx('steps.common.units') },
  ];
  const steps: Step[] = [{ title: tx('steps.common.classification'), blocks: classificationBlocks(pm, `${P}classify.stability`) }];

  if (gs) steps.push({ title: tx('steps.common.reactions'), blocks: reactionBlocks(pm, gs, snap) });
  else steps.push({ title: tx('steps.common.reactions'), blocks: [{ kind: 'p', text: tx(`${P}reactions.atJoints`, { r: comps.length }) }] });

  // The order, and why it starts where it does.
  const first = plan.order[0];
  const orderRows: Cell[][] = plan.order.map((o, k) => [String(k + 1), nodeName(pm, o.node), { tex: o.unknowns.map((u) => symOf(pm, u)).join(',\\ ') }]);
  steps.push({
    title: tx(`${P}joints.orderTitle`),
    blocks: [
      { kind: 'p', text: tx(first.unknowns.length === 2 ? `${P}joints.first2` : `${P}joints.first1`, { j: nodeName(pm, first.node), u: first.unknowns.map((u) => nameOfUnknown(pm, u)).join(', ') }) },
      { kind: 'p', text: tx(`${P}joints.orderRule`), detail: true },
      { kind: 'table', head: [tx(`${P}joints.orderNo`), tx('steps.common.joint'), tx(`${P}joints.unknowns`)], rows: orderRows, caption: tx(`${P}joints.orderCaption`) },
    ],
  });

  const zeros: string[] = [];
  const jointBlocks: Block[] = [{ kind: 'p', text: tx(`${P}joints.cosLead`), detail: true }];
  for (const o of plan.order) {
    const current = new Set(o.unknowns);
    const fig: Block = { kind: 'fig', sketch: jointSketch(pm, o.node, known, comps, snap, current), caption: tx(`${P}joints.fbd`, { j: nodeName(pm, o.node) }) };
    const r = solveJoint(pm, o.node, o.unknowns, known, snap);
    const sub: Block[] = [fig, cosTable(pm, o.node), ...r.blocks];
    for (const u of o.unknowns) {
      if (u.startsWith('n') && Math.abs(snap(known.get(u)!)) === 0) {
        const m = pm.members.get(Number(u.slice(1)))!;
        zeros.push(m.name);
        sub.push({ kind: 'note', tone: 'info', text: tx(`${P}joints.zeroForce`, { m: m.name }) });
      }
    }
    jointBlocks.push({ kind: 'sub', title: tx(`${P}joints.jointTitle`, { j: nodeName(pm, o.node) }), blocks: sub });
  }
  if (zeros.length) jointBlocks.push({ kind: 'p', text: tx(`${P}joints.zeroRule`), detail: true });
  steps.push({ title: tx(`${P}joints.solveTitle`), blocks: jointBlocks });

  // The joints left over: every equation there is a check.
  const checkBlocks: Block[] = [{ kind: 'p', text: tx(plan.checks.length ? `${P}joints.checkLead` : `${P}joints.checkNone`) }];
  for (const id of plan.checks) {
    const eqs = jointEqs(pm, id);
    const blocks: Block[] = [{ kind: 'fig', sketch: jointSketch(pm, id, known, comps, snap, new Set()), caption: tx(`${P}joints.fbd`, { j: nodeName(pm, id) }) }];
    for (const [d, lab] of [['x', `${P}eq.checkFx`], ['z', `${P}eq.checkFz`]] as const) {
      const eq = eqs[d];
      if (!hasTerms(eq)) continue;
      blocks.push({ kind: 'calc', label: tx(lab), formula: `\\textstyle\\sum F_${d} = 0:\\quad ${eq.formula} = 0`, subst: substTex(eq, known, snap), result: num(snap(knownSum(eq, known))), check: '= 0\\ \\checkmark' });
    }
    checkBlocks.push({ kind: 'sub', title: tx(`${P}joints.jointTitle`, { j: nodeName(pm, id) }), blocks });
  }
  if (plan.checks.length) checkBlocks.push({ kind: 'note', tone: 'ok', text: tx(`${P}joints.checkOk`) });
  steps.push({ title: tx(`${P}joints.checkTitle`), blocks: checkBlocks });

  const N = new Map(pm.memberOrder.map((id) => [id, known.get(nId(id)) ?? 0]));
  steps.push(...resultSteps(ctx, N, known, comps, snap, pm.memberOrder, zeros));
  return { method: 'joints', title: tx('steps.m.joints.title'), subtitle: tx(`${P}subtitle`), intro, steps };
}

export function jointsApplies(ctx: MethodContext): Applicability {
  const base = determinateTruss(ctx);
  if (!base.ok) return base;
  const gs = solveGlobal(ctx.pm);
  if (!planJoints(ctx.pm, new Set(gs ? gs.values.keys() : []))) return refuse(`${P}req.noJointOrder`);
  return { ok: true };
}
