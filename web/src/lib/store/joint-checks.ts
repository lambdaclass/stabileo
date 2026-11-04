/** The model's beam-column joints checked for shear from the published combinations (`joint-check.ts`). */
import { modelStore } from './model.svelte';
import { verificationStore } from './verification.svelte';
import { activePerCombo3D, activeCombinations } from './active-results';
import { modelJointChecks, type JointMember, type JointResult } from '../engine/design/joint-check';

export function jointChecks(): JointResult[] {
  const members = new Map<number, JointMember>();
  for (const ctx of verificationStore.contexts.values()) {
    if (ctx.elementType === 'wall') continue;
    members.set(ctx.elementId, {
      id: ctx.elementId, kind: ctx.elementType, b: ctx.section.b, h: ctx.section.h,
      d: ctx.axes.hFlex - ctx.material.cover - ctx.material.stirrupDia / 1000 - 0.01,
      fc: ctx.material.fc, axis: ctx.axes.flexure,
    });
  }
  if (!members.size) return [];
  return modelJointChecks({
    nodes: modelStore.nodes, elements: modelStore.elements as never, members, sections: modelStore.sections,
    perCombo: activePerCombo3D(), comboNames: new Map(activeCombinations().map((c) => [c.id, c.name])),
  });
}
