/**
 * Capacity design of a concrete frame (CIRSOC 201-2025 Cap. 18, with the overstrength of
 * INPRES-CIRSOC 103 Parte II taken as a project value λo):
 *
 *   Beams     the probable moments at both ends, Mpr = Mn with λo·fy and φ = 1, the negative ones
 *             with the slab bars inside the effective flange; the capacity shear
 *             Ve = (Mpr,i + Mpr,j)/ln + Vg for each sense of sway; Vc = 0 where the earthquake's
 *             part is half Ve or more (§18.6.5.2); hoops over 2h from each face at
 *             s ≤ min(d/4, 6·db, 150 mm) (§18.6.4).
 *   Columns   ΣMn of the columns at a joint, at the axial load that gives the least, against
 *             the strong-column ratio times ΣMn of the beams (§18.7.3.2); the capacity shear
 *             from the columns' own probable moments, not more than the beams can deliver
 *             (§18.7.6.1); Vc = 0 under low axial load; confinement over lo at so and Ash
 *             (§18.7.5).
 *   Joints    Vj = λo·fy·(As,top + As,bottom of the beams on each side) − Vcol against
 *             φ·γ·√f'c·Aj, γ 1,7 / 1,2 / 1,0 by how the joint is confined, φ = 0,85 (§18.8.4).
 *
 * Where Vc is not zero it is Tabla 22.5.5.1 (a), with √f'c ≤ 8,3 MPa (§22.5.3.1), and Vs reads fyt ≤ 420 MPa
 * (§22.5.3.3): the seismic chapter sends the shear strength to §22.5 and changes only when Vc is zero. The
 * joint's φ·γ·√f'c·Aj is not capped: §22.5.3.1 limits Vc, Vci and Vcw of one-way shear.
 *
 * kN, m, MPa; steel areas in cm² where noted.
 */
import { computeFlexureCapacity } from '../../station-design-forces';
import { interactionCurve, type Bar, type Outline } from '../../codes/argentina/cirsoc201-section';
import { shearFy, shearSqrtFc } from '../../codes/argentina/cirsoc201-basis';

// ─── Beams ──────────────────────────────────────────────────────────

/** Mn with λo·fy and φ = 1, kN·m. Tension and compression steel in cm². */
export function probableMoment(b: number, d: number, dPrime: number, fc: number, fy: number, overstrength: number, tension: number, compression: number): number {
  const r = computeFlexureCapacity(tension, b, d, fc, overstrength * fy, compression, dPrime);
  return r ? r.phiMn / r.phi : 0;
}

export interface BeamCapacityInput {
  b: number; h: number; d: number; dPrime: number; fc: number; fy: number; fyt: number;
  /** Top and bottom steel at each end face, cm². */
  ends: [{ top: number; bottom: number }, { top: number; bottom: number }];
  /** Slab bars inside the effective flange at each end, cm², added to the top. */
  slabTop?: [number, number];
  /** Clear span, m. */
  ln: number;
  /** Gravity shear at each end (1,2D + L), kN, magnitude. */
  vg: [number, number];
  /** Hoops in the end zones. */
  hoops: { diameter: number; legs: number; spacing: number; length: number };
  /** The thinnest longitudinal bar, mm. */
  longMinDiaMm: number;
  overstrength: number;
}

export interface BeamCapacityResult {
  mprNeg: [number, number]; mprPos: [number, number];
  ve: number; vSeismic: number; vcZero: boolean;
  phiVn: number; utilization: number;
  hoops: { length: number; spacing: number; lengthOk: boolean; spacingOk: boolean };
}

const area = (dia: number) => (Math.PI * dia * dia) / 400; // cm²

