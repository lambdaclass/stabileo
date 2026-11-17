import { columnConfinement as baseConfinement } from '../engine/design/seismic/capacity';
export { beamCapacityShear, columnCapacityShear, hoopSpacingFor, nominalMomentAt } from '../engine/design/seismic/capacity';
export interface ConfinementInput {
  b: number; h: number; cover: number; lu: number; fc: number; fyt: number;

  longMinDiaMm: number; tieDiaMm: number; legsB: number; legsH: number;

  hx: number;
  provided: { length: number; spacing: number };

  pu?: number; nl?: number;
}

export const highAxialColumn = (i: { b: number; h: number; fc: number; pu?: number }): boolean => (i.pu ?? 0) > 0.3 * i.b * i.h * i.fc * 1000 || i.fc > 70;

export function columnConfinement(i: ConfinementInput) {
  const { lo, so } = baseConfinement(i);
  const bc = (x: number) => x - 2 * i.cover;
  const Ach = bc(i.b) * bc(i.h), Ag = i.b * i.h;
  const high = highAxialColumn(i);
  const kf = Math.max(1, i.fc / 175 + 0.6), nl = Math.max(i.nl ?? 4, 3), kn = nl / (nl - 2);
  const perArea = Math.max(0.3 * (i.fc / i.fyt) * (Ag / Ach - 1), 0.09 * i.fc / i.fyt, high ? (0.2 * kf * kn * (i.pu ?? 0) / 1000) / (i.fyt * Ach) : 0);
  const ashReq = (core: number, s: number) => perArea * s * core * 1e4;
  const ash = (legs: number) => legs * Math.PI * (i.tieDiaMm / 10) ** 2 / 4;

  const ashB = ashReq(bc(i.b), i.provided.spacing), ashH = ashReq(bc(i.h), i.provided.spacing);
  return {
    lo, so, high, hxMax: high ? 0.2 : 0.35, ashRequired: { acrossB: ashB, acrossH: ashH },
    ashProvided: { acrossB: ash(i.legsB), acrossH: ash(i.legsH) },

    ashSpacing: Math.min(ash(i.legsB) / Math.max(ashReq(bc(i.b), 1), 1e-12), ash(i.legsH) / Math.max(ashReq(bc(i.h), 1), 1e-12)),
    lengthOk: i.provided.length >= lo - 1e-9, spacingOk: i.provided.spacing <= so + 1e-9,
    ashOk: ash(i.legsB) >= ashB - 1e-9 && ash(i.legsH) >= ashH - 1e-9,
  };
}
