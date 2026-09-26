/**
 * AISC 360 (LRFD) and EN 1993-1-1 member checks, as the engine's checkers declare them.
 *
 * Both read the same section (`steel-props.ts`), the member's lengths (`unbraced-length.ts` —
 * the physical member's, or the stated Lb) and its stated effective-length factors. Cb (AISC) and
 * C1 (EC3) are left at 1,0, which both codes permit as the conservative value.
 */
import { checkSteelMembers, checkEc3Members } from '../../wasm-solver';
import { materialFamilyOf } from '../../steel/material-family';
import { catalogueGradeFamily } from '../../steel/grade-family';
import type { GoverningDemand } from '../../station-design-forces';
import { MOMENT_NOISE_FLOOR } from '../design-axes';
import { steelProps, type SteelProps } from './steel-props';
import { ec3Class, ec3Curves, ec3CurveLt } from './ec3-classify';
import { N, PA, gov, type CheckKind, type CheckReading, type MemberContext, type OtherCode } from './types';

function steelOnly(ctx: MemberContext): { skip: string } | null {
  const fam = materialFamilyOf(ctx.material as never, catalogueGradeFamily).family;
  if (fam !== 'steel') return { skip: 'otherCodes.skip.notSteel' };
  if (!(ctx.material.fy && ctx.material.fy > 0)) return { skip: 'otherCodes.skip.noFy' };
  return null;
}

/** Shear across the web: the larger of the two components, as the CIRSOC path takes it. */
const shear = (d: GoverningDemand) => Math.max(Math.abs(d.forces.vy), Math.abs(d.forces.vz)) * N;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const bends = (d: GoverningDemand) => Math.abs(d.forces.my) > MOMENT_NOISE_FLOOR || Math.abs(d.forces.mz) > MOMENT_NOISE_FLOOR;
const sheared = (d: GoverningDemand) => Math.abs(d.forces.vy) + Math.abs(d.forces.vz) > 0;

/**
 * What AISC 360 requires of this shape and the checker does not do. It evaluates F2 (compact
 * doubly symmetric I, yielding and lateral-torsional buckling), F6 yielding, E3 and G2 with
 * Cv1 = 1; so a noncompact flange or web in bending (F3–F5, F7, F8), a slender element in
 * compression (E7) and a web whose Cv1 is below 1 (G2.1b, G4) are named, not checked.
 * Limits from Table B4.1b and B4.1a without the root radius, as `ec3-classify.ts` reads them.
 */
export function aiscGaps(p: SteelProps, fy: number, E: number): { flexure: boolean; compression: boolean; shear: boolean } {
  const r = Math.sqrt(E / fy);
  if (p.shape === 'CHS') {
    const Dt = p.h / p.tw;
    return { flexure: Dt > (0.07 * E) / fy, compression: Dt > (0.11 * E) / fy, shear: false };
  }
  if (p.shape === 'RHS') {
    const fl = (p.b - 3 * p.tf) / p.tf, web = (p.h - 3 * p.tw) / p.tw;
    return {
      flexure: fl > 1.12 * r || web > 2.42 * r,
      compression: Math.max(fl, web) > 1.4 * r,
      shear: web > 1.1 * Math.sqrt(5) * r,
    };
  }
  const fl = p.b / (2 * p.tf), web = (p.h - 2 * p.tf) / p.tw;
  return {
    flexure: fl > 0.38 * r || web > 3.76 * r,
    compression: fl > 0.56 * r || web > 1.49 * r,
    shear: web > 1.1 * Math.sqrt(5.34) * r,
  };
}
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

export const AISC360: OtherCode = {
  id: 'aisc360',
  family: 'steel',
  labelKey: 'otherCodes.code.aisc360',
  coverageKey: 'otherCodes.coverage.aisc360',
  member(ctx) {
    const bad = steelOnly(ctx);
    if (bad) return bad;
    const p = steelProps(ctx.section);
    if ('skip' in p) return p;
    const E = ctx.material.e * PA;
    return {
      data: {
        elementId: ctx.elementId,
        fy: ctx.material.fy! * PA,
        // Presets carry fu; without it the checker evaluates gross yielding only (D2-1).
        ...((ctx.material as { fu?: number }).fu ? { fu: (ctx.material as { fu?: number }).fu! * PA } : {}),
        ag: p.A, aw: p.Aw,
        lby: ctx.L, lbz: ctx.L,
        ...(ctx.kStrong !== undefined ? { ky: ctx.kStrong } : {}),
        ...(ctx.kWeak !== undefined ? { kz: ctx.kWeak } : {}),
        iy: p.Iy, iz: p.Iz, ry: p.ry, rz: p.rz,
        zy: p.Zy, zz: p.Zz, sy: p.Sy, sz: p.Sz,
        j: p.J, cw: p.Cw, lb: ctx.Lb,
        e: E, g: E / (2 * (1 + (ctx.material.nu ?? 0.3))),
        depth: p.h,
        gaps: aiscGaps(p, ctx.material.fy!, ctx.material.e),
      },
    };
  },
  at(_ctx, d, data) {
    const g = data.gaps as ReturnType<typeof aiscGaps>;
    const flags: string[] = [];
    if (g.flexure && bends(d)) flags.push('otherCodes.check.aiscNoncompact');
    if (g.compression && d.forces.n < 0) flags.push('otherCodes.check.aiscSlender');
    if (g.shear && sheared(d)) flags.push('otherCodes.check.aiscWebShear');
    const { gaps: _g, ...rest } = data;
    return { data: rest, unevaluated: flags };
  },
  forces(ctx, d) {
    return { elementId: ctx.elementId, n: d.forces.n * N, my: d.forces.my * N, mz: d.forces.mz * N, vy: shear(d) };
  },
  run: (input) => checkSteelMembers(input),
  read(r): CheckReading {
    const ratio = num(r.unityRatio);
    // The checker names its governing check "Flexure-Y F2", "Compression E3", …
    const name = String(r.governingCheck ?? '');
    const clause = /\b([A-H]\d)\b/.exec(name)?.[1];
    const kind: CheckKind = name.startsWith('Tension') ? 'tension'
      : name.startsWith('Compression') ? 'compression'
      : name.startsWith('Flexure-Y') ? 'flexureStrong'
      : name.startsWith('Flexure-Z') ? 'flexureWeak'
      : name.startsWith('Shear') ? 'shear' : 'interaction';
    return { ratio, ...gov(kind, clause), pass: ratio <= 1, unevaluated: list(r.unevaluated) };
  },
};

