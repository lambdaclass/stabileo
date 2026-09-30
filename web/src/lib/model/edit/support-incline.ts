/**
 * Turning a support's incline on and off, as the patch the support editor applies.
 *
 * An inclined support holds the node along its normal: the translations are left free and the
 * normal carries the restraint (the solver's penalty on it). Removing the incline must give the
 * translations back — clearing the normal alone left a support with every translation free, and
 * the node a mechanism.
 */

type Dofs = { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean };

export interface InclinableSupport { type: string; dofRestraints?: Dofs; isInclined?: boolean }

export interface InclinePatch {
  type?: 'custom3d';
  dofRestraints?: Dofs;
  isInclined?: true | undefined;
  normalX?: number | undefined;
  normalY?: number | undefined;
  normalZ?: number | undefined;
}

/** The restraints a support stands for: its own if custom, else its type's. */
function restraintsOf(s: InclinableSupport): Dofs {
  if (s.type === 'custom3d') return s.dofRestraints ?? { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false };
  const fixed = s.type === 'fixed3d';
  return { tx: true, ty: true, tz: true, rx: fixed, ry: fixed, rz: fixed };
}

/** The patch that inclines `s` along `n`, or, for a null or zero `n`, removes its incline. */
export function inclinePatch(s: InclinableSupport, n: readonly [number, number, number] | null): InclinePatch {
  const len = n ? Math.hypot(...n) : 0;
  const r = restraintsOf(s);
  if (n && len > 1e-12) {
    // The normal carries the restraint, so the translations are left free; rotations stay.
    return {
      type: 'custom3d', dofRestraints: { ...r, tx: false, ty: false, tz: false },
      isInclined: true, normalX: n[0] / len, normalY: n[1] / len, normalZ: n[2] / len,
    };
  }
  if (!s.isInclined) return {};
  return {
    dofRestraints: { ...r, tx: true, ty: true, tz: true },
    isInclined: undefined, normalX: undefined, normalY: undefined, normalZ: undefined,
  };
}
