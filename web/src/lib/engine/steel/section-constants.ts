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
}

export function steelSectionConstants(sec: Sec): SteelSectionConstants {
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
  try {
    const flat = { ...sec, rotation: 0 } as Section;
    const zx = plasticModulus(flat), zy = plasticModulusWeak(flat);
    if (zx.source === 'geometry') out.Zx = zx.zp;
    if (zy.source === 'geometry') out.Zy = zy.zp;
  } catch {
    // No section engine: the checker keeps its own formula.
  }
  return out;
}