export function beamCapacityShear(i: BeamCapacityInput): BeamCapacityResult {
  const neg = (k: 0 | 1) => probableMoment(i.b, i.d, i.dPrime, i.fc, i.fy, i.overstrength, i.ends[k].top + (i.slabTop?.[k] ?? 0), i.ends[k].bottom);
  const pos = (k: 0 | 1) => probableMoment(i.b, i.d, i.dPrime, i.fc, i.fy, i.overstrength, i.ends[k].bottom, i.ends[k].top);
  const mprNeg: [number, number] = [neg(0), neg(1)], mprPos: [number, number] = [pos(0), pos(1)];
  const vSeismic = Math.max(mprNeg[0] + mprPos[1], mprPos[0] + mprNeg[1]) / i.ln;
  const ve = vSeismic + Math.max(i.vg[0], i.vg[1]);
  const vcZero = vSeismic >= 0.5 * ve;
  const vc = vcZero ? 0 : 0.17 * shearSqrtFc(i.fc) * i.b * i.d * 1000;
  const vs = Math.min((i.hoops.legs * area(i.hoops.diameter) * 1e-4 * shearFy(i.fyt) * 1000 * i.d) / i.hoops.spacing, 0.66 * Math.sqrt(i.fc) * i.b * i.d * 1000);
  const phiVn = 0.75 * (vc + vs);
  const sMax = Math.min(i.d / 4, (6 * i.longMinDiaMm) / 1000, 0.15);
  return {
    mprNeg, mprPos, ve, vSeismic, vcZero, phiVn, utilization: ve / phiVn,
    hoops: { length: 2 * i.h, spacing: sMax, lengthOk: i.hoops.length >= 2 * i.h - 1e-9, spacingOk: i.hoops.spacing <= sMax + 1e-9 },
  };
}

/** The hoop spacing a capacity shear needs, m, rounded down to 2,5 cm; null when even 5 cm will not do. */
export function hoopSpacingFor(ve: number, vcZero: boolean, b: number, d: number, fc: number, fyt: number, dia: number, legs: number): number | null {
  const vc = vcZero ? 0 : 0.17 * shearSqrtFc(fc) * b * d * 1000;
  const vsReq = ve / 0.75 - vc;
  if (vsReq > 0.66 * Math.sqrt(fc) * b * d * 1000) return null;
  if (vsReq <= 0) return Infinity;
  const s = (legs * area(dia) * 1e-4 * shearFy(fyt) * 1000 * d) / vsReq;
  const r = Math.floor(s * 40 + 1e-9) / 40;
  return r >= 0.05 ? r : null;
}

// ─── Columns ────────────────────────────────────────────────────────

/** Mn of a section at an axial load, kN·m, bending with compression toward `theta`; fy as given. */
export function nominalMomentAt(outline: Outline, bars: readonly Bar[], fc: number, fy: number, theta: number, P: number): number {
  const curve = interactionCurve(outline, bars, { fc, fy, confinement: 'ties' }, theta, 60);
  const pick = (p: { Mnx: number; Mny: number }) => Math.abs(Math.abs(Math.sin(theta)) > 0.5 ? p.Mnx : p.Mny);
  let best = 0;
  for (let k = 1; k < curve.length; k++) {
    const a = curve[k - 1]!, b = curve[k]!;
    if ((a.Pn - P) * (b.Pn - P) > 0 || a.Pn === b.Pn) continue;
    const t = (P - a.Pn) / (b.Pn - a.Pn);
    best = Math.max(best, pick(a) + t * (pick(b) - pick(a)));
  }
  return best;
}

export interface StrongColumnInput {
  /** Mn of each column at the joint at its least favourable axial load, kN·m. */
  columns: number[];
  /** Mn of the beams framing in along the direction, the negative one with its slab, kN·m. */
  beams: number[];
  ratio: number;
}

export function strongColumn(i: StrongColumnInput): { sumColumns: number; sumBeams: number; required: number; utilization: number; ok: boolean } {
  const sc = i.columns.reduce((s, m) => s + m, 0), sb = i.beams.reduce((s, m) => s + m, 0);
  const required = i.ratio * sb;
  return { sumColumns: sc, sumBeams: sb, required, utilization: sc > 0 ? required / sc : Infinity, ok: sc >= required - 1e-9 };
}

export interface ColumnShearInput {
  b: number; h: number; d: number; fc: number; fyt: number;
  /** Probable moments at the top and the bottom, kN·m. */
  mpr: [number, number];
  /** What the beams at each joint can deliver into this column (their probable moments, its share), kN·m. */
  fromBeams?: [number, number];
  /** Clear height, m. */
  lu: number;
  /** Shear of the analysis, kN. */
  vu: number;
  /** Least factored axial load among the seismic combinations, kN, compression positive. */
  pu: number;
  ties: { diameter: number; legs: number; spacing: number };
}

