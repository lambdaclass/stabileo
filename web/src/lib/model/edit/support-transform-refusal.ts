import { t } from '../../i18n';
import { uiStore } from '../../store/ui.svelte';
import type { Element, Support } from '../../store/model.svelte';
import { isBareRollerZ } from '../support-types';
import { isTranslation, type Affine } from './affine';

const refusalMessages = {
  ambiguousRoller: 'edit.refused.ambiguousRoller',
  missingSupportMembers: 'edit.refused.missingSupportMembers',
  changedSupportFrame: 'edit.refused.changedSupportFrame',
} as const;

export type SupportTransformRefusal = keyof typeof refusalMessages;

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
  uiStore.toast(t(refusalMessages[reason]), 'error');
  return reason;
}
