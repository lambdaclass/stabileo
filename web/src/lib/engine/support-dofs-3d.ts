import type { Support } from '../store/model.svelte';

export class SupportMappingError extends Error {}

type Restraints3D = { rx: boolean; ry: boolean; rz: boolean; rrx: boolean; rry: boolean; rrz: boolean };

function explicitDofs(r: NonNullable<Support['dofRestraints']>): Restraints3D {
  return { rx: r.tx, ry: r.ty, rz: r.tz, rrx: r.rx, rry: r.ry, rrz: r.rz };
}

export function supportDofs3D(s: Support, project2DToXZ = false): Restraints3D {
  const named = namedDofs3D(s, project2DToXZ);
  if (s.dofRestraints) return explicitDofs(s.dofRestraints);
  if (named) return named;
  const reason = s.type === 'custom3d'
    ? 'custom support without restraints; set them explicitly.'
    : 'rollerZ is ambiguous in 3D. Set explicit 3D restraints before solving.';
  throw new SupportMappingError(`Support ${s.id} (node ${s.nodeId}): ${reason}`);
}

function namedDofs3D(s: Support, project2DToXZ: boolean): Restraints3D | undefined {
  if (project2DToXZ) {
    switch (s.type) {
      case 'fixed':
        return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
      case 'pinned':
        return { rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: true };
      case 'rollerX':
        return { rx: false, ry: true, rz: true, rrx: true, rry: false, rrz: true };
      case 'rollerY':
      case 'rollerZ':
        return { rx: true, ry: true, rz: false, rrx: true, rry: false, rrz: true };
      case 'spring':
        return { rx: false, ry: true, rz: false, rrx: true, rry: false, rrz: true };
    }
  }

  switch (s.type) {
    case 'fixed':
    case 'fixed3d':
      return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
    case 'pinned':
      return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: false };
    case 'pinned3d':
      return { rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false };
    case 'rollerX':
      return { rx: false, ry: true, rz: true, rrx: true, rry: true, rrz: false };
    case 'rollerY':
      return { rx: true, ry: false, rz: true, rrx: true, rry: true, rrz: false };
    case 'rollerZ':
    case 'custom3d':
      return undefined;
    case 'rollerXZ':
      return { rx: false, ry: true, rz: false, rrx: false, rry: false, rrz: false };
    case 'rollerXY':
      return { rx: false, ry: false, rz: true, rrx: false, rry: false, rrz: false };
    case 'rollerYZ':
      return { rx: true, ry: false, rz: false, rrx: false, rry: false, rrz: false };
    case 'spring':
    case 'spring3d':
      return { rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false };
    default: {
      const type: never = s.type;
      throw new SupportMappingError(`Support ${s.id} (node ${s.nodeId}): unknown support type ${String(type)}. Select a supported type and explicit 3D restraints before solving.`);
    }
  }
}
