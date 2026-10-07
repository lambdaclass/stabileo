/**
 * The Argentine family behind the load-code interfaces: CIRSOC 101-2025 (combinations, imposed
 * loads, restraint actions), CIRSOC 102-2025 (wind), CIRSOC 104-2005 (snow) and INPRES-CIRSOC
 * 103-2018 (seismic). Each wraps what the generator already ran, unchanged: the suites of every
 * code and of the load plan give the same numbers through them.
 */
import { generateCombinations, liveLoadFactorInCompanion, type LoadCombinationSpec } from '../cirsoc101/combinations';
import { generateServiceCombinations } from '../cirsoc101/service-combinations';
import { findOccupancy, reduceLiveLoad } from '../cirsoc101/live-loads';
import { SIMULTANEITY_F1, type OccupancyProbability } from '../cirsoc103/spectrum';
import { clause } from '../regulation';
import { msg, round } from '../message';
import { planWind } from '../../engine/loads/load-plan-wind';
import { planSnow } from '../../engine/loads/load-plan-snow';
import { planSeismic } from '../../engine/loads/load-plan-seismic';
import type { ActionCategory, CombinationCode, ImposedLoadCode, SeismicCode, SnowCode, ThermalCode, WindCode } from './load-codes';

/** CIRSOC 101-2025's symbols, by what they are. */
export const CIRSOC_CATEGORY: Readonly<Record<string, ActionCategory>> = Object.freeze({
  D: 'permanent', L: 'imposed', Lr: 'roofImposed', S: 'snow', R: 'rain', W: 'wind', Wa: 'serviceWind',
  E: 'seismic', T: 'thermal', H: 'earthPressure', F: 'fluid',
  N: 'notional', Cr: 'crane', Tr: 'traffic', M: 'mass', A: 'accidental', I: 'ice',
});

export const CIRSOC101_BASIS: CombinationCode = {
  adapterId: 'cirsoc101-2025-basis', role: 'basis', family: 'cirsoc', edition: '2025',
  title: 'CIRSOC 101-2025', sections: { combinations: '§2.3', special: '§2.2, §2.3.2, §2.3.4' },
  strength(ci) {
    const exc = liveLoadFactorInCompanion(ci);
    return { combinations: generateCombinations(ci), refs: [clause('cirsoc-101', '2025', '2.3.2', 'combinaciones básicas')], notes: exc.note ? [exc.note] : [] };
  },
  service: (ci) => generateServiceCombinations(ci),
  categoryOf: (symbol) => CIRSOC_CATEGORY[symbol] ?? 'other',
};

export const CIRSOC101_LOADS: ImposedLoadCode = {
  adapterId: 'cirsoc101-2025-loads', role: 'loads', family: 'cirsoc', edition: '2025',
  title: 'CIRSOC 101-2025', sections: { dead: 'Tabla 3.1', live: 'Tabla 4.1', roof: '§4.8' },
  occupancy: (key) => findOccupancy(key),
  reduce: (o) => reduceLiveLoad(o),
};

export const CIRSOC102_WIND: WindCode = {
  adapterId: 'cirsoc102-2025', role: 'wind', family: 'cirsoc', edition: '2025', title: 'CIRSOC 102-2025',
  plan: (input, levels, sink) => planWind(input, levels, sink),
  defaults: { basicSpeed: 45, exposure: 'B', enclosure: 'enclosed' },
};

export const CIRSOC104_SNOW: SnowCode = {
  adapterId: 'cirsoc104-2005', role: 'snow', family: 'cirsoc', edition: '2005', title: 'CIRSOC 104-2005',
  plan: (input, sink, layout) => planSnow(input, sink, layout),
};

export const INPRES103_SEISMIC: SeismicCode = {
  adapterId: 'inpres103-2018', role: 'seismic', family: 'cirsoc', edition: '2018', title: 'INPRES-CIRSOC 103-2018',
  plan: (input, levels, sink) => planSeismic(input, levels, sink),
  liveInMass: (occupancy) => SIMULTANEITY_F1[occupancy as OccupancyProbability],
  /** E = EH ± EV, EV = (Ca/2)·γr·D (§3.5.2): each seismic combination twice, D's factor ± (Ca/2)·γr. */
  vertical(combinations, detail, sink) {
    if (detail?.source !== 'cirsoc103' || !detail.ca || !detail.gammaR) return combinations;
    const kv = (detail.ca / 2) * detail.gammaR;
    const out = combinations.flatMap((c): LoadCombinationSpec[] => {
      const hasE = c.terms.some((t) => t.symbol === 'E' && t.factor !== 0);
      const d = c.terms.find((t) => t.symbol === 'D');
      if (!hasE || !d) return [c];
      return [1, -1].map((sg) => ({
        ...c, id: `${c.id}${sg > 0 ? '+' : '-'}Ev`,
        label: `${c.label} ${sg > 0 ? '+' : '−'} Ev`,
        terms: c.terms.map((t) => (t.symbol === 'D' ? { ...t, factor: +(t.factor + sg * kv).toFixed(4) } : t)),
      }));
    });
    sink.refs.push(clause('inpres-cirsoc-103-i', '2018', '3.5.2', 'acción sísmica vertical'));
    sink.derivation.push(msg('loadPlan.derivation.verticalSeismic', { ca: round(detail.ca, 3), gr: detail.gammaR, kv: round(kv, 4) }));
    return out;
  },
  defaults: { zone: 4, site: 'SD', group: 'B' },
};

export const CIRSOC101_THERMAL: ThermalCode = {
  adapterId: 'cirsoc101-2025-thermal', role: 'thermal', family: 'cirsoc', edition: '2025', title: 'CIRSOC 101-2025',
  combinationRef: clause('cirsoc-101', '2025', '2.3.4', 'cargas de coacción T'),
};

export const CIRSOC_FAMILY = [CIRSOC101_BASIS, CIRSOC101_LOADS, CIRSOC102_WIND, CIRSOC104_SNOW, INPRES103_SEISMIC, CIRSOC101_THERMAL] as const;
