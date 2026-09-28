/**
 * ACI 318 and EN 1992-1-1 checks of the reinforcement the engineer stated, as the engine's
 * checkers declare them.
 *
 * What is checked is the provided steel (`rc-bars.ts`) against each governing demand, on the
 * axis the CIRSOC verification designs for (`resolveDesignAxes`), with the same refusals:
 *
 *   · a member bending about both axes is not checked on one of them;
 *   · a beam whose governing moment bends it across its width is not read with the top and
 *     bottom bars, which are the faces across its depth;
 *   · a face in tension with no bars under a moment fails, with that as the reason.
 *
 * The rebar grade and the cover are the ones the CIRSOC design assumes when the model states
 * none (`member-context.ts`), so both codes read the same bars at the same depths.
 *
 * EN 1992 here: the engine's flexure ignores the axial force (it enters shear only), so vertical
 * members are not checked and a beam demand with an axial force above 0,1·fcd·Ac comes back
 * incomplete. ACI 318: flexure reads the axial force on the P–M diagram; its shear leaves out the
 * axial term, which is on the safe side in compression and not in tension, so a demand with
 * axial tension comes back with shear incomplete.
 */
import { checkRcMembers, checkEc2Members } from '../../wasm-solver';
import { materialFamilyOf } from '../../steel/material-family';
import { catalogueGradeFamily } from '../../steel/grade-family';
import type { GoverningDemand } from '../../station-design-forces';
import { resolveDesignAxes, tupleMoment, tupleShear, MOMENT_NOISE_FLOOR } from '../design-axes';
import { DEFAULT_COVER, DEFAULT_REBAR_FY } from '../member-context';
import { beamBarsAt, columnBarsAt, hasLongitudinalBars, type RcAt } from './rc-bars';
import { N, PA, gov, type CheckReading, type MemberContext, type OtherCode } from './types';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

/** Share of fcd·Ac above which EN 1992 flexure without the axial force is not an answer. */
const EC2_AXIAL_SHARE = 0.1;

/** The member's standing: concrete, rectangular, with bars, on one axis. Else why not. */
function rcMember(ctx: MemberContext): { skip: string } | { data: Record<string, unknown> } {
  const fam = materialFamilyOf(ctx.material as never, catalogueGradeFamily).family;
  if (fam !== 'concrete') return { skip: 'otherCodes.skip.notConcrete' };
  // In this model a concrete material's fy is its f'c.
  if (!(ctx.material.fy && ctx.material.fy > 0)) return { skip: 'otherCodes.skip.noFc' };
  const s = ctx.section;
  if (!(s.shape === undefined || s.shape === 'rect') || !(s.b && s.b > 0 && s.h && s.h > 0)) {
    return { skip: 'otherCodes.skip.notRectangular' };
  }
  if (!hasLongitudinalBars(ctx.element.reinforcement)) return { skip: 'otherCodes.skip.noReinforcement' };
  const axes = resolveDesignAxes(ctx.kind, { b: s.b, h: s.h }, { elementId: ctx.elementId, length: ctx.L, demands: ctx.demands });
  if (axes.basis === 'no-demand') return { skip: 'otherCodes.skip.noDemand' };
  if (axes.biaxial) return { skip: 'otherCodes.skip.biaxial' };
  if (ctx.kind === 'beam' && axes.flexure !== 'My') return { skip: 'otherCodes.skip.weakAxisBeam' };
  return { data: { axis: axes.flexure, shearAxis: axes.shear } };
}

/** The bars at `d`, or the failing reading when the face in tension has none. */
function barsAt(ctx: MemberContext, d: GoverningDemand, data: Record<string, unknown>): RcAt | { reading: CheckReading } {
  const r = ctx.element.reinforcement!;
  const sec = { b: ctx.section.b!, h: ctx.section.h! };
  const axis = data.axis as 'My' | 'Mz', shearAxis = data.shearAxis as 'Vy' | 'Vz';
  const at = ctx.kind === 'beam'
    ? beamBarsAt(r, sec, DEFAULT_COVER, d, axis, shearAxis)
    : columnBarsAt(r, sec, DEFAULT_COVER, d, axis, shearAxis);
  if (!at || (at.asTension <= 0 && Math.abs(at.M) > MOMENT_NOISE_FLOOR)) {
    return { reading: { ratio: Number.POSITIVE_INFINITY, ...gov('noTensionSteel'), pass: false, unevaluated: [] } };
  }
  return at;
}

