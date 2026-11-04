/**
 * Shear a slab carries without shear reinforcement, CIRSOC 201-2025 Tabla 22.5.5.1(c):
 * Vc = 0,66·λs·λ·ρw^⅓·√f'c·bw·d, with the size factor λs = √(2/(1 + 0,004·d)) ≤ 1 (d in mm).
 * √f'c ≤ 8,3 MPa (§22.5.3.1). Shared by the ribs, the composite deck and the stair waist. m, kN, MPa; Vc in kN.
 */
import { shearSqrtFc } from '../../codes/argentina/cirsoc201-basis';

export function slabVc(fc: number, bw: number, d: number, rhoW: number, lambda = 1): { vc: number; lambdaS: number } {
  const lambdaS = Math.min(1, Math.sqrt(2 / (1 + 0.004 * d * 1000)));
  return { vc: 0.66 * lambdaS * lambda * Math.cbrt(Math.max(rhoW, 0)) * shearSqrtFc(fc) * bw * d * 1000, lambdaS };
}
