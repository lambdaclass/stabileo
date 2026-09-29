/** The two moment-area theorems on a statically determinate straight beam. */
import type { MethodContext } from './registry';
import type { Applicability, Block, Cell, Step, StepDoc } from './doc';
import { tx } from './doc';
import { num, par, settle } from './format';
import { beamLine, type BeamLine } from './beam-line';
import { sketchOf } from './sketch';
import {
  U, TOL, no, OK, p, texCell, mm, gauss, intro, compareBlock, readBeam, momentOf, shearOf,
  intensityAt, loadTotals, loadTable, integrateCurvature, deformedSketch, beamDiagram, beamCompare,
  nodeTable, maxDeflection, beamRequirement, maxBlock, type BL,
} from './deformation-common';

export function momentAreaApplies(ctx: MethodContext): Applicability {
  const r = beamRequirement(ctx);
  if (!r.ok) return r.reason;
  const s = r.line.supports;
  const cantilever = s.length === 1 && s[0].kind === 'fixed';
  const simple = s.length === 2 && s.every((q) => q.kind !== 'fixed');
  if (!cantilever && !simple) return no('steps.m.momentArea.req.determinate');
  return OK;
}

interface Area { seg: [number, number]; shape: string; A: number; xc: number; tex: string; texNum: string }

