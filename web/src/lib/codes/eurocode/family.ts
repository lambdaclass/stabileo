import type { AnyLoadCode, CombinationCode, ImposedLoadCode, SeismicCode, SnowCode, WindCode } from '../families/load-codes';
import { EC_CATEGORY, serviceCombinations, strengthCombinations } from './basis';
import { categoryOfOccupancy, findEcOccupancy, occupancyTable, reduceImposed } from './imposed';
import { planContextOf } from './context';
import { planEcWind } from './wind';
import { planEcSnow } from './snow';
import { planEcSeismic, psiE } from './seismic';
import type { EcFamily } from './refs';
import { ecRoofLive } from './roof-live';

const TITLES: Readonly<Record<EcFamily, Record<'basis' | 'loads' | 'wind' | 'snow', string>>> = {
  eurocode: { basis: 'EN 1990', loads: 'EN 1991-1-1', wind: 'EN 1991-1-4', snow: 'EN 1991-1-3' },
  uk: { basis: 'BS EN 1990 + UK NA', loads: 'BS EN 1991-1-1 + UK NA', wind: 'BS EN 1991-1-4 + UK NA', snow: 'BS EN 1991-1-3 + UK NA' },
};
const ID: Readonly<Record<EcFamily, Record<'basis' | 'loads' | 'wind' | 'snow', string>>> = {
  eurocode: { basis: 'en1990', loads: 'en1991-1-1', wind: 'en1991-1-4', snow: 'en1991-1-3' },
  uk: { basis: 'en1990-uk', loads: 'en1991-1-1-uk', wind: 'en1991-1-4-uk', snow: 'en1991-1-3-uk' },
};
const EDITION: Readonly<Record<EcFamily, Record<'basis' | 'loads' | 'wind' | 'snow', string>>> = {
  eurocode: { basis: '2002', loads: '2002', wind: '2005', snow: '2003' },
  uk: { basis: '2002 + NA 2004', loads: '2002 + NA 2005', wind: '2005 + NA 2008', snow: '2003 + NA 2005' },
};

function modules(f: EcFamily): AnyLoadCode[] {
  const uk = f === 'uk';
  const basis: CombinationCode = {
    adapterId: ID[f].basis, role: 'basis', family: 'eurocode', edition: EDITION[f].basis, title: TITLES[f].basis,
    sections: { combinations: uk ? '6.4.3.2, NA.A1.2(B)' : '6.4.3.2, A1.2(B)', special: '6.4.3.4, 6.5.3' },
    strength: (ci, input) => strengthCombinations(f, ci, input && planContextOf(f, input)),
    service: (ci, input) => serviceCombinations(f, ci, input && planContextOf(f, input)),
    categoryOf: (symbol) => EC_CATEGORY[symbol] ?? 'other',
  };
  const loads: ImposedLoadCode = {
    adapterId: ID[f].loads, role: 'loads', family: 'eurocode', edition: EDITION[f].loads, title: TITLES[f].loads,
    sections: { live: uk ? 'Table NA.3' : 'Table 6.2', roof: uk ? 'Table NA.7' : 'Table 6.10' },
    occupancy: (key) => findEcOccupancy(f, key),
    occupancies: () => occupancyTable(f),
    roofOccupancies: () => occupancyTable(f).filter((o) => o.category !== 'roof' && o.category !== 'storage'),
    reduce: (o) => reduceImposed(f, o),
    roofLive: ecRoofLive(f),
  };
  const wind: WindCode = {
    adapterId: ID[f].wind, role: 'wind', family: 'eurocode', edition: EDITION[f].wind, title: TITLES[f].wind,
    sections: { site: uk ? 'NA.2.4, 4.3, 4.5' : '4.2, 4.3, 4.5', pressure: '7.2.2' },
    plan: (input, levels, sink) => planEcWind(f, input, levels, sink),
    defaults: { basicSpeed: 45, exposure: 'B', enclosure: 'enclosed' },
  };
  const snow: SnowCode = {
    adapterId: ID[f].snow, role: 'snow', family: 'eurocode', edition: EDITION[f].snow, title: TITLES[f].snow,
    sections: { roof: '5.2, 5.3' },
    plan: (input, sink, layout) => planEcSnow(f, input, sink, layout),
  };
  return [basis, loads, wind, snow];
}

export const EN1998_SEISMIC: SeismicCode = {
  adapterId: 'en1998-1', role: 'seismic', family: 'eurocode', edition: '2004', title: 'EN 1998-1',
  sections: { spectrum: '3.2.2.5', method: '4.3.3.2' },
  plan: (input, levels, sink) => planEcSeismic(input, levels, sink),
  liveInMass: (occupancy) => (categoryOfOccupancy(occupancy) ? psiE(occupancy, false, 'correlated') : undefined),
  defaults: { zone: 4, site: 'SD', group: 'B' },
};

export const EUROCODE_FAMILY: readonly AnyLoadCode[] = [...modules('eurocode'), EN1998_SEISMIC];
export const UK_FAMILY: readonly AnyLoadCode[] = modules('uk');
