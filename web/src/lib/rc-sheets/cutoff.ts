import { clause, type ClauseRef, type RegulationEdition } from '../codes/regulation';

export type CutoffLegality = 'notInTension' | 'lowShear' | 'doubleArea' | 'extraStirrups' | 'illegal';

export interface Cutoff {
  /** Position where the steel is theoretically no longer needed, m. */
  theoretical: number;
  /** Position after the §9.7.3.3 extension, m — where the bar actually stops. */
  actual: number;
  /** Which §9.7.3.5 provision legalises terminating here. */
  legality: CutoffLegality;
  /** Set when `legality === 'extraStirrups'`: the required extra stirrup zone. */
  extraStirrups?: { length: number; maxSpacing: number; minAvOverS: number };
  refs: ClauseRef[];
  note: string;
}

/** The larger |V| of the two stations either side of x: between samples the shear is not known to be lower. None read, none allowed. */
export function cutoffStations<T extends { x: number }>(stations: readonly T[], x: number): T[] {
  if (stations.length === 0) return [];
  const sorted = [...stations].sort((a, b) => a.x - b.x);
  const after = sorted.findIndex((s) => s.x >= x - 1e-9);
  return after < 0 ? [sorted[sorted.length - 1]!] : after === 0 ? [sorted[0]!] : [sorted[after - 1]!, sorted[after]!];
}

export function cutoffPosition(theoretical: number, d: number, diameterMm: number, towardEnd: boolean): number {
  const extension = Math.max(d, 12 * diameterMm / 1000);
  return towardEnd ? theoretical + extension : theoretical - extension;
}

/**
 * Apply §9.7.3.3 (extend by max(d, 12·d_b)) and test §9.7.3.5.
 *
 * When no provision of §9.7.3.5 is satisfied the cut-off is declared `illegal` and the
 * caller runs the bar through instead. Moving the cut-off to somewhere convenient would
 * be inventing a design.
 */
export function evaluateCutoff(opts: {
  theoretical: number;
  placedAt?: number;
  d: number;
  diameterMm: number;
  stations: readonly { x: number; v: number }[];
  /** Design shear strength φVn, kN. */
  vn: number;
  b: number;
  fy: number;
  /** True when the continuing bars provide at least twice the area required here. */
  continuingDoubleArea: boolean;
  /** True when the cut-off point lies in a flexural tension zone. */
  inTensionZone: boolean;
  edition: RegulationEdition;
  towardEnd: boolean;
}): Cutoff {
  const ext = Math.max(opts.d, 12 * opts.diameterMm / 1000);
  const actual = opts.placedAt ?? cutoffPosition(opts.theoretical, opts.d, opts.diameterMm, opts.towardEnd);
  const c = (id: string, label?: string) => clause('cirsoc-201', opts.edition, id, label);
  const baseRefs = [c('9.7.3.3', 'prolongación más allá del punto de corte')];

  if (!opts.inTensionZone) {
    return {
      theoretical: opts.theoretical, actual, legality: 'notInTension', refs: baseRefs,
      note: `Prolongación max(d, 12db) = ${(ext * 1000).toFixed(0)} mm. El punto de corte ` +
            'no está en zona traccionada, por lo que 9.7.3.5 no restringe la terminación.',
    };
  }

  const stations = cutoffStations(opts.stations, actual);
  const vu = stations.length ? Math.max(...stations.map(s => Math.abs(s.v))) : Infinity;
  const refs = [...baseRefs, c('9.7.3.5', 'terminación en zona de tracción')];

  if (!(opts.vn > 0 && Number.isFinite(opts.vn) && Number.isFinite(vu))) {
    return { theoretical: opts.theoretical, actual, legality: 'illegal', refs, note: '§9.7.3.5 — Vu / φVn: —' };
  }
  if (vu <= (2 / 3) * opts.vn) {
    return {
      theoretical: opts.theoretical, actual, legality: 'lowShear', refs,
      note: `9.7.3.5(a): Vu = ${vu.toFixed(1)} kN ≤ (2/3)φVn = ${((2 / 3) * opts.vn).toFixed(1)} kN.`,
    };
  }
  if (opts.diameterMm <= 32 && opts.continuingDoubleArea && vu <= 0.75 * opts.vn) {
    return {
      theoretical: opts.theoretical, actual, legality: 'doubleArea', refs,
      note: `9.7.3.5(b): Ø${opts.diameterMm} ≤ 32 mm, la armadura que continúa duplica el ` +
            `área requerida y Vu = ${vu.toFixed(1)} kN ≤ (3/4)φVn = ${(0.75 * opts.vn).toFixed(1)} kN.`,
    };
  }

  // (c) — extra stirrups over (3/4)d, Av >= 0.41 bw s / fyt, s <= d/(8 βb).
  // βb is the ratio of the area cut off to the total; with the conservative βb = 1 the
  // spacing limit is d/8, which is the tightest the clause can demand.
  const zone = 0.75 * opts.d;
  const maxSpacing = opts.d / 8;
  const minAvOverS = 0.41 * opts.b / opts.fy;
  return {
    theoretical: opts.theoretical, actual, legality: 'extraStirrups',
    extraStirrups: { length: zone, maxSpacing, minAvOverS },
    refs,
    note:
      `9.7.3.5(c): Vu = ${vu.toFixed(1)} kN excede los límites de (a) y (b), de modo que ` +
      `se exigen estribos adicionales sobre ${(zone * 1000).toFixed(0)} mm con ` +
      `s ≤ ${(maxSpacing * 1000).toFixed(0)} mm y Av/s ≥ ${minAvOverS.toFixed(5)} m²/m ` +
      '(βb adoptado = 1, el caso más exigente).',
  };
}
