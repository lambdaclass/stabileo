import type { PlateSurface } from './plate';

type ShellFields = Partial<Pick<PlateSurface, 'materialId' | 'thickness' | 'curved'>> & {
  offset?: Partial<NonNullable<PlateSurface['offset']>>;
};

export function hasLocalCellProperties(cell: ShellFields, surface: PlateSurface, quad: boolean): boolean {
  const { offset } = cell;
  const inherited = surface.offset;
  const localOffset = offset && inherited
    ? offset.frame !== inherited.frame || offset.x !== inherited.x || offset.y !== inherited.y || offset.z !== inherited.z
    : offset !== inherited;
  return localOffset || (cell.materialId !== undefined && cell.materialId !== surface.materialId)
    || (cell.thickness !== undefined && cell.thickness !== surface.thickness) || (quad && !!cell.curved !== !!surface.curved);
}

type TargetGroup = { kind?: string; members?: { quads?: number[]; plates?: number[] } | null; data?: unknown };
type FloorTarget = { by?: string; groupId?: number };

function slabTarget(group: TargetGroup | undefined): FloorTarget | undefined {
  const data = group?.data as { distribution?: string; target?: FloorTarget } | undefined;
  return group?.kind === 'floorLoad' && data?.distribution === 'slab' ? data.target : undefined;
}

export function pressureFollowsMesh(owner: TargetGroup | undefined, plateId: number): boolean {
  const target = slabTarget(owner);
  return target?.by === 'level' || target?.by === 'range' || target?.by === 'zone'
    || (target?.by === 'group' && target.groupId === plateId);
}

export function cellPressureDefinitions(groups: ReadonlyMap<number, TargetGroup>, plateId: number, quads: ReadonlySet<number>, triangles: ReadonlySet<number>): Set<number> {
  const definitions = new Set<number>();
  if (!quads.size && !triangles.size) return definitions;
  for (const [id, group] of groups) {
    const target = slabTarget(group);
    const members = target?.by === 'own' ? group.members
      : target?.by === 'group' && target.groupId !== undefined && target.groupId !== plateId ? groups.get(target.groupId)?.members : undefined;
    if (members?.quads?.some(key => quads.has(key)) || members?.plates?.some(key => triangles.has(key))) definitions.add(id);
  }
  return definitions;
}
