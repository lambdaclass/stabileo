/**
 * AISC 360 (LRFD) and EN 1993-1-1 member checks, as the engine's checkers declare them.
 *
 * Both read the same section (`steel-props.ts`), the member's lengths (`unbraced-length.ts` —
 * the physical member's, or the stated Lb) and its stated effective-length factors. Cb (AISC) and
 * C1 (EC3) are left at 1,0, which both codes permit as the conservative value. The app does not
 * know where a transverse load acts on the section, so the EC3 Mcr takes it on the top flange
 * (zg = h/2, C2 = C1), the lowest value; the checker refuses LTB without the section's depth. The
 * AISC checker likewise takes it on the top flange (Cb/1,4).
 */
import { checkSteelMembers, checkEc3Members } from '../../wasm-solver';
import { materialFamilyOf } from '../../steel/material-family';
import { catalogueGradeFamily } from '../../steel/grade-family';
import type { GoverningDemand } from '../../station-design-forces';
import { MOMENT_NOISE_FLOOR } from '../design-axes';
import { steelProps, type SteelProps } from './steel-props';
import { ec3Class, ec3Curves, ec3CurveLt } from './ec3-classify';
import { N, PA, gov, upScaled, type CheckKind, type CheckReading, type MemberContext, type OtherCode, type StationBound3D } from './types';

function steelOnly(ctx: MemberContext): { skip: string } | null {
  const fam = materialFamilyOf(ctx.material as never, catalogueGradeFamily).family;
  if (fam !== 'steel') return { skip: 'otherCodes.skip.notSteel' };
  if (!(ctx.material.fy && ctx.material.fy > 0)) return { skip: 'otherCodes.skip.noFy' };
  return null;
}

/** Shear across the web: the larger of the two components, as the CIRSOC path takes it. */
/*
 * The checkers take one shear force against the web area. The web (parallel to h) carries vz, the
 * shear of the strong-axis moment; vy runs across it and is carried by the flanges of an I or the
 * side walls of a tube. The larger of the two was sent against the web area for either direction,
 * so an RHS 200×100×6 under Vy = 300 kN passed at 0,84 where its side walls give 1,68. vy is now
 * scaled to the web area by the ratio of the two, which sends the same utilisation.
 */
const shear = (d: GoverningDemand, p?: { Aw: number; AwWeak: number }) =>
  Math.max(Math.abs(d.forces.vz), Math.abs(d.forces.vy) * (p && p.AwWeak > 0 ? p.Aw / p.AwWeak : 1)) * N;
/** The bound on `shear`: max is 1-Lipschitz in each argument, so it takes the bounds the same way. */
const shearBound = (sb: StationBound3D, p?: { Aw: number; AwWeak: number }) =>
  upScaled(Math.max(sb.shearZ, upScaled(sb.shearY, p && p.AwWeak > 0 ? p.Aw / p.AwWeak : 1)), N);
/** The bound on every steel checker's force row: N, My, Mz and the web shear, in N and N·m. */
const steelBound = (ctx: MemberContext, sb: StationBound3D) =>
  ({ n: upScaled(sb.axial, N), my: upScaled(sb.momentY, N), mz: upScaled(sb.momentZ, N), vy: shearBound(sb, areasOf(ctx)) });
/**
 * The two shear areas of each member being checked, once per member: `shear` reads them once per
 * demand, and running the section engine (steelProps) there is what `ec3WebSlenderness` below
 * stopped doing. `member` fills them from the properties it already has; a context it has not
 * seen reads them here, once. Keyed by the member's context, which lives for one run.
 */
