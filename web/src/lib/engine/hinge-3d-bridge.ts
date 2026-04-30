/**
 * Single source of truth for the 3D meaning of the generic UI hinge toggle.
 *
 * The legacy 2D-style `hingeStart` / `hingeEnd` checkbox represents an
 * in-plane pin hinge. In 3D that maps to releasing strong-axis bending
 * (Mz) only — releasing both bending planes plus torsion would collapse
 * the joint to a ball joint and produce a singular stiffness matrix in
 * hinged arches and other in-plane mechanisms (Bug B).
 *
 * Both the WASM solver bridge and the UI must derive their 3D wording
 * and mapping from the helpers here so they cannot drift out of step.
 */

export const HINGE_3D_RELEASED_AXIS = 'Mz' as const;

export interface PerAxisReleases3D {
  releaseMyStart: boolean;
  releaseMyEnd: boolean;
  releaseMzStart: boolean;
  releaseMzEnd: boolean;
  releaseTStart: boolean;
  releaseTEnd: boolean;
}

export function mapGenericHingeToReleases3D(
  hingeStart: boolean,
  hingeEnd: boolean,
): PerAxisReleases3D {
  return {
    releaseMyStart: false,
    releaseMyEnd: false,
    releaseMzStart: hingeStart,
    releaseMzEnd: hingeEnd,
    releaseTStart: false,
    releaseTEnd: false,
  };
}
