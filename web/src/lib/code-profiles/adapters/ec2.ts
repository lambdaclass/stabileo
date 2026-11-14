import type { Ec2Params } from '../../engine/design/eurocode/ec2-params';
import type { Formula, RcProfile, Table, Val } from '../types';

const k = (f: Formula | { hook: string }, name: string): number => (f as Formula).k[name]!;

/** The EN 1992-1-1 parameters a design reads, from a gamma-format profile. */
export function ec2ParamsOf(p: RcProfile): Ec2Params {
  if (p.resistance.kind !== 'gamma') throw new Error(`${p.meta.id}: EN 1992-1-1 parameters need partial factors`);
  const r = p.resistance, xu = (p.beams.xuLimit as Table).values as number[];
  return {
    code: p.meta.id,
    gammaC: r.gammaC.v, gammaS: r.gammaS.v,
    alphaCC: r.alphaCC.v, alphaCCShear: r.alphaCCShear.v, alphaCT: r.alphaCT.v,
    crdc: k(p.shear, 'crdc') / r.gammaC.v, k1: k(p.shear, 'k1'), vminCoeff: k(p.shear, 'vmin'),
    cotThetaMin: k(p.shear, 'cotMin'), cotThetaMax: k(p.shear, 'cotMax'),
    nu1Factor: k(p.shear, 'nu1'),
    xuLimitLow: xu[0]!, xuLimitHigh: xu[1]!,
    beamMinFctm: k(p.beams.minSteel, 'c'), beamMinAbs: k(p.beams.minSteel, 'floor'), beamMaxRatio: p.beams.maxRatio.v,
    linkMinCoeff: k(p.beams.linkMin, 'c'), linkMaxSpacing: p.beams.linkMaxSpacing.v,
    colMinN: k(p.columns.rhoMin, 'axial'), colMinAbs: k(p.columns.rhoMin, 'floor'), colMaxRatio: p.columns.rhoMax.v,
    lambdaLimCoeff: k(p.columns.slenderness, 'c'),
    es: p.materials.steel.es.v,
  };
}

/** What the reinforcement sheets read beside `Ec2Params`: vRd,max's coefficient and the thinnest column bar, mm. */
export function ec2SheetExtrasOf(p: RcProfile): { punchingMaxCoeff: number; colBarMin: number } {
  return { punchingMaxCoeff: k(p.punching.vmax!, 'c'), colBarMin: (p.columns.minBarDia as Val).v };
}