const webAreas = new WeakMap<object, { Aw: number; AwWeak: number } | undefined>();
function areasOf(ctx: MemberContext): { Aw: number; AwWeak: number } | undefined {
  if (!webAreas.has(ctx)) {
    const p = steelProps(ctx.section);
    webAreas.set(ctx, 'skip' in p ? undefined : { Aw: p.Aw, AwWeak: p.AwWeak });
  }
  return webAreas.get(ctx);
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const bends = (d: GoverningDemand) => Math.abs(d.forces.my) > MOMENT_NOISE_FLOOR || Math.abs(d.forces.mz) > MOMENT_NOISE_FLOOR;
const sheared = (d: GoverningDemand) => Math.abs(d.forces.vy) + Math.abs(d.forces.vz) > 0;

/**
 * What AISC 360 requires of this shape and the checker does not do. It evaluates F2 (compact
 * doubly symmetric I, yielding and lateral-torsional buckling), F6 yielding, E3 with the E7
 * slender-element reduction (from `aiscElements`) and G2 with Cv1 = 1; so a noncompact flange or
 * web in bending (F3–F5, F7, F8) and a web whose Cv1 is below 1 (G2.1b, G4) are named, not
 * checked. `compression` is kept for the record; the checker now reduces such a section.
 * Limits from Table B4.1b and B4.1a without the root radius, as `ec3-classify.ts` reads them.
 */
export function aiscGaps(p: SteelProps, fy: number, E: number): { flexure: boolean; compression: boolean; shear: boolean } {
  const r = Math.sqrt(E / fy);
  if (p.shape === 'CHS') {
    const Dt = p.h / p.tw;
    // G5 Eq. (G5-2b) reduces Fcr below 0.6·Fy once 0.78·E/(D/t)^(3/2) < 0.6·Fy, and G5/B4.1
    // do not permit round HSS with D/t > 0.45·E/Fy.
    const dtShearYield = Math.cbrt((0.78 / 0.6) ** 2) * Math.cbrt((E / fy) ** 2);
    return {
      flexure: Dt > (0.07 * E) / fy,
      compression: Dt > (0.11 * E) / fy,
      shear: Dt > Math.min(dtShearYield, (0.45 * E) / fy),
    };
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

/**
 * The plate elements the checker's E7 slender-element reduction reads (Table B4.1a): an I's four
 * flange outstands (rolled case 1 when picked from a rolled catalogue, else welded case 2 with
 * the kc lower bound) and its web between the flanges (no root radius: the wider, conservative
 * width); a rectangular tube's walls at width − 3t; a round tube's D/t.
 */
export function aiscElements(p: SteelProps, rolled: boolean) {
  if (p.shape === 'CHS') return [{ kind: 'roundHss', b: p.h, t: p.tw }];
  if (p.shape === 'RHS') {
    return [
      { kind: 'hssWall', b: p.b - 3 * p.tf, t: p.tf, count: 2 },
      { kind: 'hssWall', b: p.h - 3 * p.tw, t: p.tw, count: 2 },
    ];
  }
  return [
    { kind: rolled ? 'rolledFlange' : 'weldedFlange', b: p.b / 2, t: p.tf, count: 4 },
    { kind: 'web', b: p.h - 2 * p.tf, t: p.tw },
  ];
}

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
    webAreas.set(ctx, { Aw: p.Aw, AwWeak: p.AwWeak });
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
        ...(p.shape === 'I' ? { flangeSlenderness: p.b / (2 * p.tf) } : {}),
        compressionElements: aiscElements(p, !!(ctx.section as { profileFamily?: string }).profileFamily),
        gaps: aiscGaps(p, ctx.material.fy!, ctx.material.e),
      },
    };
  },
  at(_ctx, d, data) {
    const g = data.gaps as ReturnType<typeof aiscGaps>;
    const flags: string[] = [];
    if (g.flexure && bends(d)) flags.push('otherCodes.check.aiscNoncompact');
    if (g.shear && sheared(d)) flags.push('otherCodes.check.aiscWebShear');
    const { gaps: _g, ...rest } = data;
    return { data: rest, unevaluated: flags };
  },
  forces(ctx, d) {
    return { elementId: ctx.elementId, n: d.forces.n * N, my: d.forces.my * N, mz: d.forces.mz * N, vy: shear(d, areasOf(ctx)) };
  },
  run: (input) => checkSteelMembers(input),
  certify: { name: 'certify_steel_members', bound: (ctx, _d, _data, sb) => steelBound(ctx, sb) },
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

/**
 * hw/tw of each member being checked, from `member` — `at` runs once per demand, and computing
 * it there ran the section engine (steelProps) thousands of times per check on a large model.
 * Keyed by the member's context, which lives for one run. null: a CHS, which has no web.
 */
