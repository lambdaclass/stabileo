/**
 * Precast and composite floors spanning one way between supports: hollow-core planks and slabs on
 * a composite steel deck. Both are read from what their maker declares (a plank's design moment
 * and shear, a deck's section and its capacity as formwork); this app ships no catalogue of
 * either, and a declared value is a value the engineer takes from the maker's tables.
 *
 * The span is simply supported and the loads are per square metre: the self weight, the
 * superimposed dead load and the live load, factored 1,2D + 1,6L (CIRSOC 201-2025 5.3.1b) and
 * 1,4D. m, kN, MPa.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import { slabVc } from './one-way-shear';

export interface FloorLoads { superDead: number; live: number }
export interface PlankType {
  name: string;
  /** Depth and module width, m; self weight, kN/m². */
  depth: number; width: number; selfWeight: number;
  /** Design strengths per plank as the maker declares them: φMn (kN·m) and φVn (kN). */
  phiMn: number; phiVn: number;
  /** Flexural stiffness per plank, kN·m², for the deflection; absent: not checked. */
  ei?: number;
}
export interface DeckProfile {
  name: string;
  /** Rib height and sheet thickness, m; steel area per metre width, m²/m; centroid above the bottom, m. */
  hr: number; t: number; as: number; ycg: number; fy: number;
  /** Mean rib width and rib spacing, m (the concrete that carries shear). */
  ribWidth: number; ribSpacing: number;
  /** Deck weight, kN/m², and its design moment as formwork, kN·m/m, as the maker declares. */
  weight: number; phiMnDeck: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
const row = (code: string, key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[], steps: string[] = []): CheckRow => {
  const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
  return { code, edition: code === 'cirsoc-201' ? '2025' : undefined, clause, title, titleKey: key, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio), ...(steps.length ? { derivation: steps } : {}) } as CheckRow;
};

/** The factored load per m², the larger of 1,2D + 1,6L and 1,4D. */
export const factored = (dead: number, live: number) => Math.max(1.2 * dead + 1.6 * live, 1.4 * dead);

/** A hollow-core plank over `span`: flexure and shear against the declared strengths, and deflection. */
export function plankCheck(p: PlankType, span: number, loads: FloorLoads): CheckRow[] {
  const dead = p.selfWeight + loads.superDead, wu = factored(dead, loads.live) * p.width;
  const mu = (wu * span * span) / 8, vu = (wu * span) / 2;
  const rows = [
    row('cirsoc-201', 'check.plank.flexure', 'Flexure', '22.3', 'Mu ≤ φMn (declared)', mu, p.phiMn, 'kN·m', [inp('wu', wu, 'kN/m'), inp('L', span, 'm')], [`wu = max(1.2D + 1.6L; 1.4D)·b`, `Mu = wu·L²/8`]),
    row('cirsoc-201', 'check.plank.shear', 'Shear', '22.5', 'Vu ≤ φVn (declared)', vu, p.phiVn, 'kN', [inp('Vu', vu, 'kN')]),
  ];
  if (p.ei) {
    const delta = (5 * loads.live * p.width * span ** 4) / (384 * p.ei);
    rows.push(row('cirsoc-201', 'check.plank.deflection', 'Live load deflection', '24.2.2', 'δL ≤ L/360', delta * 1000, (span / 360) * 1000, 'mm', [inp('EI', p.ei, 'kN·m²')]));
  }
  return rows;
}

/** A slab on composite deck of total depth `h`: the deck as formwork, then the composite slab. */
export function deckSlabCheck(d: DeckProfile, h: number, fc: number, span: number, loads: FloorLoads): CheckRow[] {
  // Concrete per m² (ribs as their mean width), 25 kN/m³.
  const tc = h - d.hr, conc = (tc + (d.hr * d.ribWidth) / d.ribSpacing) * 25;
  // Construction: wet concrete and deck, 1 kN/m² of construction load, the deck alone.
  const wc = factored(conc + d.weight, 1.0), mc = (wc * span * span) / 8;
  // Composite: the deck as the reinforcement (yield method), φ = 0,9.
  const dd = h - d.ycg, a = (d.as * d.fy) / (0.85 * fc * 1);
  const mn = d.as * d.fy * 1000 * (dd - a / 2);
  const wu = factored(conc + d.weight + loads.superDead, loads.live), mu = (wu * span * span) / 8, vu = (wu * span) / 2;
  const bw = d.ribWidth / d.ribSpacing, rho = d.as / (bw * dd);
  const phiVc = 0.75 * slabVc(fc, bw, dd, rho).vc;
  return [
    row('sdi', 'check.deck.construction', 'Deck as formwork', 'construction', 'Mu ≤ φMn,deck (declared)', mc, d.phiMnDeck, 'kN·m/m', [inp('w', wc, 'kN/m²'), inp('L', span, 'm')], ['1 kN/m² construction load']),
    row('cirsoc-201', 'check.deck.flexure', 'Composite flexure', '22.3', 'Mu ≤ 0,9·As·fy·(d − a/2)', mu, 0.9 * mn, 'kN·m/m', [inp('As', d.as * 1e4, 'cm²/m'), inp('d', dd * 1000, 'mm'), inp('a', a * 1000, 'mm')], a > tc ? ['a exceeds the concrete above the ribs'] : []),
    row('cirsoc-201', 'check.deck.shear', 'Shear in the ribs', '22.5.5.1', 'Vu ≤ φ·Vc', vu, phiVc, 'kN/m', [inp('bw', bw * 1000, 'mm/m'), inp('ρw', rho)]),
    { code: 'sdi', clause: 'shear bond', title: 'Shear bond', titleKey: 'check.deck.bond', formula: 'm-k from the maker\'s tests', inputs: [], ratio: null, status: 'unsupported' },
  ];
}