export function buildMomentArea(ctx: MethodContext): StepDoc {
  const { pm } = ctx;
  const ref = ctx.ref!;
  const line = (beamLine(pm) as { ok: true; beam: BeamLine }).beam;
  const bm = readBeam(pm, line);
  const sup = bm.supports;
  const cantilever = sup.length === 1;
  const { W, Mw, Mc } = loadTotals(bm.loads);
  const steps: Step[] = [];

  // ── Reactions by statics.
  const Rmap = new Map<number, { R: number; M: number }>();
  const reactionBlocks: Block[] = [];
  const momentTerms = (x0: number) => bm.loads.map((l) => {
    if (l.kind === 'point') return `${par(l.P)}(${num(l.a)} - ${num(x0)})`;
    if (l.kind === 'couple') return `- ${par(l.M)}`;
    const R = ((l.wa + l.wb) / 2) * (l.b - l.a);
    const xc = Math.abs(l.wa + l.wb) < 1e-12 ? (l.a + l.b) / 2 : l.a + ((l.b - l.a) * (l.wa + 2 * l.wb)) / (3 * (l.wa + l.wb));
    return `${par(R)}(${num(xc)} - ${num(x0)})`;
  }).join(' + ').replace(/\+ -/g, '-');
  if (cantilever) {
    const F = sup[0];
    const R = W, M = Mw - W * F.x - Mc;
    Rmap.set(F.node, { R, M });
    reactionBlocks.push(
      { kind: 'calc', label: tx('steps.deformation.sumFz'), formula: `R_{${F.name}} = \\sum P`, subst: `R_{${F.name}} = ${num(W)}`, result: `\\boxed{R_{${F.name}} = ${num(R)}\\ ${U.kN}}` },
      { kind: 'calc', label: tx('steps.deformation.sumMAt', { n: F.name }), formula: `M_{${F.name}} = \\sum P_i\\,(x_i - x_{${F.name}}) - \\sum M_{0}`, subst: `M_{${F.name}} = ${momentTerms(F.x) || '0'}`, result: `\\boxed{M_{${F.name}} = ${num(M)}\\ ${U.kNm}}` },
    );
  } else {
    const [A, B] = sup;
    const LAB = B.x - A.x;
    const RB = (Mw - W * A.x - Mc) / LAB;
    const RA = W - RB;
    Rmap.set(A.node, { R: RA, M: 0 }); Rmap.set(B.node, { R: RB, M: 0 });
    const checkB = RA * (A.x - B.x) - (Mw - W * B.x - Mc);
    reactionBlocks.push(
      { kind: 'calc', label: tx('steps.deformation.sumMAt', { n: A.name }), formula: `R_{${B.name}} = \\frac{\\sum P_i\\,(x_i - x_{${A.name}}) - \\sum M_0}{x_{${B.name}} - x_{${A.name}}}`, subst: `R_{${B.name}} = \\frac{${momentTerms(A.x) || '0'}}{${num(LAB)}}`, result: `\\boxed{R_{${B.name}} = ${num(RB)}\\ ${U.kN}}` },
      { kind: 'calc', label: tx('steps.deformation.sumFz'), formula: `R_{${A.name}} = \\sum P - R_{${B.name}}`, subst: `R_{${A.name}} = ${num(W)} - ${par(RB)}`, result: `\\boxed{R_{${A.name}} = ${num(RA)}\\ ${U.kN}}`,
        check: `\\textstyle\\sum M_{${B.name}} = ${num(Math.abs(checkB) < 1e-9 * Math.max(1, Math.abs(Mw)) ? 0 : checkB)}\\ \\checkmark` },
    );
  }
  const items: BL[] = [...bm.loads];
  for (const s of sup) {
    const r = Rmap.get(s.node)!;
    items.push({ kind: 'point', a: s.x, P: -r.R });
    if (s.kind === 'fixed') items.push({ kind: 'couple', a: s.x, M: r.M });
  }
  steps.push({
    title: tx('steps.m.momentArea.s1'),
    blocks: [loadTable(bm), p('steps.m.momentArea.reactionsLead'), ...reactionBlocks,
      ...(line.hasAxialLoads ? [{ kind: 'note', tone: 'info', text: tx('steps.deformation.axialIgnored') } as Block] : [])],
  });

  // ── M(x) by segments and the M/EI diagram.
  const segs: Array<{ x1: number; x2: number; EI: number; M1: number; M2: number; V1: number; w1: number; w2: number }> = [];
  for (let k = 0; k + 1 < bm.breaks.length; k++) {
    const x1 = bm.breaks[k], x2 = bm.breaks[k + 1];
    const mid = (x1 + x2) / 2;
    const k1 = x1 + (x2 - x1) * 1e-12;
    const w1 = intensityAt(bm.loads, k1);
    const w2 = w1 + (x2 - x1) * ((intensityAt(bm.loads, mid) - w1) / (mid - k1));
    segs.push({ x1, x2, EI: bm.EIat(mid), M1: momentOf(items, x1, true), M2: momentOf(items, x2, false), V1: shearOf(items, x1, true), w1, w2 });
  }
  // Round-off of a moment that vanishes (a free end, a pinned support) reads as zero.
  const Mbig = Math.max(1e-12, ...segs.map((q) => Math.max(Math.abs(q.M1), Math.abs(q.M2))));
  for (const q of segs) { if (Math.abs(q.M1) <= 1e-10 * Mbig) q.M1 = 0; if (Math.abs(q.M2) <= 1e-10 * Mbig) q.M2 = 0; }
  const segRows = segs.map((s): Cell[] => {
    const l = s.x2 - s.x1;
    const k = l > 0 ? (s.w2 - s.w1) / l : 0;
    const parts: string[] = [];
    const add = (c: number, x: string) => {
      if (Math.abs(c) < 1e-12) return;
      const first = parts.length === 0;
      parts.push(`${first ? (c < 0 ? '-' : '') : (c < 0 ? ' - ' : ' + ')}${num(Math.abs(c))}${x ? `\\,${x}` : ''}`);
    };
    add(s.M1, ''); add(s.V1, '\\xi'); add(-s.w1 / 2, '\\xi^2'); add(-k / 6, '\\xi^3');
    const e = parts.length ? parts.join('') : '0';
    return [texCell(`${num(s.x1)} \\text{–} ${num(s.x2)}`), texCell(`M(\\xi) = ${e}`), s.M1, s.M2, s.EI];
  });
  const curv = (x: number) => momentOf(items, x, true) / bm.EIat(x);
  steps.push({
    title: tx('steps.m.momentArea.s2'),
    blocks: [
      p('steps.m.momentArea.segLead'),
      { kind: 'table', head: [tx('steps.deformation.segment'), texCell('M(\\xi)\\ [\\mathrm{kN\\,m}]'), texCell('M_1\\ [\\mathrm{kN\\,m}]'), texCell('M_2\\ [\\mathrm{kN\\,m}]'), texCell('EI\\ [\\mathrm{kN\\,m^2}]')], rows: segRows, caption: tx('steps.m.momentArea.segCaption') },
      { kind: 'fig', sketch: { ...sketchOf(pm), dims: 'auto', diagram: beamDiagram(pm, bm, (x, r) => momentOf(items, x, r), 'moment', 'kN·m') }, caption: tx('steps.deformation.mCaption') },
      { kind: 'fig', sketch: { ...sketchOf(pm), diagram: beamDiagram(pm, bm, (x, r) => momentOf(items, x, r) / bm.EIat(x), 'diagram', '1/m') }, caption: tx('steps.m.momentArea.mEICaption') },
    ],
  });

  // ── Areas and centroids.
  const areas: Area[] = [];
  for (const s of segs) {
    const l = s.x2 - s.x1;
    const scale = Math.max(Math.abs(s.M1), Math.abs(s.M2), 1e-12);
    const seg: [number, number] = [s.x1, s.x2];
    if (Math.abs(s.M1 - s.M2) <= 1e-9 * scale) {
      if (Math.abs(s.M1) > 1e-12) areas.push({ seg, shape: 'steps.m.momentArea.shape.rect', A: (s.M1 * l) / s.EI, xc: s.x1 + l / 2, tex: '\\frac{M_1\\,\\ell}{EI}', texNum: `\\frac{${par(s.M1)}(${num(l)})}{${num(s.EI)}}` });
    } else {
      if (Math.abs(s.M1) > 1e-12) areas.push({ seg, shape: 'steps.m.momentArea.shape.triL', A: (s.M1 * l) / (2 * s.EI), xc: s.x1 + l / 3, tex: '\\frac{M_1\\,\\ell}{2\\,EI}', texNum: `\\frac{${par(s.M1)}(${num(l)})}{2(${num(s.EI)})}` });
      if (Math.abs(s.M2) > 1e-12) areas.push({ seg, shape: 'steps.m.momentArea.shape.triR', A: (s.M2 * l) / (2 * s.EI), xc: s.x1 + (2 * l) / 3, tex: '\\frac{M_2\\,\\ell}{2\\,EI}', texNum: `\\frac{${par(s.M2)}(${num(l)})}{2(${num(s.EI)})}` });
    }
    const wsc = Math.max(Math.abs(s.w1), Math.abs(s.w2), 1e-12);
    if (Math.abs(s.w1 - s.w2) <= 1e-9 * wsc) {
      if (Math.abs(s.w1) > 1e-12) areas.push({ seg, shape: 'steps.m.momentArea.shape.parabola', A: (s.w1 * l ** 3) / (12 * s.EI), xc: s.x1 + l / 2, tex: '\\frac{2}{3}\\cdot\\frac{w\\,\\ell^2}{8}\\cdot\\frac{\\ell}{EI} = \\frac{w\\,\\ell^3}{12\\,EI}', texNum: `\\frac{${par(s.w1)}(${num(l)})^3}{12(${num(s.EI)})}` });
    } else {
      if (Math.abs(s.w1) > 1e-12) areas.push({ seg, shape: 'steps.m.momentArea.shape.cubicL', A: (s.w1 * l ** 3) / (24 * s.EI), xc: s.x1 + (7 * l) / 15, tex: '\\frac{w_1\\,\\ell^3}{24\\,EI}', texNum: `\\frac{${par(s.w1)}(${num(l)})^3}{24(${num(s.EI)})}` });
      if (Math.abs(s.w2) > 1e-12) areas.push({ seg, shape: 'steps.m.momentArea.shape.cubicR', A: (s.w2 * l ** 3) / (24 * s.EI), xc: s.x1 + (8 * l) / 15, tex: '\\frac{w_2\\,\\ell^3}{24\\,EI}', texNum: `\\frac{${par(s.w2)}(${num(l)})^3}{24(${num(s.EI)})}` });
    }
  }
  const areaRows = areas.map((a, k): Cell[] => [texCell(`A_{${k + 1}}`), texCell(`${num(a.seg[0])} \\text{–} ${num(a.seg[1])}`), tx(a.shape), texCell(`${a.tex} = ${a.texNum}`), a.A, a.xc]);
  const totalA = areas.reduce((s, a) => s + a.A, 0);
  const totalAx = areas.reduce((s, a) => s + a.A * a.xc, 0);
  const intA = bm.breaks.slice(0, -1).reduce((s, x, k) => s + gauss(x, bm.breaks[k + 1], curv), 0);
  const intAx = bm.breaks.slice(0, -1).reduce((s, x, k) => s + gauss(x, bm.breaks[k + 1], (q) => curv(q) * q), 0);
  steps.push({
    title: tx('steps.m.momentArea.s3'),
    blocks: [
      p('steps.m.momentArea.areasLead'),
      p('steps.m.momentArea.areasWhy', undefined, true),
      { kind: 'table', head: [texCell('A_k'), tx('steps.deformation.segment'), tx('steps.m.momentArea.shape'), tx('steps.m.momentArea.formula'), texCell('A_k\\ [\\mathrm{rad}]'), texCell('\\bar{x}_k\\ [\\mathrm{m}]')], rows: areaRows, caption: tx('steps.m.momentArea.areasCaption') },
      { kind: 'calc', label: tx('steps.m.momentArea.areasCheck'), formula: '\\sum A_k = \\int_0^{L} \\frac{M}{EI}\\,dx, \\qquad \\sum A_k\\,\\bar{x}_k = \\int_0^{L} \\frac{M}{EI}\\,x\\,dx',
        subst: `\\sum A_k = ${num(totalA, 6)}, \\qquad \\sum A_k\\,\\bar{x}_k = ${num(totalAx, 6)}`,
        result: `\\int_0^{L} \\frac{M}{EI}\\,dx = ${num(intA, 6)}\\ ${U.rad}, \\qquad \\int_0^{L} \\frac{M}{EI}\\,x\\,dx = ${num(intAx, 6)}\\ \\mathrm{rad\\,m}`,
        check: settle(totalA, intA, Math.abs(intA)).ok && settle(totalAx, intAx, Math.abs(intAx)).ok ? `\\sum A_k = \\int_0^{L} \\frac{M}{EI}\\,dx, \\qquad \\sum A_k\\,\\bar{x}_k = \\int_0^{L} \\frac{M}{EI}\\,x\\,dx\\ \\checkmark` : undefined },
    ],
  });

  // ── The reference tangent.
  const R0 = sup[0];
  const between = (x1: number, x2: number) => areas.map((a, k) => ({ a, k })).filter(({ a }) => a.seg[0] >= Math.min(x1, x2) - TOL && a.seg[1] <= Math.max(x1, x2) + TOL);
  const tDev = (xP: number, xR: number) => {
    const sg = xP >= xR ? 1 : -1;
    const list = between(xR, xP);
    return { list, value: sg * list.reduce((s, { a }) => s + a.A * (xP - a.xc), 0), sg };
  };
  let th0 = 0;
  const tangentBlocks: Block[] = [
    { kind: 'eq', tex: `\\theta_{Q} - \\theta_{P} = \\int_{x_P}^{x_Q} \\frac{M}{EI}\\,dx = \\sum A_k`, note: tx('steps.m.momentArea.th1') },
    { kind: 'eq', tex: `t_{Q/P} = \\int_{x_P}^{x_Q} \\frac{M}{EI}\\,(x_Q - x)\\,dx = \\sum A_k\\,(x_Q - \\bar{x}_k)`, note: tx('steps.m.momentArea.th2') },
    p('steps.m.momentArea.signs', undefined, true),
  ];
  if (cantilever) {
    tangentBlocks.push(p('steps.m.momentArea.tangentFixed', { n: R0.name }));
  } else {
    const B = sup[1];
    const LAB = B.x - R0.x;
    const td = tDev(B.x, R0.x);
    th0 = -td.value / LAB;
    tangentBlocks.push(
      p('steps.m.momentArea.tangentSimple', { a: R0.name, b: B.name }),
      { kind: 'calc', label: tx('steps.m.momentArea.tBA', { a: R0.name, b: B.name }), formula: `t_{${B.name}/${R0.name}} = \\sum A_k\\,(x_{${B.name}} - \\bar{x}_k)`,
        subst: `t_{${B.name}/${R0.name}} = ${td.list.map(({ a }) => `${par(a.A)}(${num(B.x)} - ${num(a.xc)})`).join(' + ') || '0'}`,
        result: `\\boxed{t_{${B.name}/${R0.name}} = ${num(td.value)}\\ ${U.m}}` },
      { kind: 'calc', label: tx('steps.m.momentArea.thetaA', { a: R0.name }), formula: `v_{${B.name}} = v_{${R0.name}} + \\theta_{${R0.name}}\\,L_{${R0.name}${B.name}} + t_{${B.name}/${R0.name}} = 0 \\;\\Rightarrow\\; \\theta_{${R0.name}} = -\\frac{t_{${B.name}/${R0.name}}}{L_{${R0.name}${B.name}}}`,
        subst: `\\theta_{${R0.name}} = -\\frac{${num(td.value)}}{${num(LAB)}}`, result: `\\boxed{\\theta_{${R0.name}} = ${num(th0)}\\ ${U.rad}}` },
    );
  }
  steps.push({ title: tx('steps.m.momentArea.s4'), blocks: tangentBlocks });

  // ── Every node.
  const exact = (x: number) => integrateCurvature(bm, curv, R0.x, th0, 0, x);
  const thA = (x: number) => exact(x).th, vA = (x: number) => exact(x).v;
  const nodeBlocks: Block[] = [];
  const byAreas = new Map<number, { th: number; v: number }>();
  byAreas.set(R0.x, { th: th0, v: 0 });
  // Node by node away from the reference, each from the one before it: the theorems hold between any two points.
  const right = bm.nodes.filter((n) => n.x > R0.x + TOL);
  const left = bm.nodes.filter((n) => n.x < R0.x - TOL).reverse();
  for (const chain of [right, left]) {
    let Q = { x: R0.x, name: R0.name };
    for (const nd of chain) {
      const q = byAreas.get(Q.x)!;
      const sg = nd.x >= Q.x ? 1 : -1;
      const list = between(Q.x, nd.x);
      const sumA = sg * list.reduce((acc, { a }) => acc + a.A, 0);
      const td = tDev(nd.x, Q.x);
      const th = q.th + sumA, vv = q.v + q.th * (nd.x - Q.x) + td.value;
      byAreas.set(nd.x, { th, v: vv });
      const R = Q.name, P = nd.name;
      const sumTex = list.length === 1 ? par(list[0].a.A) : `(${list.map(({ a }) => par(a.A)).join(' + ') || '0'})`;
      const tTex = list.map(({ a }) => (sg > 0 ? `${par(a.A)}(${num(nd.x)} - ${num(a.xc)})` : `${par(a.A)}(${num(a.xc)} - ${num(nd.x)})`)).join(' + ') || '0';
      nodeBlocks.push({
        kind: 'sub', title: tx('steps.deformation.atNode', { n: P }), blocks: [
          { kind: 'calc', label: tx('steps.m.momentArea.rotation'), formula: sg > 0 ? `\\theta_{${P}} = \\theta_{${R}} + \\sum_{${R}}^{${P}} A_k` : `\\theta_{${P}} = \\theta_{${R}} - \\sum_{${P}}^{${R}} A_k`,
            subst: `\\theta_{${P}} = ${num(q.th)} ${sg > 0 ? '+' : '-'} ${sumTex}`, result: `\\boxed{\\theta_{${P}} = ${num(th)}\\ ${U.rad}}` },
          { kind: 'calc', label: tx('steps.m.momentArea.deflection'), formula: `v_{${P}} = v_{${R}} + \\theta_{${R}}\\,(x_{${P}} - x_{${R}}) + t_{${P}/${R}}, \\qquad t_{${P}/${R}} = ${sg > 0 ? `\\sum A_k\\,(x_{${P}} - \\bar{x}_k)` : `\\sum A_k\\,(\\bar{x}_k - x_{${P}})`}`,
            subst: `t_{${P}/${R}} = ${tTex} = ${num(td.value)}\\ ${U.m}, \\qquad v_{${P}} = ${num(q.v)} + ${par(q.th)}(${num(nd.x)} - ${num(Q.x)}) + ${par(td.value)}`,
            result: `\\boxed{v_{${P}} = ${num(mm(vv))}\\ ${U.mm}}` },
        ],
      });
      Q = { x: nd.x, name: nd.name };
    }
  }
  const vN = (x: number) => byAreas.get(x)?.v ?? vA(x);
  const thN = (x: number) => byAreas.get(x)?.th ?? thA(x);
  const mx = maxDeflection(bm, vA, thA);
  const maxBlocks: Block[] = [];
  if (mx.stationary) {
    maxBlocks.push({
      kind: 'calc', label: tx('steps.deformation.max'),
      formula: `\\theta(x_m) = \\theta_{${R0.name}} + \\int_{x_{${R0.name}}}^{x_m} \\frac{M}{EI}\\,dx = 0`,
      subst: `\\int_{${num(R0.x)}}^{x_m} \\frac{M}{EI}\\,dx = ${num(-th0)} \\;\\Rightarrow\\; x_m = ${num(mx.x)}\\ ${U.m}`,
      result: `\\boxed{v_{\\max} = \\theta_{${R0.name}}\\,(x_m - x_{${R0.name}}) + t_{m/${R0.name}} = ${num(mm(mx.v))}\\ ${U.mm}}`,
    });
    maxBlocks.push(p('steps.m.momentArea.maxWhy', undefined, true));
  } else maxBlocks.push(maxBlock(mx));
  steps.push({
    title: tx('steps.m.momentArea.s5'),
    blocks: [p('steps.m.momentArea.nodesLead'), ...nodeBlocks, nodeTable(bm, vN, thN), ...maxBlocks, deformedSketch(pm, bm, vA, 'steps.deformation.deformedCaption')],
  });

  steps.push({ title: tx('steps.common.compare'), blocks: compareBlock(beamCompare(bm, ref, vN, thN, Rmap), tx('steps.deformation.shearNote')) });

  return {
    method: 'momentArea',
    title: tx('steps.m.momentArea.title'),
    subtitle: tx(cantilever ? 'steps.deformation.subtitle.cantilever' : 'steps.deformation.subtitle.simple'),
    intro: intro(ctx, tx('steps.m.momentArea.what'), 'steps.deformation.signs.beam'),
    steps,
  };
}
