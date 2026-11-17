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

function shearAt(stations: readonly { x: number; v: number }[], x: number): number {
  if (stations.length === 0) return 0;
  let best = stations[0];
  for (const s of stations) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
  return best.v;
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
  d: number;
  diameterMm: number;
  stations: readonly { x: number; v: number }[];
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
  const actual = opts.towardEnd ? opts.theoretical + ext : opts.theoretical - ext;
  const c = (id: string, label?: string) => clause('cirsoc-201', opts.edition, id, label);
  const baseRefs = [c('9.7.3.3', 'prolongación más allá del punto de corte')];

  if (!opts.inTensionZone) {
    return {
      theoretical: opts.theoretical, actual, legality: 'notInTension', refs: baseRefs,
      note: `Prolongación max(d, 12db) = ${(ext * 1000).toFixed(0)} mm. El punto de corte ` +
            'no está en zona traccionada, por lo que 9.7.3.5 no restringe la terminación.',
    };
  }

  const vu = shearAt(opts.stations, actual);
  const refs = [...baseRefs, c('9.7.3.5', 'terminación en zona de tracción')];

  if (vu <= (2 / 3) * opts.vn) {
    return {
      theoretical: opts.theoretical, actual, legality: 'lowShear', refs,
      note: `9.7.3.5(a): Vu = ${vu.toFixed(1)} kN ≤ (2/3)Vn = ${((2 / 3) * opts.vn).toFixed(1)} kN.`,
    };
  }
  if (opts.diameterMm <= 32 && opts.continuingDoubleArea && vu <= 0.75 * opts.vn) {
    return {
      theoretical: opts.theoretical, actual, legality: 'doubleArea', refs,
      note: `9.7.3.5(b): Ø${opts.diameterMm} ≤ 32 mm, la armadura que continúa duplica el ` +
            `área requerida y Vu = ${vu.toFixed(1)} kN ≤ (3/4)Vn = ${(0.75 * opts.vn).toFixed(1)} kN.`,
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
