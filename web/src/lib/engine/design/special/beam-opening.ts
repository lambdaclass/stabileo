/**
 * A rectangular web opening in a rectangular concrete beam. CIRSOC 201-2025 has no article for
 * it, so the opening is designed by the Vierendeel method of the two chords above and below it,
 * each checked with the articles that apply to it:
 *
 *  · the moment at the opening becomes a couple of chord forces T = C = Mu/z, z the distance
 *    between the centroids of the top and bottom longitudinal steel;
 *  · the shear is shared by the chords in proportion to their depths (equal width, so to their
 *    areas), and each carries a secondary moment Vchord·lo/2 at both ends of the opening;
 *  · the tension chord: steel on each face for T/2 + Mchord/zc, φ = 0,90 (21.2.2); its shear by
 *    Tabla 22.5.5.1(a) with Nu = −T, Vc ≥ 0, stirrups for the rest (22.5.8.5.3), φ = 0,75;
 *  · the compression chord: C at the eccentricity Mchord/C on a uniform block 0,85·f'c over
 *    hc − 2e, φ = 0,65 (21.2.2), compression steel left aside; its shear by 22.5.5.1(a) with Nu = C,
 *    capped at 0,42·√f'c·bw·d (22.5.5.1.1);
 *  · beside the opening, vertical stirrups for the whole Vu, Av = Vu/(φ·fy) with φ = 0,75, placed
 *    within d/2 of each side (a generic detailing rule, stated as such).
 *
 * Moments sagging positive: the bottom chord is in tension. m, kN, MPa.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import { shearFy, shearSqrtFc } from '../../codes/argentina/cirsoc201-basis';

export interface BeamOpeningInput {
  /** Section width and depth, clear cover, stirrup and longitudinal bar diameters, m and mm. */
  b: number; h: number; cover: number; stirrupDia: number; barDia: number;
  fc: number; fy: number; lambda?: number;
  /** Where the opening's centre is along the span, its length and height, and how far its centre is above mid-depth, m. */
  x: number; lo: number; ho: number; offset?: number;
  /** Factored moment and shear at the opening, kN·m and kN. */
  Mu: number; Vu: number;
}

