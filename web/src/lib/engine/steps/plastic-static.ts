/**
 * The static method of plastic analysis: the equilibrium equations between the
 * moments at the critical sections, a first admissible distribution (the
 * elastic one at first yield), then trial distributions with Mp at enough
 * sections to form a mechanism, each solved for λ and checked against Mp:
 * where it goes past, the distribution scaled down is admissible (a lower
 * bound) and the next trial puts a hinge there, until one is admissible.
 */
import type { MethodContext } from './registry';
import type { Block, Cell, Step, StepDoc } from './doc';
import { tx } from './doc';
import { num, numText } from './format';
import {
  solveCase, introBlocks, sectionsStep, momentSketch, elementaryName, pairCombinations, secName,
  momentCheckBlocks, compareBlocks, equationTex,
} from './plastic-common';
import { mechanismMoments, type Mechanism, type Distribution } from '../plastic/limit';
import { computeDiagramValueAt } from '../diagrams';
import { structureSketch } from './deformation-common';

const MAX_TRIALS = 6;

export function buildPlasticStatic(ctx: MethodContext): StepDoc {
  const pc = solveCase(ctx);
  const doc: StepDoc = { method: 'plasticStatic', title: tx('steps.m.plasticStatic.title'), intro: introBlocks(ctx, 'steps.m.plasticStatic.what', pc.mp), steps: [] };
  if (!pc.sol) {
    doc.steps.push({ title: tx('course.plastic.st.s1'), blocks: [{ kind: 'note', tone: 'warn', text: tx('course.plastic.doc.noCollapse') }] });
    return doc;
  }
  const { lm, elementary, best } = pc.sol;
  const steps: Step[] = [];
  steps.push({ title: tx('course.plastic.st.s1'), blocks: sectionsStep(ctx, pc, lm) });

  steps.push({
    title: tx('course.plastic.st.s2'),
    blocks: [
      { kind: 'p', text: tx('course.plastic.st.eqLead', { m: lm.m, n: lm.N }) },
      { kind: 'p', text: tx('course.plastic.st.eqWhy'), detail: true },
      ...elementary.map((e, k): Block => ({ kind: 'eq', tex: equationTex(e.mech), note: elementaryName(ctx, e, k, elementary) })),
      { kind: 'p', text: tx('course.plastic.st.eqCount', { unknowns: lm.N + 1, m: lm.m, free: lm.N + 1 - lm.m }) },
    ],
  });

  const first = pc.incrementalResult?.steps[0];
  if (first) {
    const l1 = first.loadFactor;
    const members = [...lm.sm.members.keys()].map((member) => {
      const ef = first.results.elementForces.find((f) => f.elementId === member);
      return { member, values: Array.from({ length: 25 }, (_, i) => [i / 24, ef ? -computeDiagramValueAt('moment', i / 24, ef) : 0] as [number, number]) };
    });
    steps.push({
      title: tx('course.plastic.st.s3'),
      blocks: [
        { kind: 'p', text: tx('course.plastic.st.elasticLead') },
        { kind: 'fig', sketch: { ...structureSketch(ctx.pm), dims: undefined, spanLoads: [], forces: [], couples: [], diagram: { color: 'moment', marks: true, unit: 'kN·m', members } }, caption: tx('course.plastic.doc.momentCaption', { lambda: numText(l1) }) },
        { kind: 'calc', label: tx('course.plastic.st.firstYield'), formula: '\\lambda_1 = \\min_i \\frac{M_{p,i}}{|M_i|}', result: `\\boxed{\\lambda_1 = ${num(l1)} \\le \\lambda_c}` },
        { kind: 'p', text: tx('course.plastic.st.elasticWhy'), detail: true },
      ],
    });
  }

  const candidates: Mechanism[] = [
    ...elementary.map((e) => e.mech).filter((m) => Number.isFinite(m.lambda)),
    ...pairCombinations(lm, elementary).map((c) => c.mech),
    best,
  ];
  let trial = candidates.slice(0, elementary.length).sort((a, b) => a.lambda - b.lambda)[0] ?? best;
  const trials: Array<{ mech: Mechanism; dist: Distribution }> = [];
  for (let k = 0; k < MAX_TRIALS; k++) {
    const dist = mechanismMoments(lm, trial);
    if (!dist) break;
    trials.push({ mech: trial, dist });
    if (dist.ratio <= 1 + 1e-6 || !dist.worst) break;
    const w = dist.worst;
    let at = -1, gap = Infinity;
    lm.sm.sections.forEach((s, i) => { if (s.member === w.member && Math.abs(s.t - w.t) < gap) { gap = Math.abs(s.t - w.t); at = i; } });
    const next = candidates.filter((c) => c.theta[at] !== 0 && c.lambda < trial.lambda * (1 - 1e-9)).sort((a, b) => a.lambda - b.lambda)[0]
      ?? (trial === best ? null : best);
    if (!next) break;
    trial = next;
  }

  const trialSubs: Block[] = trials.map(({ mech, dist }, k) => {
    const hinges = mech.theta.map((th, i) => (th === 0 ? '' : `${th > 0 ? '+' : '−'}Mp (${secName(i)})`)).filter(Boolean).join(', ');
    const ok = dist.ratio <= 1 + 1e-6;
    return {
      kind: 'sub',
      title: tx('course.plastic.st.trial', { k: k + 1 }),
      blocks: [
        { kind: 'p', text: tx('course.plastic.st.assume', { list: hinges }) },
        { kind: 'calc', label: tx('course.plastic.st.solveLambda'), formula: equationTex(mech), subst: `${num(mech.Wi)} = ${num(mech.W)}\\,\\lambda`, result: `\\boxed{\\lambda = ${num(mech.lambda)}}` },
        ...(dist.free > 0 ? [{ kind: 'p', text: tx('course.plastic.st.freeLeft', { free: dist.free }) } as Block] : []),
        { kind: 'fig', sketch: momentSketch(ctx, lm, dist.M, mech.lambda), caption: tx('course.plastic.doc.momentCaption', { lambda: numText(mech.lambda) }) },
        ...momentCheckBlocks(ctx, lm, dist),
        ...(ok ? [] : [{ kind: 'p', text: tx('course.plastic.st.next') } as Block]),
      ],
    };
  });
  const bounds: Cell[][] = trials.map(({ mech, dist }, k) => [k + 1, mech.lambda / Math.max(dist.ratio, 1), mech.lambda]);
  steps.push({
    title: tx('course.plastic.st.s4'),
    blocks: [
      { kind: 'p', text: tx('course.plastic.st.trialLead') },
      { kind: 'p', text: tx('course.plastic.st.trialWhy'), detail: true },
      ...trialSubs,
    ],
  });

  const final = trials[trials.length - 1];
  steps.push({
    title: tx('course.plastic.st.s5'),
    blocks: [
      { kind: 'table', head: [tx('course.plastic.kin.trial'), tx('course.plastic.st.lower'), tx('course.plastic.st.upper')], rows: bounds, caption: tx('course.plastic.st.boundsCaption') },
      final && final.dist.ratio <= 1 + 1e-6
        ? { kind: 'note', tone: 'ok', text: tx('course.plastic.st.result', { lambda: numText(final.mech.lambda) }) }
        : { kind: 'note', tone: 'warn', text: tx('course.plastic.st.unfinished', { lambda: numText(best.lambda) }) },
      ...compareBlocks(pc, final && final.dist.ratio <= 1 + 1e-6 ? final.mech.lambda : best.lambda),
    ],
  });
  doc.steps = steps;
  return doc;
}
