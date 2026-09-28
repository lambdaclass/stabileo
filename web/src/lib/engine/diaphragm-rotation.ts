/**
 * A rigid diaphragm holds its nodes' rotation about its normal too.
 *
 * A diaphragm is rigid in its plane: its nodes translate in it as one body, and they turn about
 * its normal with it. The engine's diaphragm couples the in-plane translations to the master and
 * leaves each slave's rotation about the normal free, so a column head under a rigid floor turned
 * on its own: in a validation model the heads of one floor rotated from 2.22e-6 to 2.73e-6 rad
 * where the floor turns 2.24e-6 as a whole, and the columns' torsion and minor-axis shear came out
 * with it. Each slave's rotation about the normal is tied here to the master's.
 *
 * Pure.
 */
import type { Constraint3D } from './types-3d';

/** The rotation DOF about each plane's normal: rx 3, ry 4, rz 5. */
const NORMAL_ROTATION: Record<string, number> = { XY: 5, XZ: 4, YZ: 3 };

/** The constraints, with an equal rotation about its normal for every slave of every diaphragm. */
export function withDiaphragmRotation(constraints: readonly Constraint3D[]): Constraint3D[] {
  const out: Constraint3D[] = [...constraints];
  for (const c of constraints) {
    if (c.type !== 'diaphragm') continue;
    const dof = NORMAL_ROTATION[(c.plane ?? 'XY').toUpperCase()];
    if (dof === undefined) continue;
    for (const s of c.slaveNodes) {
      if (s !== c.masterNode) out.push({ type: 'equalDOF', masterNode: c.masterNode, slaveNode: s, dofs: [dof] });
    }
  }
  return out;
}
