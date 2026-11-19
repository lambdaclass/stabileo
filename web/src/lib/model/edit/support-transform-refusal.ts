import { t } from '../../i18n';
import { uiStore } from '../../store/ui.svelte';
import type { Element, Support } from '../../store/model.svelte';
import { isBareRollerZ } from '../support-types';
import { isTranslation, type Affine } from './affine';

export type SupportTransformRefusal = 'ambiguousRoller' | 'missingSupportMembers';

export function ambiguousRollerTransform(
  supports: Iterable<Support>,
  members: Iterable<Element>,
  transforms: readonly Affine[],
): boolean {
  if (!uiStore.is3DWorkspace || transforms.every(isTranslation)) return false;
  const ambiguous = [...supports].filter(isBareRollerZ);
  if (ambiguous.length === 0) return false;
  const memberNodes = new Set<number>();
  for (const member of members) {
    memberNodes.add(member.nodeI);
    memberNodes.add(member.nodeJ);
  }
  return ambiguous.some(s => !memberNodes.has(s.nodeId));
}

export function refuseSupportTransform(reason: SupportTransformRefusal): SupportTransformRefusal {
  uiStore.toast(t(reason === 'ambiguousRoller' ? 'edit.refused.ambiguousRoller' : 'edit.refused.missingSupportMembers'), 'error');
  return reason;
}
