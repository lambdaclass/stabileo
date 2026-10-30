/**
 * The rotation of a member's own end at a hinge. The solver condenses it
 * out, so it is recovered from the member's bending equations: with the end
 * moment zero, k_θ·u = f_θ gives the rotation from the end translations, the
 * other end's rotation and the loads along the member.
 */
import type { SolverInput } from '../types';
import { elementEquivalentLoads, type DSMStepData } from '../solver-detailed';

export function memberEndRotation(input: SolverInput, data: DSMStepData, elementId: number, end: 'I' | 'J'): number {
  const el = data.elements.find((e) => e.elementId === elementId);
  const ef = data.elementForces.find((f) => f.elementId === elementId);
  if (!el || !ef || ef.uLocal.length < 6) return 0;
  const L = el.length;
  const EI = el.E * el.Iz;
  const [, vi, thI, , vj, thJ] = ef.uLocal;
  const f = elementEquivalentLoads(input, elementId, L, false, false, el.E, el.A, el.Iz).local;
  const c = EI / L ** 3;
  /* Rows θI and θJ of the unhinged bending stiffness, without their own θ terms. */
  const restI = c * (6 * L * vi - 6 * L * vj);
  const restJ = c * (6 * L * vi - 6 * L * vj);
  const kII = 4 * L * L * c, kIJ = 2 * L * L * c;
  if (el.hingeStart && el.hingeEnd) {
    const bI = f[2] - restI, bJ = f[5] - restJ;
    const det = kII * kII - kIJ * kIJ;
    const tI = (bI * kII - kIJ * bJ) / det;
    const tJ = (kII * bJ - kIJ * bI) / det;
    return end === 'I' ? tI : tJ;
  }
  if (end === 'J' && el.hingeEnd) return (f[5] - restJ - kIJ * thI) / kII;
  if (end === 'I' && el.hingeStart) return (f[2] - restI - kIJ * thJ) / kII;
  return end === 'I' ? thI : thJ;
}