export const EC3: OtherCode = {
  id: 'ec3',
  family: 'steel',
  labelKey: 'otherCodes.code.ec3',
  coverageKey: 'otherCodes.coverage.ec3',
  member(ctx) {
    const bad = steelOnly(ctx);
    if (bad) return bad;
    const p = steelProps(ctx.section);
    if ('skip' in p) return p;
    const compressed = ctx.demands.some((d) => d.forces.n < 0);
    const cls = ec3Class(p, ctx.material.fy!, compressed);
    if (cls === 4) return { skip: 'otherCodes.skip.ec3Class4' };
    const curves = ec3Curves(p);
    return {
      data: {
        elementId: ctx.elementId,
        fy: ctx.material.fy! * PA, e: ctx.material.e * PA,
        a: p.A,
        wplY: p.Zy, welY: p.Sy, wplZ: p.Zz, welZ: p.Sz,
        iy: p.Iy, iz: p.Iz, it: p.J, iw: p.Cw,
        lcrY: (ctx.kStrong ?? 1) * ctx.L, lcrZ: (ctx.kWeak ?? 1) * ctx.L, lb: ctx.Lb,
        sectionClass: `Class${cls}`,
        bucklingCurveY: curves.y, bucklingCurveZ: curves.z, bucklingCurveLt: ec3CurveLt(p),
        av: p.Aw,
      },
    };
  },
  /*
   * The checker combines axial force and bending by NEd/Nb,Rd + My,Ed/Mb,Rd + Mz,Ed/Mc,Rd,
   * without the k factors of 6.3.3 (Annex A or B), which exceed 1 under near-uniform moment; it
   * does not reduce the moment resistance for shear above 0,5·Vpl,Rd (6.2.8) nor check shear
   * buckling of the web (6.2.6(6)). Those demands come back incomplete.
   */
  at(ctx, d, data) {
    const flags: string[] = [];
    if (d.forces.n < 0 && bends(d)) flags.push('otherCodes.check.ec3Interaction');
    const fy = ctx.material.fy!;
    const vpl = ((data.av as number) * fy * 1e3) / Math.sqrt(3); // kN
    if (bends(d) && shear(d) / N > 0.5 * vpl) flags.push('otherCodes.check.ec3ShearBending');
    const p = steelProps(ctx.section);
    if (!('skip' in p) && p.shape !== 'CHS' && sheared(d)) {
      const hw = p.shape === 'RHS' ? p.h - 3 * p.tw : p.h - 2 * p.tf;
      // 72ε/η with η = 1,2 (steels up to S460), the lower of the two the code allows.
      if (hw / p.tw > (72 * Math.sqrt(235 / fy)) / 1.2) flags.push('otherCodes.check.ec3ShearBuckling');
    }
    return { data, unevaluated: flags };
  },
  forces(ctx, d) {
    return { elementId: ctx.elementId, nEd: d.forces.n * N, myEd: d.forces.my * N, mzEd: d.forces.mz * N, vEd: shear(d) };
  },
  run: (input) => checkEc3Members(input),
  read(r): CheckReading {
    const parts: Array<[CheckKind, string, number]> = [
      ['compression', '6.3.1', num(r.compressionRatio)], ['tension', '6.2.3', num(r.tensionRatio)],
      ['flexureStrong', '6.3.2', num(r.flexureRatioY)], ['flexureWeak', '6.2.5', num(r.flexureRatioZ)],
      ['shear', '6.2.6', num(r.shearRatio)], ['interaction', '6.3.3', num(r.interactionRatio)],
    ];
    const [kind, clause, ratio] = parts.reduce((a, b) => (b[2] > a[2] ? b : a));
    return { ratio, ...gov(kind, clause), pass: r.pass === true, unevaluated: list(r.unevaluated) };
  },
};
