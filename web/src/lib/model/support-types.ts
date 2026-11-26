export const SUPPORT_TYPES = [
  'fixed', 'pinned', 'rollerX', 'rollerY', 'rollerZ', 'guidedX', 'spring',
  'fixed3d', 'pinned3d', 'rollerXZ', 'rollerXY', 'rollerYZ', 'spring3d', 'custom3d',
] as const;

export type SupportType = typeof SUPPORT_TYPES[number];

export function isSupportType(type: unknown): type is SupportType {
  return SUPPORT_TYPES.some(known => known === type);
}

export function isPlaneRoller(type: unknown): boolean {
  return type === 'rollerX' || type === 'rollerY' || type === 'rollerZ';
}

export function planeSupportUsesAngle(type: unknown): boolean {
  return isPlaneRoller(type) || type === 'spring';
}

export function isPlaneSupportType(type: unknown): boolean {
  return type === 'fixed' || type === 'pinned' || type === 'guidedX' || type === 'spring' || isPlaneRoller(type);
}

export function isLocalPlaneRoller(support: { type: unknown; isGlobal?: boolean }): boolean {
  return support.isGlobal === false && isPlaneRoller(support.type);
}

export function planeMemberAngle(
  nodeId: number, nodes: ReadonlyMap<number, { x: number; y: number }>,
  elements: Iterable<{ nodeI: number; nodeJ: number }>,
): number {
  let sumAngle = 0, count = 0;
  for (const elem of elements) {
    if (elem.nodeI === nodeId || elem.nodeJ === nodeId) {
      const ni = nodes.get(elem.nodeI);
      const nj = nodes.get(elem.nodeJ);
      if (!ni || !nj) continue;
      const angle = elem.nodeI === nodeId
        ? Math.atan2(nj.y - ni.y, nj.x - ni.x)
        : Math.atan2(ni.y - nj.y, ni.x - nj.x);
      sumAngle += angle;
      count++;
    }
  }
  return count > 0 ? sumAngle / count : 0;
}

export function resolvePlaneSupportSettlement(support: {
  dy?: number;
  dz?: number;
  dry?: number;
  drz?: number;
}): { dz: number | undefined; dry: number | undefined } {
  return { dz: support.dz ?? support.dy, dry: support.dry ?? support.drz };
}

export function isBareRollerZ(support: { type?: string; dofRestraints?: unknown }): boolean {
  return support.type === 'rollerZ' && !support.dofRestraints;
}

export function isBareCustom3D(support: { type?: string; dofRestraints?: unknown }): boolean {
  return support.type === 'custom3d' && !support.dofRestraints;
}

export function isUnresolvedSupport(support: { type?: string; dofRestraints?: unknown }, plane: boolean): boolean {
  return !isSupportType(support.type) || isBareCustom3D(support) || (!plane && isBareRollerZ(support));
}

export function remapSupportElement(
  support: { dofFrame?: unknown; dofLocalElementId?: unknown },
  elementId: (sourceId: number) => number | undefined,
): number | undefined | null {
  const id = support.dofLocalElementId;
  if (id === undefined && support.dofFrame !== 'local') return undefined;
  return typeof id === 'number' ? elementId(id) ?? null : null;
}
