/**
 * The one value the load dialog's section list shows beside wind and seismic for a code with its
 * own inputs: the basic wind speed or the spectral parameter the reader typed, by input field.
 */
type Reading = { symbol: string; field: string; kind: 'speed' | 'plain' };

const WIND: readonly Reading[] = [
  { symbol: 'vb,0', field: 'vb0', kind: 'speed' },
  { symbol: 'vb,map', field: 'vbMap', kind: 'speed' },
  { symbol: 'V', field: 'V', kind: 'speed' },
];
const SEISMIC: readonly Reading[] = [
  { symbol: 'agR', field: 'agR', kind: 'plain' },
  { symbol: 'SDS', field: 'sds', kind: 'plain' },
  { symbol: 'SS', field: 'ss', kind: 'plain' },
];

export interface NavStatus { symbol: string; value: number; kind: Reading['kind'] }

export function codeInputStatus(role: 'wind' | 'seismic', input: unknown): NavStatus | null {
  if (!input || typeof input !== 'object') return null;
  const rec = input as Record<string, unknown>;
  for (const r of role === 'wind' ? WIND : SEISMIC) {
    const v = rec[r.field];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return { symbol: r.symbol, value: v, kind: r.kind };
  }
  return null;
}