const shape = (ctx: MemberContext, at: RcAt) => ({
  elementId: ctx.elementId,
  b: at.b, h: at.h, d: at.d,
  asTension: at.asTension,
  ...(at.asCompression > 0 ? { asCompression: at.asCompression, dPrime: at.dPrime } : {}),
});

/** Moment and shear about the axis `member` chose, in N·m and N. */
function bending(d: GoverningDemand, data: Record<string, unknown>) {
  return {
    M: tupleMoment(d.forces, data.axis as 'My' | 'Mz') * N,
    V: tupleShear(d.forces, data.shearAxis as 'Vy' | 'Vz') * N,
  };
}

export const ACI318: OtherCode = {
  id: 'aci318',
  family: 'concrete',
  labelKey: 'otherCodes.code.aci318',
  coverageKey: 'otherCodes.coverage.aci318',
  member: rcMember,
  at(ctx, d, data) {
    const at = barsAt(ctx, d, data);
    if ('reading' in at) return at;
    const tension = d.forces.n > 0 && Math.abs(at.V) > 0;
    return {
      data: {
        ...shape(ctx, at),
        fc: ctx.material.fy! * PA, fy: DEFAULT_REBAR_FY * PA,
        sectionType: 'rectangular',
        ...(at.av !== undefined ? { av: at.av, sStirrup: at.s } : {}),
      },
      ...(tension ? { unevaluated: ['otherCodes.check.aciShearTension'] } : {}),
    };
  },
  forces(ctx, d, data) {
    const { M, V } = bending(d, data);
    return { elementId: ctx.elementId, mu: M, vu: V, nu: d.forces.n * N };
  },
  run: (input) => checkRcMembers(input),
  read(r): CheckReading {
    const flex = num(r.flexureRatio), sh = num(r.shearRatio);
    const ratio = num(r.unityRatio);
    return {
      ratio, ...(flex >= sh ? gov('flexure', '22.3') : gov('shear', '22.5')),
      pass: ratio <= 1, unevaluated: list(r.unevaluated),
    };
  },
};

export const EC2: OtherCode = {
  id: 'ec2',
  family: 'concrete',
  labelKey: 'otherCodes.code.ec2',
  coverageKey: 'otherCodes.coverage.ec2',
  member(ctx) {
    if (ctx.kind !== 'beam') return { skip: 'otherCodes.skip.ec2Axial' };
    return rcMember(ctx);
  },
  at(ctx, d, data) {
    const at = barsAt(ctx, d, data);
    if ('reading' in at) return at;
    const fck = ctx.material.fy!;
    // fcd = αcc·fck/γc with the engine's defaults (1,0 and 1,5), in kN over the section.
    const nLimit = EC2_AXIAL_SHARE * (fck / 1.5) * 1e3 * ctx.section.b! * ctx.section.h!;
    return {
      data: {
        ...shape(ctx, at),
        fck: fck * PA, fyk: DEFAULT_REBAR_FY * PA,
        ...(at.av !== undefined ? { asw: at.av, sStirrup: at.s } : {}),
      },
      ...(Math.abs(d.forces.n) > nLimit ? { unevaluated: ['otherCodes.check.ec2Axial'] } : {}),
    };
  },
  forces(ctx, d, data) {
    const { M, V } = bending(d, data);
    return { elementId: ctx.elementId, mEd: M, vEd: V, nEd: d.forces.n * N };
  },
  run: (input) => checkEc2Members(input),
  read(r): CheckReading {
    const flex = num(r.flexureRatio), sh = num(r.shearRatio);
    const ratio = Math.max(flex, sh);
    return { ratio, ...(flex >= sh ? gov('flexure', '6.1') : gov('shear', '6.2')), pass: r.pass === true, unevaluated: list(r.unevaluated) };
  },
};
