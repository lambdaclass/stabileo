/**
 * The section constants the CIRSOC 301 checker reads and the catalogue does not always carry:
 * J, Cw, Zx and Zy.
 *
 * ── What was wrong ────────────────────────────────────────────────
 *
 * The checker was given `J = section.j ?? 0`, and no Cw, Zx or Zy. The catalogue's rolled
 * shapes carry no J, so for an IPE the torsional term of the elastic lateral-torsional buckling
 * stress F.2-4 dropped out and Fcr came out as the Euler term alone — conservative, and by a
 * wide margin on a stocky section. Zx and Zy fell back to the checker's own I-shape formula,
 * which it then applied to tubes and channels as well.
 *
 * ── What is used ─────────────────────────────────────────────────
 *
 *   J    the section's own when it states one; else the canonical geometry's, when the
 *        section engine resolved it; else Σ b·t³/3 over the plates of an I or H — the
 *        thin-walled open-section value (AISC Design Guide 9, eq. 3.4).
 *   Cw   doubly-symmetric I or H only: I_weak·h₀²/4, h₀ = h − tf (DG 9, eq. 3.5). Other shapes
 *        get none, and the checker's own path for them stands.
 *   Zx, Zy  from the section's geometry when the section engine resolves it, unrotated: the
 *        check runs in the member's own axes, which already carry the section's rotation.
 *        Otherwise none, and the checker keeps its I-shape formula as before.
 */
import type { Section } from '../../store/model.svelte';
import { plasticModulus, plasticModulusWeak } from '../plastic-moments';
import { solverProperties } from '../../section/state';

type Sec = Partial<Section> & { shape?: string };

const isIShape = (s: Sec) => s.shape === 'I' || s.shape === 'H';
const plates = (s: Sec) => !!(s.b && s.h && s.tw && s.tf && s.h > 2 * s.tf);

export interface SteelSectionConstants {
  J: number;
  jBasis: 'declared' | 'geometry' | 'thinWalled' | 'none';
  Cw?: number;
  Zx?: number;
  Zy?: number;
  /** F.2's c: 1 for a doubly-symmetric I, (h₀/2)·√(I_weak/Cw) for a channel. */
  c?: number;
  /** Weak-axis elastic modulus to the flange tip; for a channel the centroid is near the web. */
  Sy?: number;
}

/**
 * Kept per section description. The plastic moduli mesh the section in the engine, some 60 ms a
 * profile, and the optimiser asks for the same few hundred profiles on every run; the answer
 * depends only on the fields in the key. A result computed without the engine is not kept, so
 * the first call after it starts gets the geometry's values.
 */
const CACHE_LIMIT = 512;
const cache = new Map<string, SteelSectionConstants>();
const keyOf = (s: Sec) => JSON.stringify([
  s.name, s.shape, s.a, s.b, s.h, s.tw, s.tf, s.t, s.j, s.iy, s.iz, s.rotation,
  s.polygon, s.holes, s.drawn, s.composition, s.canonical?.kind === 'geometry-backed' ? s.canonical.digest : null,
]);

export function steelSectionConstants(sec: Sec): SteelSectionConstants {
  const key = keyOf(sec);
  const hit = cache.get(key);
  if (hit) return { ...hit };
  const { value, engine } = computeConstants(sec);
  if (engine) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, value);
  }
  return { ...value };
}

function computeConstants(sec: Sec): { value: SteelSectionConstants; engine: boolean } {
  let engine = true;
  let J = 0, jBasis: SteelSectionConstants['jBasis'] = 'none';
  if (sec.j !== undefined && sec.j > 0) {
    J = sec.j; jBasis = 'declared';
  } else {
    let geometric: number | null = null;
    try { geometric = solverProperties(sec as Section).j; } catch { geometric = null; }
    if (geometric !== null && geometric > 0) {
      J = geometric; jBasis = 'geometry';
    } else if (isIShape(sec) && plates(sec)) {
      J = (2 * sec.b! * sec.tf! ** 3 + (sec.h! - 2 * sec.tf!) * sec.tw! ** 3) / 3;
      jBasis = 'thinWalled';
    }
  }

  const out: SteelSectionConstants = { J, jBasis };
  if (isIShape(sec) && plates(sec) && sec.iz && sec.iz > 0) {
    const h0 = sec.h! - sec.tf!;
    out.Cw = (sec.iz * h0 * h0) / 4;
  }
  /*
   * A channel (UPN) had no Cw, so the checker took its simplified LTB branch and a UPN 120 read
   * 941 %; and its weak-axis modulus was I/(b/2), as if the centroid sat mid-flange, which put
   * φMn 41–43 % high. Thin-walled channel values (AISC Design Guide 9, parallel flanges):
   *   Cw = tf·b'³·h₀²/12 · (3b'tf + 2h₀tw)/(6b'tf + h₀tw),  b' = b − tw/2,  h₀ = h − tf
   *   c  = (h₀/2)·√(I_weak/Cw)                                            (F.2, channels)
   *   Sy = I_weak / (b − x̄), x̄ the centroid from the back of the web.
   * The rolled UPN's tapered flanges put the catalogue's Cw some 15 % lower and Sy 3 % lower.
   */
  if (sec.shape === 'U' && plates(sec) && sec.iz && sec.iz > 0) {
    const b = sec.b!, h = sec.h!, tw = sec.tw!, tf = sec.tf!;
    const h0 = h - tf, bp = b - tw / 2;
    const Cw = (tf * bp ** 3 * h0 ** 2 / 12) * (3 * bp * tf + 2 * h0 * tw) / (6 * bp * tf + h0 * tw);
    out.Cw = Cw;
    out.c = (h0 / 2) * Math.sqrt(sec.iz / Cw);
    const Af = b * tf, Aw = (h - 2 * tf) * tw;
    const xBar = (2 * Af * (b / 2) + Aw * (tw / 2)) / (2 * Af + Aw);
    out.Sy = sec.iz / (b - xBar);
  }
  try {
    const flat = { ...sec, rotation: 0 } as Section;
    const zx = plasticModulus(flat), zy = plasticModulusWeak(flat);
    if (zx.source === 'geometry') out.Zx = zx.zp;
    if (zy.source === 'geometry') out.Zy = zy.zp;
  } catch {
    // No section engine: the checker keeps its own formula.
    engine = false;
  }
  return { value: out, engine };
}
