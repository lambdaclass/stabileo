import type { AnyLoadCode, CombinationCode, ImposedLoadCode, SeismicCode, SnowCode, WindCode } from '../families/load-codes';
import { CIRSOC_CATEGORY } from '../families/cirsoc';
import { asce7Service, asce7Strength } from './combinations';
import { findAsce7Occupancy, OCCUPANCY_TABLE_ASCE7_22, reduceAsce7, STORAGE_OCCUPANCIES } from './live-loads';
import { planAsce7Wind } from './wind-plan';
import { planAsce7Snow } from './snow';
import { asce7Vertical, planAsce7Seismic, STORAGE_SHARE } from './seismic-plan';
import { ADAPTER, WIND_DEFAULTS } from './inputs';
import { asce7RoofLive } from './roof-live';

const TITLE = 'ASCE/SEI 7-22';
const base = { family: 'aci-aisc', edition: '7-22', title: TITLE } as const;

export const ASCE7_BASIS: CombinationCode = {
  ...base, adapterId: ADAPTER.basis, role: 'basis', sections: { combinations: '§2.3.1, §2.3.6', special: 'Appendix C' },
  strength: (ci) => asce7Strength(ci),
  service: (ci) => asce7Service(ci),
  categoryOf: (symbol) => CIRSOC_CATEGORY[symbol] ?? 'other',
};

export const ASCE7_LOADS: ImposedLoadCode = {
  ...base, adapterId: ADAPTER.loads, role: 'loads', sections: { dead: '§3.1', live: 'Table 4.3-1', roof: '§4.8' },
  occupancy: (key) => findAsce7Occupancy(key),
  occupancies: () => OCCUPANCY_TABLE_ASCE7_22,
  roofOccupancies: () => OCCUPANCY_TABLE_ASCE7_22.filter((o) => o.category === 'roof' && o.key !== 'roofOrdinary' && o.key !== 'awningsFabric'),
  reduce: (o) => reduceAsce7(o),
  roofLive: asce7RoofLive,
};

export const ASCE7_WIND: WindCode = {
  ...base, adapterId: ADAPTER.wind, role: 'wind', sections: { site: '§26.5–26.10', pressures: '§27.3', cases: 'Figure 27.3-8' },
  plan: (input, levels, sink) => planAsce7Wind(input, levels, sink),
  defaults: { basicSpeed: 0, exposure: WIND_DEFAULTS.exposure, enclosure: WIND_DEFAULTS.enclosure },
};

export const ASCE7_SNOW: SnowCode = {
  ...base, adapterId: ADAPTER.snow, role: 'snow', sections: { roof: '§7.3, §7.4' },
  plan: (input, sink, layout) => planAsce7Snow(input, sink, layout),
};

export const ASCE7_SEISMIC: SeismicCode = {
  ...base, adapterId: ADAPTER.seismic, role: 'seismic', sections: { spectrum: '§11.4', static: '§12.8' },
  plan: (input, levels, sink) => planAsce7Seismic(input, levels, sink),
  liveInMass: (occupancy) => (STORAGE_OCCUPANCIES.has(occupancy) ? STORAGE_SHARE : 0),
  vertical: (combinations, detail, sink) => asce7Vertical(combinations, detail, sink),
  verticalByCode: true,
  defaults: { zone: 4, site: 'SD', group: 'B' },
};

export const ASCE7_FAMILY: readonly AnyLoadCode[] = [ASCE7_BASIS, ASCE7_LOADS, ASCE7_WIND, ASCE7_SNOW, ASCE7_SEISMIC];
