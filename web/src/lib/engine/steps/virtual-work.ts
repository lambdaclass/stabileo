/** The unit-load (virtual work) method for one displacement component of a beam, frame or truss. */
import type { MethodContext } from './registry';
import type { Applicability, Block, Step, StepDoc } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import { solveReference } from './reference';
import { countIndeterminacy } from '../force-method/primary';
import {
  U, p, mm, baseApplies, intro, diagramOf, pickTarget, unitLoadInput, refAlong, memberWork,
  axialTable, endValuesTable, unitSketch, frameIds, structureSketch, bendingBlocks, compareBlock, axialOn, axialShareWarning,
} from './deformation-common';

export function virtualWorkApplies(ctx: MethodContext): Applicability {
  return baseApplies(ctx, true);
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
  const hasFrames = works.some((w) => !w.member.truss);
  // Without members that bend the axial term is the whole answer, so it stays in whatever the option says.
  const withAxial = axialOn(ctx) || !hasFrames;
  const delta = bend + (withAxial ? ax : 0);
  const dirKey = tg.dir === 'x' ? 'steps.deformation.dir.x' : 'steps.deformation.dir.z';
  const gh = countIndeterminacy(input).gh;
  const steps: Step[] = [];

  steps.push({
    title: tx('steps.m.virtualWork.s1'),
    blocks: [
      p(tg.chosen ? 'steps.deformation.targetSelected' : 'steps.deformation.targetAuto', { n: tg.name }),
      { kind: 'note', tone: 'info', text: tx(dirKey, { n: tg.name }) },
      p('steps.deformation.targetHow', undefined, true),
      { kind: 'eq', tex: `1 \\cdot \\delta_{${tg.name}} = \\sum \\int_0^{L} \\frac{M\\,m}{EI}\\,dx${withAxial ? ' + \\sum \\int_0^{L} \\frac{N\\,n}{EA}\\,dx' : ''}`, note: tx('steps.m.virtualWork.principle') },
      p('steps.m.virtualWork.principleWhy', undefined, true),
      ...(withAxial ? [] : [{ kind: 'note', tone: 'info', text: tx('steps.deformation.axialOff') } as Block]),
      ...(!hasFrames && !axialOn(ctx) ? [{ kind: 'note', tone: 'info', text: tx('steps.deformation.axialTrussAlways') } as Block] : []),
    ],
  });

  steps.push({
    title: tx('steps.m.virtualWork.s2'),
    blocks: [
      p(gh > 0 ? 'steps.deformation.realIndeterminate' : 'steps.deformation.realDeterminate', { g: gh }),
      ...(hasFrames ? [{ kind: 'fig', sketch: { ...structureSketch(pm), diagram: diagramOf(pm, frameIds(pm), (id, u) => ref.momentAt(id, u), 'moment', 'kN·m') }, caption: tx('steps.deformation.mCaption') } as Block] : []),
      endValuesTable(pm, ref, { M: 'M', N: 'N' }, 'steps.deformation.realTableCaption'),
    ],
  });

  steps.push({
    title: tx('steps.m.virtualWork.s3'),
    blocks: [
      p('steps.m.virtualWork.unitLead', { n: tg.name }),
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
      { kind: 'eq', tex: `\\sum \\frac{N\\,n\\,L}{EA} = ${num(ax)}\\ ${U.m}` },
      ...(hasFrames && Math.abs(bend + ax) > 1e-15 && Math.abs(ax) > 1e-12 * Math.abs(bend + ax)
        ? [p(withAxial ? 'steps.deformation.axialShare' : 'steps.deformation.axialShareOff', { pct: numText((100 * ax) / (bend + ax), 3) })] : []),
    ],
  });

  steps.push({
    title: tx('steps.m.virtualWork.s6'),
    blocks: [
      { kind: 'calc', label: tx('steps.deformation.total'),
        formula: withAxial
          ? `\\delta_{${tg.name}} = \\sum \\int \\frac{M\\,m}{EI}\\,dx + \\sum \\frac{N\\,n\\,L}{EA}`
          : `\\delta_{${tg.name}} = \\sum \\int \\frac{M\\,m}{EI}\\,dx`,
        subst: withAxial ? `\\delta_{${tg.name}} = ${par(bend)} + ${par(ax)} = ${num(delta)}\\ ${U.m}` : `\\delta_{${tg.name}} = ${num(delta)}\\ ${U.m}`,
        result: `\\boxed{\\delta_{${tg.name}} = ${num(mm(delta))}\\ ${U.mm}}` },
      p(delta >= 0 ? 'steps.deformation.senseSame' : 'steps.deformation.senseOpposite'),
      ...(withAxial ? [] : axialShareWarning(bend, ax)),
      ...compareBlock([{ label: `\\delta_{${tg.name}}`, method: mm(delta), matrix: mm(refAlong(ref, tg)), unit: 'mm' }],
        tx(withAxial ? 'steps.deformation.exactNote' : 'steps.deformation.axialOffNote')),
    ],
  });

  return {
    method: 'virtualWork',
    title: tx('steps.m.virtualWork.title'),
    subtitle: tx(dirKey, { n: tg.name }),
    intro: intro(ctx, tx('steps.m.virtualWork.what'), 'steps.deformation.signs.frame', [], true),
    steps,
  };
}
