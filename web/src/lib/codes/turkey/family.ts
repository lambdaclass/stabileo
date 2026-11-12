import type { AnyLoadCode, CombinationCode, ImposedLoadCode, SeismicCode, SnowCode, WindCode } from '../families/load-codes';
import { ts500Service, ts500Strength, TR_CATEGORY } from './ts500-combinations';
import { findTrOccupancy, ts498Reduce, TS498_OCCUPANCIES } from './ts498-loads';
import { planTs498Wind } from './ts498-wind';
import { planTs498Snow } from './ts498-snow';
import { ts498RoofLive } from './ts498-roof';
import { planTbdy, tbdyVertical } from './tbdy-seismic';
import { MASS_PARTICIPATION } from './tbdy-spectrum';
import { TR_SEISMIC, TR_SNOW, TR_WIND, type MassUse } from './inputs';

export const TS500_BASIS: CombinationCode = {
  adapterId: 'ts500-2000-basis', role: 'basis', family: 'turkey', edition: 'TS 500:2000 + TBDY 2018',
  title: 'TS 500:2000 · TBDY 2018', sections: { combinations: 'TS 500 §6.2.6, TBDY §4.4.4' },
  strength: (ci) => ts500Strength(ci),
  service: (ci) => ts500Service(ci),
  categoryOf: (symbol) => TR_CATEGORY[symbol] ?? 'other',
};

export const TS498_LOADS: ImposedLoadCode = {
  adapterId: 'ts498-1997-loads', role: 'loads', family: 'turkey', edition: '1997',
  title: 'TS 498:1997', sections: { dead: 'TS ISO 9194', live: 'Çizelge 7', reduction: 'Madde 13, Çizelge 8' },
  occupancy: (key) => findTrOccupancy(key),
  occupancies: () => TS498_OCCUPANCIES,
  roofOccupancies: () => TS498_OCCUPANCIES.filter((o) => o.category === 'roof'),
  reduce: (o) => ts498Reduce(o),
  roofLive: ts498RoofLive,
};

export const TS498_WIND: WindCode = {
  adapterId: TR_WIND, role: 'wind', family: 'turkey', edition: '1997', title: 'TS 498:1997',
  sections: { wind: 'Madde 11, Çizelge 5, Çizelge 6' },
  plan: (input, levels, sink) => planTs498Wind(input, levels, sink),
  defaults: { basicSpeed: 28, exposure: 'B', enclosure: 'enclosed' },
};

export const TS498_SNOW: SnowCode = {
  adapterId: TR_SNOW, role: 'snow', family: 'turkey', edition: '1997', title: 'TS 498:1997',
  sections: { snow: 'Madde 7, 8, Çizelge 3, Çizelge 4' },
  plan: (input, sink, layout) => planTs498Snow(input, sink, layout),
};

export const TBDY_SEISMIC: SeismicCode = {
  adapterId: TR_SEISMIC, role: 'seismic', family: 'turkey', edition: '2018', title: 'TBDY 2018',
  sections: { spectrum: '§2.3', method: '§4.7', combinations: '§4.4.4' },
  plan: (input, levels, sink) => planTbdy(input, levels, sink),
  liveInMass: (use) => MASS_PARTICIPATION[use as MassUse],
  vertical: (combinations, detail, sink) => tbdyVertical(combinations, detail, sink),
  verticalByCode: true,
  defaults: { zone: 4, site: 'SD', group: 'B' },
};

export const TURKEY_FAMILY: readonly AnyLoadCode[] = [TS500_BASIS, TS498_LOADS, TS498_WIND, TS498_SNOW, TBDY_SEISMIC];
