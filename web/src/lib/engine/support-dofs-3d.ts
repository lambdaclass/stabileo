import type { Support } from '../store/model.svelte';

/** Restraints of a named support, in the same frame used by the 3D solver. */
export function supportDofs3D(s: Support, project2DToXZ = false): { rx: boolean; ry: boolean; rz: boolean; rrx: boolean; rry: boolean; rrz: boolean } {
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
    case 'rollerXZ':
      return { rx: false, ry: true, rz: false, rrx: false, rry: false, rrz: false };
    case 'rollerXY':
      return { rx: false, ry: false, rz: true, rrx: false, rry: false, rrz: false };
    case 'rollerYZ':
      return { rx: true, ry: false, rz: false, rrx: false, rry: false, rrz: false };
    case 'spring':
    case 'spring3d':
      return { rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false };
    case 'custom3d':
      return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
    default:
      return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
  }
}