export function columnCapacityShear(i: ColumnShearInput) {
  const own = (i.mpr[0] + i.mpr[1]) / i.lu;
  const beams = i.fromBeams ? (i.fromBeams[0] + i.fromBeams[1]) / i.lu : Infinity;
  const ve = Math.max(Math.min(own, beams), i.vu);
  const vcZero = i.pu < (i.b * i.h * i.fc * 1000) / 20 && (ve - i.vu) >= 0.5 * ve;
  const vc = vcZero ? 0 : 0.17 * shearSqrtFc(i.fc) * i.b * i.d * 1000;
  const vs = Math.min((i.ties.legs * area(i.ties.diameter) * 1e-4 * shearFy(i.fyt) * 1000 * i.d) / i.ties.spacing, 0.66 * Math.sqrt(i.fc) * i.b * i.d * 1000);
  const phiVn = 0.75 * (vc + vs);
  return { ve, own, beams, vcZero, phiVn, utilization: ve / phiVn };
}

export interface ConfinementInput {
  b: number; h: number; cover: number; lu: number; fc: number; fyt: number;
  /** Thinnest longitudinal bar, mm; tie diameter, mm; tie legs crossing the b side and the h side. */
  longMinDiaMm: number; tieDiaMm: number; legsB: number; legsH: number;
  /** Largest distance between laterally supported bars, m. */
  hx: number;
  provided: { length: number; spacing: number };
}

/** §18.7.5: the critical length lo, the spacing so and Ash in both directions. */
export function columnConfinement(i: ConfinementInput) {
  const lo = Math.max(i.b, i.h, i.lu / 6, 0.45);
  const s0 = Math.min(0.15, Math.max(0.1, 0.1 + (0.35 - i.hx) / 3));
  const so = Math.min(Math.min(i.b, i.h) / 4, (6 * i.longMinDiaMm) / 1000, s0);
  const bc = (x: number) => x - 2 * i.cover;
  const Ach = bc(i.b) * bc(i.h), Ag = i.b * i.h;
  const ashReq = (core: number, s: number) => Math.max(0.3 * ((s * core * i.fc) / i.fyt) * (Ag / Ach - 1), (0.09 * s * core * i.fc) / i.fyt) * 1e4; // cm²
  const ash = (legs: number) => legs * area(i.tieDiaMm);
  // Each direction against its own core: the legs crossing b against bc = b − 2·cover, and so on.
  const ashB = ashReq(bc(i.b), i.provided.spacing), ashH = ashReq(bc(i.h), i.provided.spacing);
  return {
    lo, so, ashRequired: { acrossB: ashB, acrossH: ashH },
    ashProvided: { acrossB: ash(i.legsB), acrossH: ash(i.legsH) },
    lengthOk: i.provided.length >= lo - 1e-9, spacingOk: i.provided.spacing <= so + 1e-9,
    ashOk: ash(i.legsB) >= ashB - 1e-9 && ash(i.legsH) >= ashH - 1e-9,
  };
}

// ─── Joints ─────────────────────────────────────────────────────────

export type JointConfinementKind = 'fourFaces' | 'threeOrOpposite' | 'other';
export const JOINT_GAMMA: Record<JointConfinementKind, number> = { fourFaces: 1.7, threeOrOpposite: 1.2, other: 1.0 };

export function seismicJointShear(i: {
  fc: number; fy: number; overstrength: number;
  /** Top steel of the beam on one side and bottom steel of the beam on the other, cm² (0 where none). */
  topOneSide: number; bottomOtherSide: number;
  columnShear: number; aj: number; confinement: JointConfinementKind;
}) {
  const T = i.overstrength * i.fy * 1000 * (i.topOneSide + i.bottomOtherSide) * 1e-4;
  const vj = Math.max(0, T - i.columnShear);
  const phiVn = 0.85 * JOINT_GAMMA[i.confinement] * Math.sqrt(i.fc) * i.aj * 1000;
  return { T, vj, phiVn, utilization: vj / phiVn };
}
