/**
 * AISI S100 (LRFD) for lipped cold-formed channels, as the engine's checker declares it.
 *
 * The effective section comes from `cfs-effective.ts`; J from the section (or its thin-walled
 * sum), Cw from the channel's closed form. What the checker leaves out for this shape is said on
 * every demand it applies to, so the member reads incomplete rather than passing:
 *
 *   · distortional buckling: the checker takes the distortional stresses as inputs and the
 *     model has no source for them, so it is never evaluated;
 *   · compression: the checker buckles the member about its weak axis only, and a channel is
 *     singly symmetric — flexural-torsional buckling (E2) is not in it;
 *   · weak-axis bending: the effective modulus about the weak axis depends on which edge is in
 *     compression and is not computed;
 *   · web shear past h/t = √(E·kv/Fy): only the yielding branch of G2.1 is sent.
 *
 * Zeds are refused: their principal axes are rotated and the model has no product of inertia.
 *
 * ── Lateral-torsional buckling: what is sent is not the section's J and Cw ──
 *
 * The checker computes Me = Cb·(π/Lb)·√(E·Iy·G·J)·(1 + √X), X = π²·E·Cw/(G·J·Lb²), with G fixed
 * at E/2,6. F2.1 reads √(1 + X) where the checker has 1 + √X, which is always larger: Me comes out
 * high, on the unsafe side (12 % on the ratio of a 3 m C 150×60×20×2). Until the checker is
 * corrected, `ltbInputs` sends the J and Cw that make its expression equal the code's for this
 * member — J scaled so √(G·J) is the material's, Cw so that 1 + √X' = √(1 + X). J and Cw enter
 * nothing else in the checker. `cfs-code.test.ts` pins the checker's present expression, so the
 * correction cannot outlive the defect unnoticed.
 */
import { checkCfsMembers } from '../../wasm-solver';
import { materialFamilyOf } from '../../steel/material-family';
import { catalogueGradeFamily } from '../../steel/grade-family';
import { steelSectionConstants } from '../../steel/section-constants';
import { MOMENT_NOISE_FLOOR } from '../design-axes';
import { cfsEffective } from './cfs-effective';
import { N, PA, gov, type CheckKind, type CheckReading, type OtherCode } from './types';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const KV = 5.34; // unstiffened web, G2.3
/** The shear modulus the checker assumes, as a fraction of E. */
const CHECKER_G = 1 / 2.6;

/** J and Cw for the checker, such that its Me is F2.1's for this member (see the header). */
export function ltbInputs(E: number, nu: number, J: number, Cw: number, Lb: number): { j: number; cw: number } {
  const G = E / (2 * (1 + nu));
  const j = (J * G) / (E * CHECKER_G);
  if (!(Cw > 0 && J > 0 && Lb > 0)) return { j, cw: Cw };
  const X = (Math.PI ** 2 * E * Cw) / (G * J * Lb * Lb);
  return { j, cw: (Cw * (Math.sqrt(1 + X) - 1) ** 2) / X };
}

export const AISI_S100: OtherCode = {
  id: 'aisiS100',
  family: 'coldFormed',
  labelKey: 'otherCodes.code.aisiS100',
  coverageKey: 'otherCodes.coverage.aisiS100',
  member(ctx) {
    const fam = materialFamilyOf(ctx.material as never, catalogueGradeFamily).family;
    if (fam !== 'steel') return { skip: 'otherCodes.skip.notSteel' };
    const fy = ctx.material.fy;
    if (!(fy && fy > 0)) return { skip: 'otherCodes.skip.noFy' };
    const s = ctx.section;
    if (s.shape === 'Z') return { skip: 'otherCodes.skip.zedPrincipal' };
    // `t` is the lip LENGTH on a C; one sheet thickness runs through web, flange and lip.
    if (s.shape !== 'C' || !(s.t && s.t > 0)) return { skip: 'otherCodes.skip.shapeNotCovered' };
    const t = s.tw ?? s.tf ?? s.tl;
    if (!(t && t > 0) || !(s.h && s.b)) return { skip: 'otherCodes.skip.noThickness' };
    if ([s.tf, s.tl].some((x) => x !== undefined && Math.abs(x - t) > 1e-6)) return { skip: 'otherCodes.skip.notSingleSheet' };
    const E = ctx.material.e * PA, Fy = fy * PA;
    const eff = cfsEffective({ H: s.h, B: s.b, C: s.t, t }, Fy, E);
    if (!eff) return { skip: 'otherCodes.skip.lipOutOfRange' };
    const iz = s.iz, A = eff.ag;
    const hWeb = s.h - 2 * t;
    const shearExact = hWeb / t <= Math.sqrt((E * KV) / Fy);
    return {
      data: {
        elementId: ctx.elementId,
        fy: Fy, e: E,
        ag: A, ae: eff.ae,
        ix: eff.ix, seX: eff.seX, sfX: eff.sfX,
        iy: iz, seY: 0,
        rx: Math.sqrt(eff.ix / A), ry: Math.sqrt(iz / A),
        ...ltbInputs(E, ctx.material.nu ?? 0.3, steelSectionConstants(s as never).J, eff.cw, ctx.Lb),
        lb: ctx.Lb, lc: ctx.L,
        ...(ctx.kWeak !== undefined ? { k: ctx.kWeak } : {}),
        ...(shearExact ? { h: hWeb, t } : {}),
      },
    };
  },
  at(_ctx, d, data) {
    const flags = ['otherCodes.check.cfsDistortional'];
    if (d.forces.n < 0) flags.push('otherCodes.check.cfsFlexuralTorsional');
    if (Math.abs(d.forces.mz) > MOMENT_NOISE_FLOOR) flags.push('otherCodes.check.cfsWeakAxis');
    if (data.h === undefined && Math.abs(d.forces.vy) + Math.abs(d.forces.vz) > 0) flags.push('otherCodes.check.cfsWebShear');
    return { data, unevaluated: flags };
  },
  forces(ctx, d) {
    return {
      elementId: ctx.elementId,
      axial: d.forces.n * N, mx: d.forces.my * N, my: d.forces.mz * N,
      shear: Math.max(Math.abs(d.forces.vy), Math.abs(d.forces.vz)) * N,
    };
  },
  run: (input) => checkCfsMembers(input),
  read(r): CheckReading {
    const parts: Array<[CheckKind, string, number]> = [
      ['compression', 'E', num(r.compressionRatio)], ['tension', 'D', num(r.tensionRatio)],
      ['flexureStrong', 'F', num(r.flexureRatioX)], ['flexureWeak', 'F', num(r.flexureRatioY)],
      ['shear', 'G', num(r.shearRatio)], ['interaction', 'H', num(r.interactionRatio)],
    ];
    const [kind, clause, ratio] = parts.reduce((a, b) => (b[2] > a[2] ? b : a));
    return { ratio, ...gov(kind, clause), pass: r.pass === true, unevaluated: [] };
  },
};
