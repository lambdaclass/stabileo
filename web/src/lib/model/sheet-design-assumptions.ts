export const DEFAULT_MIN_TIE_SPACING = 0.075;
export const DEFAULT_AGGREGATE_MM = 19;
export const AGGREGATE_RANGE = { min: 6, max: 50 } as const;

export const MIN_TIE_SPACING_RANGE = { min: 25, max: 150 } as const;

export const FOUNDING_RANGE = { min: -30, max: 30 } as const;

export const PRESUMED_BEARING_RANGE = { min: 50, max: 1000, default: 150 } as const;

export interface PileLayer { to: number; shaft: number; tip: number }
export interface PresumedPile {
  diameter: number; length: number; capacity: number;
  more?: Array<{ diameter: number; capacity: number }>;
  layers?: PileLayer[];
}

export const PRESUMED_PILE_RANGE = { diameter: { min: 0.3, max: 1.5, default: 0.5 }, length: { min: 3, max: 50, default: 12 }, capacity: { min: 100, max: 10000, default: 600 } } as const;

export const MORE_PILES_MAX = 5;

export const presumedPileOf = (p: Partial<PresumedPile> | undefined): PresumedPile => {
  const pick = (k: 'diameter' | 'length' | 'capacity') => { const v = p?.[k], r = PRESUMED_PILE_RANGE[k]; return typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max ? v : r.default; };
  const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const layers = Array.isArray(p?.layers)
    ? p!.layers.filter((l): l is PileLayer => !!l && num(l.to, 0.1, 200) && num(l.shaft, 0, 2000) && num(l.tip, 0, 50000)).sort((a, b) => a.to - b.to)
    : [];
  const R = PRESUMED_PILE_RANGE, diameter = pick('diameter');
  const more = Array.isArray(p?.more)
    ? p!.more.filter((x) => !!x && num(x.diameter, R.diameter.min, R.diameter.max) && num(x.capacity, R.capacity.min, R.capacity.max))
      .filter((x, i, all) => Math.abs(x.diameter - diameter) > 1e-9 && all.findIndex((y) => Math.abs(y.diameter - x.diameter) < 1e-9) === i).slice(0, MORE_PILES_MAX)
      .map((x) => ({ diameter: x.diameter, capacity: x.capacity }))
    : [];
  return { diameter, length: pick('length'), capacity: pick('capacity'), ...(more.length ? { more } : {}), ...(layers.length ? { layers } : {}) };
};

export const pileLayerStrata = (layers: readonly PileLayer[]): Array<{ name: string; thickness: number; shaftFrictionKPa: number; tipResistanceKPa: number }> =>
  layers.map((l, i) => ({ name: `${i + 1}`, thickness: l.to - (i ? layers[i - 1]!.to : 0), shaftFrictionKPa: l.shaft, tipResistanceKPa: l.tip }));

export const sheetAssumptionDefaults = {
  minTieSpacingMm: DEFAULT_MIN_TIE_SPACING * 1000,
  maxAggregateMm: DEFAULT_AGGREGATE_MM,
  presumedBearingKPa: PRESUMED_BEARING_RANGE.default,
};

function within(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max;
}

export function readSheetAssumptions(input: Record<string, unknown> = {}) {
  return {
    detailing: {
      minTieSpacingMm: within(input.minTieSpacingMm, MIN_TIE_SPACING_RANGE) ? input.minTieSpacingMm : sheetAssumptionDefaults.minTieSpacingMm,
      maxAggregateMm: within(input.maxAggregateMm, AGGREGATE_RANGE) ? input.maxAggregateMm : sheetAssumptionDefaults.maxAggregateMm,
    },
    foundation: {
      presumedBearingKPa: within(input.presumedBearingKPa, PRESUMED_BEARING_RANGE) ? input.presumedBearingKPa : sheetAssumptionDefaults.presumedBearingKPa,
      ...(input.presumedPile && typeof input.presumedPile === 'object' ? { presumedPile: presumedPileOf(input.presumedPile) } : {}),
    },
    elevation: within(input.foundingElevation, FOUNDING_RANGE) ? { foundingElevation: input.foundingElevation } : {},
  };
}