export interface ChordDesign { depth: number; shear: number; moment: number; axial: number; asFace?: number; avs?: number }
export interface BeamOpeningDesign { rows: CheckRow[]; top: ChordDesign; bottom: ChordDesign; z: number; avSide: number }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
const base = { code: 'cirsoc-201', edition: '2025' } as const;
const row = (key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[], derivation?: string[]): CheckRow => {
  const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
  return { ...base, clause, title, titleKey: `check.opening.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio), ...(derivation ? { derivation } : {}) };
};
// A required area with no placed steel to hold it against: stated, not verified.
const info = (key: string, title: string, clause: string, formula: string, need: number, unit: string, inputs: CheckInput[], derivation: string[]): CheckRow =>
  ({ ...base, clause, title, titleKey: `check.opening.${key}`, formula, inputs, demand: r3(need), unit, ratio: null, status: 'notVerified', derivation });

export function beamOpeningDesign(o: BeamOpeningInput): BeamOpeningDesign {
  const lambda = o.lambda ?? 1, off = o.offset ?? 0, fyk = o.fy * 1000;
  const c1 = o.cover + (o.stirrupDia + o.barDia / 2) / 1000; // face to longitudinal centroid
  const hTop = o.h / 2 - off - o.ho / 2, hBot = o.h / 2 + off - o.ho / 2;
  const z = o.h - 2 * c1;
  const T = Math.abs(o.Mu) / z;
  const sag = o.Mu >= 0;
  const share = (hc: number) => (hTop + hBot > 0 ? (Math.abs(o.Vu) * hc) / (hTop + hBot) : 0);
  const chord = (hc: number, tension: boolean): ChordDesign => ({ depth: hc, shear: share(hc), moment: (share(hc) * o.lo) / 2, axial: tension ? -T : T });
  const top = chord(hTop, !sag), bottom = chord(hBot, sag);
  const where = { location: `x = ${o.x.toFixed(2)} m` };
  const rows: CheckRow[] = [];
  const minChord = 2 * c1;
  rows.push({ ...row('chords', 'Chord depths', '—', 'hc ≥ 2·(cover + stirrup + db/2)', minChord, Math.min(hTop, hBot), 'm',
    [inp('h,top', hTop * 1000, 'mm'), inp('h,bot', hBot * 1000, 'mm'), inp('lo', o.lo * 1000, 'mm')],
    ['Vierendeel method of the two chords: no CIRSOC 201 article covers web openings', 'a chord must hold a layer of steel on each face']), ...where });
  if (hTop <= minChord || hBot <= minChord) return { rows, top, bottom, z, avSide: 0 };

  const sq = Math.sqrt(o.fc);
  for (const [name, ch] of [['top', top], ['bottom', bottom]] as const) {
    const zc = ch.depth - 2 * c1, dc = ch.depth - c1, bd = o.b * dc * 1000;
    const label = name === 'top' ? 'top' : 'bottom';
    if (ch.axial < 0) {
      // Tension chord: steel on each face for half the tie plus the chord moment.
      const asFace = (T / 2 + ch.moment / zc) / (0.9 * fyk);
      ch.asFace = asFace;
      rows.push({ ...info(`${label}Tension`, `${name === 'top' ? 'Top' : 'Bottom'} chord in tension, steel per face`, '22.2', 'As = (T/2 + Mc/zc) / (φ·fy), φ = 0,90',
        asFace * 1e4, 'cm²', [inp('T', T, 'kN'), inp('Mc', ch.moment, 'kN·m'), inp('zc', zc * 1000, 'mm')], ['tension-controlled, φ by 21.2.2']), ...where });
    } else {
      // Compression chord: C at e = Mc/C on a uniform block over hc − 2e.
      const e = T > 0 ? ch.moment / T : Number.POSITIVE_INFINITY;
      const cap = 0.65 * 0.85 * o.fc * 1000 * o.b * Math.max(ch.depth - 2 * e, 0);
      rows.push({ ...row(`${label}Compression`, `${name === 'top' ? 'Top' : 'Bottom'} chord in compression`, '22.4', 'C ≤ φ·0,85·f\'c·b·(hc − 2e), φ = 0,65', T, cap, 'kN',
        [inp('C', T, 'kN'), inp('e', e * 1000, 'mm'), inp('hc', ch.depth * 1000, 'mm')], ['compression steel left aside; compression-controlled φ by 21.2.2']), ...where });
    }
    // Shear of the chord, Tabla 22.5.5.1(a) with its axial force, then stirrups.
    const ag = o.b * ch.depth;
    // Vc with √f'c ≤ 8,3 MPa (§22.5.3.1), Vs with fyt ≤ 420 MPa (§22.5.3.3); the section limit reads √f'c as is.
    const sqVc = shearSqrtFc(o.fc);
    const vc = Math.min(Math.max(0, 0.17 * lambda * sqVc + ch.axial / (6 * ag) / 1000) * bd, 0.42 * sqVc * bd);
    const vs = Math.max(0, ch.shear / 0.75 - vc);
    ch.avs = vs / (shearFy(o.fy) * 1000 * dc);
    rows.push({ ...info(`${label}Shear`, `${name === 'top' ? 'Top' : 'Bottom'} chord shear`, '22.5.5.1', 'Vc = (0,17·λ·√f\'c + Nu/(6·Ag))·bw·d; Av/s = (Vu/φ − Vc)/(fy·d)',
      ch.avs * 1e4, 'cm²/m', [inp('Vchord', ch.shear, 'kN'), inp('Nu', ch.axial, 'kN'), inp('Vc', vc, 'kN')], [`Vs = ${vs.toFixed(1)} kN (22.5.8.5.3), φ = 0,75`]), ...where });
    rows.push({ ...row(`${label}ShearMax`, `${name === 'top' ? 'Top' : 'Bottom'} chord section for shear`, '22.5.1.2', 'Vu ≤ φ·(Vc + 0,66·√f\'c·bw·d)', ch.shear, 0.75 * (vc + 0.66 * sq * bd), 'kN', [inp('d', dc * 1000, 'mm')]), ...where });
  }
  const avSide = Math.abs(o.Vu) / (0.75 * fyk);
  rows.push({ ...info('sides', 'Stirrups beside the opening', '—', 'Av = Vu / (φ·fy), within d/2 of each side', avSide * 1e4, 'cm²',
    [inp('Vu', Math.abs(o.Vu), 'kN')], ['a generic detailing rule: the whole shear hangs from the solid web on each side of the opening']), ...where });
  return { rows, top, bottom, z, avSide };
}
