export const SUPPORT_TYPES = [
  'fixed', 'pinned', 'rollerX', 'rollerY', 'rollerZ', 'spring',
  'fixed3d', 'pinned3d', 'rollerXZ', 'rollerXY', 'rollerYZ', 'spring3d', 'custom3d',
] as const;

export type SupportType = typeof SUPPORT_TYPES[number];

export function isSupportType(type: unknown): type is SupportType {
  return SUPPORT_TYPES.some(known => known === type);
}

export function isBareRollerZ(support: { type?: string; dofRestraints?: unknown }): boolean {
  return support.type === 'rollerZ' && !support.dofRestraints;
}

export function isUnresolvedSpaceSupport(support: { type?: string; dofRestraints?: unknown }): boolean {
  return !isSupportType(support.type) || isBareRollerZ(support);
}

export function remapSupportElement(
  support: { dofFrame?: unknown; dofLocalElementId?: unknown },
  elementId: (sourceId: number) => number | undefined,
): number | undefined | null {
  const id = support.dofLocalElementId;
  if (id === undefined && support.dofFrame !== 'local') return undefined;
  return typeof id === 'number' ? elementId(id) ?? null : null;
}
