import { ConcurrentDemand } from '../../concurrent-demand';
import { checkColumn as column, checkBiaxial as biaxial, checkTorsion as torsion, type ConcreteDesignParams } from '../../codes/argentina/cirsoc201';
import { checkSteelInteraction as steelInteraction, verifySteelElement as steelElement, worseSteelVerification, type SteelDesignParams, type SteelVerificationInput } from '../../codes/argentina/cirsoc301';
import type { RegulationEdition } from '../../../codes/regulation';

const manual = (Nu: number, Mu: number, Muy = 0, Vu = 0, Tu = 0) => ConcurrentDemand.fromTuples([{ comboId: 0, comboName: 'manual',
  forces: { n: -Nu, mz: Mu, my: Muy, vy: Vu, vz: 0, torsion: Tu, t: 0, x: 0 } }])[0]!.section('Mz');

export const checkColumn = (params: ConcreteDesignParams, Nu: number, Mu: number, opts: { edition?: RegulationEdition; axialLoads?: number[] } = {}) =>
  column(params, [Nu, ...(opts.axialLoads ?? [])].map(n => manual(n, Mu)), { edition: opts.edition });
export const checkBiaxial = (params: ConcreteDesignParams, Nu: number, Muy: number, Muz: number, As: number, opts: { edition?: RegulationEdition; barCount?: number; barDia?: number } = {}) =>
  biaxial(params, manual(Nu, Muz, Muy), As, opts);
export const checkTorsion = (params: ConcreteDesignParams, Tu: number, Vu = 0, edition: RegulationEdition = '2005') => torsion(params, manual(0, 0, 0, Vu, Tu), edition);
export const checkSteelInteraction = (params: SteelDesignParams, Nu: number, Mu: number, Muy: number) => steelInteraction(params, ConcurrentDemand.fromTuples([{ comboId: 0, comboName: 'manual',
  forces: { n: -Nu, my: Mu, mz: Muy, vy: 0, vz: 0, torsion: 0, t: 0, x: 0 } }])[0]!.section('My'));

export function manualSteelDemand<T extends import('../../verification-service').SteelMemberDemand>(d: T): T {
  const ns = [...(d.Nc > 0 || d.Nt === 0 ? [d.Nc] : []), ...(d.Nt > 0 ? [-d.Nt] : [])];
  return { ...d, concurrent: ns.map((n, k) => ConcurrentDemand.fromTuples([{ comboId: k, comboName: `manual ${k}`,
    forces: { n: -n, my: d.MuStrong, mz: d.MuWeak, vy: d.VuWeak ?? 0, vz: d.VuStrong ?? d.Vu, torsion: 0, t: 0, x: 0 } }])[0]!) };
}

export function verifySteelElement(input: SteelVerificationInput, opts: { trace?: boolean } = {}) {
  const p = input.params;
  const hasSigns = p.LbNeg !== undefined && (input.MuzPos !== undefined || input.MuzNeg !== undefined);
  const cases = hasSigns ? [{ moment: input.MuzPos ?? 0 }, { moment: -(input.MuzNeg ?? 0) }]
    : [{ moment: input.Muz }];
  const runs = cases.map((c, k) => {
    const demand = ConcurrentDemand.fromTuples([{ comboId: k, comboName: `manual ${k}`, forces: {
      n: -input.Nu, my: c.moment, mz: input.Muy, vy: input.VuWeak ?? 0, vz: input.Vu, torsion: 0, t: 0, x: 0,
    } }])[0]!.section('My');
    return steelElement({ elementId: input.elementId, params: p, demand }, opts);
  });
  return { ...runs.reduce(worseSteelVerification), Muz: input.Muz };
}
