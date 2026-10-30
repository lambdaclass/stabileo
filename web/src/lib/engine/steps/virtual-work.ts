/**
 * The unit-load (virtual work) method for a displacement, a rotation, or a
 * relative displacement or rotation between two nodes, of a beam, frame or
 * truss, with springs, settlements and temperature where the model has them.
 */
import type { MethodContext } from './registry';
import type { Applicability, Block, Step, StepDoc } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import { solveReference } from './reference';
import { countIndeterminacy } from '../force-method/primary';
import {
  p, baseApplies, intro, diagramOf, memberWork,
  axialTable, endValuesTable, frameIds, structureSketch, bendingBlocks, compareBlock, axialOn, axialShareWarning,
} from './deformation-common';
import { pickTarget, unitLoadInput, refAlong, unitSketch, targetNote, targetUnit } from './unit-target';
import { vwExtras } from './vw-extras';
import { extrasBlocks } from './vw-extras-blocks';

export function virtualWorkApplies(ctx: MethodContext): Applicability {
  return baseApplies(ctx, true, true);
}

export function buildVirtualWork(ctx: MethodContext): StepDoc {
  const { pm, input } = ctx;
  const ref = ctx.ref!;
  const tg = pickTarget(ctx);
  const virt = solveReference(unitLoadInput(input, tg));
  if (!virt) throw new Error('unit load case did not solve');
  const works = pm.memberOrder.map((id) => memberWork(pm, ref, virt, pm.members.get(id)!));
  const bend = works.reduce((s, w) => s + w.bending, 0);
  const ax = works.reduce((s, w) => s + w.axial, 0);
  const ex = vwExtras(pm, input, ref, virt);
  const hasExtras = ex.springs.length + ex.settlements.length + ex.thermal.length > 0;
  const hasFrames = works.some((w) => !w.member.truss);
  // Without members that bend the axial term is the whole answer, so it stays in whatever the option says.
  const withAxial = axialOn(ctx) || !hasFrames;
  const delta = bend + (withAxial ? ax : 0) + ex.total;
  const u = targetUnit(tg);
  const S = tg.sym;
  const gh = countIndeterminacy(input).gh;
  const extraTex = [
    ex.springs.length ? ' + \\sum \\frac{r\\,R}{k}' : '',
    ex.thermal.length ? ' + \\sum \\int n\\,\\alpha\\,\\Delta T\\,dx + \\sum \\int m\\,\\frac{\\alpha\\,\\Delta t}{h}\\,dx' : '',
    ex.settlements.length ? ' - \\sum r\\,c' : '',
  ].join('');
  const steps: Step[] = [];

  steps.push({
    title: tx('steps.m.virtualWork.s1'),
    blocks: [
      p(tg.quantity !== 'disp' ? 'course.statics.vw.targetParams' : tg.chosen ? 'steps.deformation.targetSelected' : 'steps.deformation.targetAuto', { n: tg.name }),
      { kind: 'note', tone: 'info', text: targetNote(tg) },
      p('course.statics.vw.choose', undefined, true),
      { kind: 'eq', tex: `1 \\cdot ${S} = \\sum \\int_0^{L} \\frac{M\\,m}{EI}\\,dx${withAxial ? ' + \\sum \\int_0^{L} \\frac{N\\,n}{EA}\\,dx' : ''}${extraTex}`, note: tx('steps.m.virtualWork.principle') },
      p('steps.m.virtualWork.principleWhy', undefined, true),
      p(`course.statics.vw.why.${tg.quantity}`, { n: tg.name, m: tg.name2 }, true),
      ...(hasExtras ? [p('course.statics.vw.extrasWhy', undefined, true)] : []),
      ...(withAxial ? [] : [{ kind: 'note', tone: 'info', text: tx('steps.deformation.axialOff') } as Block]),
      ...(!hasFrames && !axialOn(ctx) ? [{ kind: 'note', tone: 'info', text: tx('steps.deformation.axialTrussAlways') } as Block] : []),
    ],
  });

  steps.push({
    title: tx('steps.m.virtualWork.s2'),
    blocks: [
      p(gh > 0 ? 'steps.deformation.realIndeterminate' : 'steps.deformation.realDeterminate', { g: gh }),
      ...(hasFrames ? [{ kind: 'fig', sketch: { ...structureSketch(pm), diagram: diagramOf(pm, frameIds(pm), (id, x) => ref.momentAt(id, x), 'moment', 'kN·m') }, caption: tx('steps.deformation.mCaption') } as Block] : []),
      endValuesTable(pm, ref, { M: 'M', N: 'N' }, 'steps.deformation.realTableCaption'),
    ],
  });

  steps.push({
    title: tx('steps.m.virtualWork.s3'),
    blocks: [
      p(tg.quantity === 'disp' ? 'steps.m.virtualWork.unitLead' : `course.statics.vw.unit.${tg.quantity}`, { n: tg.name, m: tg.name2 }),
      p('steps.m.virtualWork.unitWhy', undefined, true),
      { kind: 'fig', sketch: unitSketch(pm, tg, virt, '1'), caption: tx('steps.m.virtualWork.unitCaption') },
      endValuesTable(pm, virt, { M: 'm', N: 'n' }, 'steps.deformation.virtualTableCaption'),
    ],
  });

  if (hasFrames) {
    steps.push({
      title: tx('steps.m.virtualWork.s4'),
      blocks: [p('steps.deformation.integralLead'), p('steps.deformation.integralWhy', undefined, true), ...bendingBlocks(works, 'm')],
    });
  }

  steps.push({
    title: tx('steps.m.virtualWork.s5'),
    blocks: [
      p(hasFrames ? (withAxial ? 'steps.deformation.axialLead' : 'steps.deformation.axialLeftOut') : 'steps.deformation.axialTruss'),
      axialTable(works, 'n'),
      { kind: 'eq', tex: `\\sum \\frac{N\\,n\\,L}{EA} = ${num(ax)}\\ ${u.base}` },
      ...(hasFrames && Math.abs(bend + ax) > 1e-15 && Math.abs(ax) > 1e-12 * Math.abs(bend + ax)
        ? [p(withAxial ? 'steps.deformation.axialShare' : 'steps.deformation.axialShareOff', { pct: numText((100 * ax) / (bend + ax), 3) })] : []),
    ],
  });

  if (hasExtras) steps.push({ title: tx('course.statics.vw.extrasTitle'), blocks: extrasBlocks(pm, ex, u.base) });

  const sumOf = (xs: Array<{ value: number }>) => xs.reduce((a, x) => a + x.value, 0);
  const tAx = ex.thermal.reduce((a, x) => a + x.axial, 0), tBe = ex.thermal.reduce((a, x) => a + x.bending, 0);
  const parts = [
    par(bend), ...(withAxial ? [par(ax)] : []), ...(ex.springs.length ? [par(sumOf(ex.springs))] : []),
    ...(ex.thermal.length ? [par(tAx), par(tBe)] : []),
  ];
  const settleTex = ex.settlements.length ? ` - ${par(-sumOf(ex.settlements))}` : '';
  steps.push({
    title: tx('steps.m.virtualWork.s6'),
    blocks: [
      { kind: 'calc', label: tx('steps.deformation.total'),
        formula: `${S} = \\sum \\int \\frac{M\\,m}{EI}\\,dx${withAxial ? ' + \\sum \\frac{N\\,n\\,L}{EA}' : ''}${extraTex}`,
        subst: parts.length > 1 || settleTex ? `${S} = ${parts.join(' + ')}${settleTex} = ${num(delta)}\\ ${u.base}` : `${S} = ${num(delta)}\\ ${u.base}`,
        result: `\\boxed{${S} = ${num(delta * u.k)}\\ ${u.tex}}` },
      p(tg.quantity === 'disp' ? (delta >= 0 ? 'steps.deformation.senseSame' : 'steps.deformation.senseOpposite')
        : `course.statics.vw.sense.${tg.quantity}${delta >= 0 ? 'Pos' : 'Neg'}`, { n: tg.name, m: tg.name2 }),
      ...(withAxial ? [] : axialShareWarning(bend, ax)),
      ...compareBlock([{ label: S, method: delta * u.k, matrix: refAlong(ref, tg) * u.k, unit: u.unit }],
        tx(withAxial ? 'steps.deformation.exactNote' : 'steps.deformation.axialOffNote')),
    ],
  });

  return {
    method: 'virtualWork',
    title: tx('steps.m.virtualWork.title'),
    subtitle: targetNote(tg),
    intro: intro(ctx, tx('steps.m.virtualWork.what'), 'steps.deformation.signs.frame', [], true),
    steps,
  };
}
