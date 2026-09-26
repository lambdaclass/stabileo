/**
 * Shear areas, for members that deform in shear as well as in bending (Timoshenko).
 *
 * The engine takes one per bending plane and pairs them the way the stiffness does: `asY` goes
 * with `iy` (bending about local y, so shear along local z, the depth) and `asZ` with `iz`
 * (bending about local z, shear along local y, the width). Both are in the section's own frame;
 * the section's rotation turns the member's axes, not these.
 *
 * ── From the geometry ─────────────────────────────────────────────
 *
 * The usual frame-program reading of each shape, not a shear-flow integration:
 *
 *   rectangle        5/6 · b·h both ways (the parabolic shear of a solid section)
 *   I, H, C, U, Z    d·tw along the web, 5/3 · b·tf across it (two flanges at 5/6)
 *   T                d·tw along the web, 5/6 · b·tf across it (one flange)
 *   box (RHS)        2·h·t along the depth, 2·b·t across it (two walls each way)
 *   tube (CHS)       A/2 both ways (a thin circular tube)
 *   angle            5/6 · h·t and 5/6 · b·t, one leg each way
 *
 * A shape it does not recognise has no geometric shear area, and its members stay flexural only.
 *
 * Pure: no store.
 */
import type { Section } from '../store/model.svelte';

export type ShearAreaSpec = { basis: 'geometry' } | { basis: 'declared'; asY: number; asZ: number };

export interface ShearAreas { asY: number; asZ: number }

/** The shear areas a section's shape gives, m², or null when the shape does not give any. */
export function geometricShearAreas(s: Pick<Section, 'shape' | 'a' | 'b' | 'h' | 'tw' | 'tf' | 't'>): ShearAreas | null {
  const { b, h, tw, tf, t } = s;
  const ok = (...v: Array<number | undefined>) => v.every((x) => typeof x === 'number' && x > 0);
  switch (s.shape) {
    case 'rect':
      return ok(b, h) ? { asY: (5 / 6) * b! * h!, asZ: (5 / 6) * b! * h! } : null;
    case 'I': case 'H': case 'C': case 'U': case 'Z':
      return ok(b, h, tw, tf) ? { asY: h! * tw!, asZ: (5 / 3) * b! * tf! } : null;
    case 'T':
      return ok(b, h, tw, tf) ? { asY: h! * tw!, asZ: (5 / 6) * b! * tf! } : null;
    case 'RHS':
      return ok(b, h, t) ? { asY: 2 * h! * t!, asZ: 2 * b! * t! } : null;
    case 'CHS':
      return ok(s.a) ? { asY: s.a / 2, asZ: s.a / 2 } : null;
    case 'L': case 'invL': {
      const th = t ?? tw ?? tf;
      return ok(b, h, th) ? { asY: (5 / 6) * h! * th!, asZ: (5 / 6) * b! * th! } : null;
    }
    default:
      return null;
  }
}

/** The shear areas the solve uses for a section, or null for a member that is flexural only. */
export function sectionShearAreas(s: Section): ShearAreas | null {
  const spec = s.shearAreas;
  if (!spec) return null;
  if (spec.basis === 'declared') return spec.asY > 0 && spec.asZ > 0 ? { asY: spec.asY, asZ: spec.asZ } : null;
  return geometricShearAreas(s);
}
