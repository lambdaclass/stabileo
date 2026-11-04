/**
 * The kinematic method of plastic analysis: the critical sections, the
 * independent elementary mechanisms and their virtual-work equations, the
 * combinations that remove a hinge and lower λ, the least of all (an upper
 * bound that is the collapse load once the moments at it stay within Mp),
 * checked against the step-by-step analysis.
 */
import type { MethodContext } from './registry';
import type { Block, Cell, Step, StepDoc } from './doc';
import { tx } from './doc';
import { num, numText } from './format';
import {
  solveCase, introBlocks, sectionsStep, mechanismSketch, momentSketch, elementaryName, virtualWorkBlocks,
  pairCombinations, secName, momentCheckBlocks, compareBlocks,
} from './plastic-common';

export function buildPlasticKinematic(ctx: MethodContext): StepDoc {
  const pc = solveCase(ctx);
  const doc: StepDoc = { method: 'plasticKinematic', title: tx('steps.m.plasticKinematic.title'), intro: introBlocks(ctx, 'steps.m.plasticKinematic.what', pc.mp), steps: [] };
  if (!pc.sol) {
    doc.steps.push({ title: tx('course.plastic.kin.s1'), blocks: [{ kind: 'note', tone: 'warn', text: tx('course.plastic.doc.noCollapse') }] });
    return doc;
  }
  const { lm, elementary, best, moments, combination, history } = pc.sol;
  const steps: Step[] = [];

  steps.push({ title: tx('course.plastic.kin.s1'), blocks: sectionsStep(ctx, pc, lm) });

  const subs: Block[] = elementary.map((e, k) => ({
    kind: 'sub',
    title: elementaryName(ctx, e, k, elementary),
    blocks: [
      { kind: 'fig', sketch: mechanismSketch(ctx, lm, e.mech), caption: tx('course.plastic.doc.mechCaption') },
      ...virtualWorkBlocks(ctx, lm, e.mech, `\\lambda_{${k + 1}}`),
      ...(Number.isFinite(e.mech.lambda) ? [] : [{ kind: 'note', tone: 'info', text: tx('course.plastic.kin.noWork') } as Block]),
    ],
  }));
  steps.push({
    title: tx('course.plastic.kin.s2'),
    blocks: [
      { kind: 'p', text: tx('course.plastic.kin.elementaryLead', { m: lm.m }) },
      { kind: 'p', text: tx('course.plastic.kin.elementaryWhy'), detail: true },
      ...subs,
    ],
  });

  const pairs = pairCombinations(lm, elementary);
  const comboText = combination.map((c, k) => (c === 0 ? '' : `${c < 0 ? '−' : '+'} ${Math.abs(Math.abs(c) - 1) < 1e-9 ? '' : `${numText(Math.abs(c), 3)}·`}(${k + 1})`))
    .filter(Boolean).join(' ').replace(/^\+ /, '').replace(/^− /, '−');
  const combine: Block[] = [{ kind: 'p', text: tx('course.plastic.kin.combineLead') }, { kind: 'p', text: tx('course.plastic.kin.combineWhy'), detail: true }];
  if (pairs.length) {
    const rows: Cell[][] = pairs.map((c) => [
      { tex: `(${c.i + 1}) ${c.alpha < 0 ? '-' : '+'} ${Math.abs(Math.abs(c.alpha) - 1) < 1e-9 ? '' : `${num(Math.abs(c.alpha))}\\cdot`}(${c.j + 1})` },
      secName(c.removed), c.mech.lambda,
    ]);
    combine.push({ kind: 'table', head: [tx('course.plastic.kin.combination'), tx('course.plastic.kin.removed'), { tex: '\\lambda' }], rows });
  } else {
    combine.push({ kind: 'p', text: tx('course.plastic.kin.noPairs') });
  }
  combine.push(
    { kind: 'p', text: tx('course.plastic.kin.best', { combo: comboText || '—' }) },
    { kind: 'p', text: tx('course.plastic.kin.bestWhy'), detail: true },
    { kind: 'fig', sketch: mechanismSketch(ctx, lm, best), caption: tx('course.plastic.doc.mechCaption') },
    ...virtualWorkBlocks(ctx, lm, best, '\\lambda_c'),
  );
  if (history.length > 1) {
    const spans = lm.sm.sections.filter((s) => s.kind === 'span');
    const head: Cell[] = [tx('course.plastic.kin.trial'), ...spans.map((s) => tx('course.plastic.kin.xIn', { member: ctx.pm.members.get(s.member)!.name })), { tex: '\\lambda' }];
    const rows: Cell[][] = history.map((h, k) => [k + 1, ...spans.map((s) => {
      const t = h.positions.get(s.member);
      const L = ctx.pm.members.get(s.member)!.L;
      return t === undefined ? tx('course.plastic.kin.midLoad') : t * L;
    }), h.lambda]);
    combine.push({ kind: 'sub', title: tx('course.plastic.kin.positionTitle'), blocks: [
      { kind: 'p', text: tx('course.plastic.kin.positionLead') },
      { kind: 'table', head, rows },
      { kind: 'p', text: tx('course.plastic.kin.positionWhy'), detail: true },
    ] });
  }
  steps.push({ title: tx('course.plastic.kin.s3'), blocks: combine });

  steps.push({
    title: tx('course.plastic.kin.s4'),
    blocks: [
      { kind: 'p', text: tx('course.plastic.kin.checkLead') },
      { kind: 'fig', sketch: momentSketch(ctx, lm, moments.M, best.lambda), caption: tx('course.plastic.doc.momentCaption', { lambda: numText(best.lambda) }) },
      ...momentCheckBlocks(ctx, lm, moments),
      ...compareBlocks(pc, best.lambda),
    ],
  });
  doc.steps = steps;
  return doc;
}