const ec3WebSlenderness = new WeakMap<object, number | null>();

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
    // Class 4 I and RHS: the checker computes Aeff and Weff from the geometry sent below
    // (EN 1993-1-5 4.4). A Class 4 CHS is EN 1993-1-6, which it does not implement.
    if (cls === 4 && p.shape === 'CHS') return { skip: 'otherCodes.skip.ec3Class4' };
    // Rolled only when picked from a rolled catalogue family, as the CIRSOC 301 verification.
    const rolled = !!(ctx.section as { profileFamily?: string }).profileFamily;
    const curves = ec3Curves(p, rolled);
    webAreas.set(ctx, { Aw: p.Aw, AwWeak: p.AwWeak });
    // The web slenderness `at` checks shear buckling against, once per member, not per demand.
    ec3WebSlenderness.set(ctx, p.shape === 'CHS' ? null : (p.shape === 'RHS' ? p.h - 3 * p.tw : p.h - 2 * p.tf) / p.tw);
    return {
      data: {
        elementId: ctx.elementId,
        fy: ctx.material.fy! * PA, e: ctx.material.e * PA,
        a: p.A,
        wplY: p.Zy, welY: p.Sy, wplZ: p.Zz, welZ: p.Sz,
        iy: p.Iy, iz: p.Iz, it: p.J, iw: p.Cw,
        lcrY: (ctx.kStrong ?? 1) * ctx.L, lcrZ: (ctx.kWeak ?? 1) * ctx.L, lb: ctx.Lb,
        sectionClass: `Class${cls}`,
        bucklingCurveY: curves.y, bucklingCurveZ: curves.z, bucklingCurveLt: ec3CurveLt(p, rolled),
        av: p.Aw,
        // The depth the default top-flange load height of Mcr is measured from, and the plates
        // a Class 4 effective section is computed from. r = 0: the root radius is not held, and
        // the flat widths without it are the larger ones (lower ρ).
        geometry: p.shape === 'I' ? { shape: 'I', h: p.h, b: p.b, tw: p.tw, tf: p.tf, r: 0 }
          : p.shape === 'RHS' ? { shape: 'RHS', h: p.h, b: p.b, t: p.tw }
          : { shape: 'CHS', d: p.h, t: p.tw },
        // 6.3.3 with Annex B factors: Cmy, Cmz, CmLT are left to the checker's Table B.3 upper
        // bound 1,0; a hollow section is not susceptible to torsional deformations (Table B.1).
        interaction: { hollow: p.shape === 'RHS' || p.shape === 'CHS' },
      },
    };
  },
  /*
   * The checker combines axial force and bending by 6.3.3, eqs. (6.61)/(6.62) with the Annex B
   * interaction factors (it used to be a linear sum with every k = 1, unconservative where
   * Annex B gives k > 1). It does not reduce the moment resistance for shear above
   * 0,5·Vpl,Rd (6.2.8) nor check shear buckling of the web (6.2.6(6)). Those demands come back
   * incomplete.
   */
  at(ctx, d, data) {
    const flags: string[] = [];
    const fy = ctx.material.fy!;
    const vpl = ((data.av as number) * fy * 1e3) / Math.sqrt(3); // kN
    if (bends(d) && shear(d, areasOf(ctx)) / N > 0.5 * vpl) flags.push('otherCodes.check.ec3ShearBending');
    const slender = ec3WebSlenderness.get(ctx);
    // 72ε/η with η = 1,2 (steels up to S460), the lower of the two the code allows.
    if (slender != null && sheared(d) && slender > (72 * Math.sqrt(235 / fy)) / 1.2) flags.push('otherCodes.check.ec3ShearBuckling');
    return { data, unevaluated: flags };
  },
  forces(ctx, d) {
    return { elementId: ctx.elementId, nEd: d.forces.n * N, myEd: d.forces.my * N, mzEd: d.forces.mz * N, vEd: shear(d, areasOf(ctx)) };
  },
  run: (input) => checkEc3Members(input),
  certify: { name: 'certify_ec3_members', bound: (ctx, _d, _data, sb) => steelBound(ctx, sb) },
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
