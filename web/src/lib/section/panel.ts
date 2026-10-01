/**
 * panel.ts — the canonical detailed-analysis result the UI renders.
 *
 * # Why an adapter rather than logic inside the components
 *
 * `SectionStressPanel` and `CrossSectionDrawing` both need the same thing: the
 * canonical geometry, the canonical bending field, and proof the two describe
 * one section. Putting that in either component would duplicate it in the
 * other and leave the guard reachable from only one of them. So it lives here,
 * is pure, and is testable without mounting Svelte.
 *
 * # What is canonical and what is not
 *
 * Every component now comes from the section's own geometry: axial and bending
 * in closed form, transverse shear from longitudinal equilibrium, torsion from
 * Saint-Venant — or from a closed form or published table where one exists.
 *
 * The result still reports its components separately rather than handing back
 * one undifferentiated "stress". That mattered when shear was restricted to
 * four shapes (`V*Q/(I*b)` needs a single well-defined width, which an angle, a
 * closed tube and an arbitrary polygon do not have) and it matters now for a
 * different reason: a section declared by properties alone has no geometry, so
 * it must still be prevented from presenting a combined criterion.
 */

import type { Section } from '../store/model.svelte';
import type { TorsionProvenance } from './state';
import type { ElementForces } from '../engine/types';
import { analyzeSectionBending, type BendingResponse } from '../engine/wasm-solver';
import { computeDiagramValueAt } from '../engine/diagrams';
import { evaluateDiagramAt } from '../engine/diagrams-3d';
import type { ElementForces3D } from '../engine/types-3d';
import { resolveDrawingGeometry, assertSameGeometry, type DrawingGeometry, type DrawingRefusal } from './drawing';

export type StressComponentSource = 'canonical' | 'legacy' | 'unavailable';

/** Which parts of a detailed result may be trusted, and why. */
export interface ComponentProvenance {
  normalAndBending: StressComponentSource;
  transverseShear: StressComponentSource;
  torsion: StressComponentSource;
  /** True only when every component present is trustworthy for this section. */
  combinedCriteriaValid: boolean;
}

export interface CanonicalPanelResult {
  ok: true;
  geometry: DrawingGeometry;
  bending: BendingResponse;
  /** Resultants used, echoed so the panel can show exactly what was analysed. */
  forces: { n: number; my: number; mz: number };
  provenance: ComponentProvenance;
}

export type PanelRefusal =
  | DrawingRefusal
  | { kind: 'noResults' }
  | { kind: 'noForces' }
  | { kind: 'engineError'; message: string };

export type PanelResult = CanonicalPanelResult | { ok: false; refusal: PanelRefusal };

/**
 * Element-local resultants at a station, mapped into section coordinates.
 *
 * 2D carries a single bending moment about the section's horizontal axis, so
 * `mz` is zero; 3D supplies both. A rotated section sees the moment vector
 * rotated by `-rotation` in its own frame — the same transform the Rust side
 * applies, requested here by `forcesAreLocal` rather than duplicated.
 */
export function stationForces2D(
  ef: ElementForces,
  t: number,
): { n: number; my: number; mz: number; vy: number; vz: number; tx: number } {
  return {
    n: computeDiagramValueAt('axial', t, ef),
    my: computeDiagramValueAt('moment', t, ef),
    mz: 0,
    // A plane frame's shear acts in the plane, which is the section's vertical
    // axis, and carries no torsion.
    vy: 0,
    vz: computeDiagramValueAt('shear', t, ef),
    tx: 0,
  };
}

type SpanLoads = Array<{ qI: number; qJ: number; a: number; b: number }>;
type PointLoads = Array<{ a: number; p: number }>;

/**
 * A 3D element's resultants at a station.
 *
 * For a solver result (it carries its `length` and the start shears) every
 * resultant is the DIAGRAM's own value, `evaluateDiagramAt` — the same the 3D
 * diagrams draw and the legacy stress branch reads. Inside a loaded span the
 * moments are not a straight line between the member ends: a simply supported
 * beam under q has My = 0 at both ends and qL²/8 at midspan, which a linear
 * interpolation reads as zero. The 2D twin reads `computeDiagramValueAt` for the
 * same reason.
 *
 * A caller that only has end values (no length, no loads) gets the straight
 * line between them, which is exact for an unloaded member and the only thing
 * such a caller can mean.
 */
export function stationForces3D(
  ef: {
    nStart: number; nEnd: number;
    myStart: number; myEnd: number;
    mzStart: number; mzEnd: number;
    vyStart?: number; vyEnd?: number;
    vzStart?: number; vzEnd?: number;
    /**
     * Torsion about the local x axis.
     *
     * `mxStart` is what the 3D solver actually produces. This used to name the
     * field `txStart`, which no result object has ever carried, so the optional
     * read silently returned zero: the section panel showed "Mx = 8.00 kN·m" in
     * its header and "no torque at this station" three rows below it, and every
     * torsional and warping stress in the application was zero for that reason.
     *
     * The alias remains because a caller that assembles its own station forces
     * may legitimately call the quantity T; what cannot happen again is only
     * one spelling being read.
     */
    mxStart?: number; mxEnd?: number;
    txStart?: number; txEnd?: number;
    /** Present on a solver result: the member's length and the loads on it. */
    length?: number;
    distributedLoadsY?: SpanLoads; pointLoadsY?: PointLoads;
    distributedLoadsZ?: SpanLoads; pointLoadsZ?: PointLoads;
  },
  t: number,
): { n: number; my: number; mz: number; vy: number; vz: number; tx: number } {
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const opt = (a: number | undefined, b: number | undefined) =>
    a == null || b == null ? 0 : lerp(a, b);
  // Torsion and axial force are linear in the diagram too (no distributed
  // torque or axial load reaches the element forces).
  const tx = opt(ef.mxStart ?? ef.txStart, ef.mxEnd ?? ef.txEnd);
  const n = lerp(ef.nStart, ef.nEnd);

  if (ef.length != null && ef.length > 0 && ef.vyStart != null && ef.vzStart != null) {
    const full = {
      ...ef,
      length: ef.length,
      vyStart: ef.vyStart, vyEnd: ef.vyEnd ?? ef.vyStart,
      vzStart: ef.vzStart, vzEnd: ef.vzEnd ?? ef.vzStart,
      mxStart: ef.mxStart ?? ef.txStart ?? 0, mxEnd: ef.mxEnd ?? ef.txEnd ?? 0,
      distributedLoadsY: ef.distributedLoadsY ?? [], pointLoadsY: ef.pointLoadsY ?? [],
      distributedLoadsZ: ef.distributedLoadsZ ?? [], pointLoadsZ: ef.pointLoadsZ ?? [],
    } as ElementForces3D;
    return {
      n,
      my: evaluateDiagramAt(full, 'momentY', t),
      mz: evaluateDiagramAt(full, 'momentZ', t),
      vy: evaluateDiagramAt(full, 'shearY', t),
      vz: evaluateDiagramAt(full, 'shearZ', t),
      tx,
    };
  }

  return {
    n,
    my: lerp(ef.myStart, ef.myEnd),
    mz: lerp(ef.mzStart, ef.mzEnd),
    // Shear and torsion are optional so a caller with only bending resultants
    // still works; absent means zero, never "unknown scaled to something".
    vy: opt(ef.vyStart, ef.vyEnd),
    vz: opt(ef.vzStart, ef.vzEnd),
    tx,
  };
}

/** Decide which stress components this section may legitimately report. */
export function componentProvenance(sec: Section): ComponentProvenance {
  const st = sec.canonical;
  const canonical = st?.kind === 'geometry-backed';
  return {
    normalAndBending: canonical ? 'canonical' : 'unavailable',
    // Shear is solved from longitudinal equilibrium over the real outline, so
    // it no longer depends on the section having a single well-defined width.
    // An angle, a closed tube and an arbitrary polygon all report it now.
    transverseShear: canonical ? 'canonical' : 'unavailable',
    // Torsion follows whatever the section's constant is backed by: a closed
    // form for circular shapes, a published table where one exists, and
    // Saint-Venant solved on the mesh otherwise. `unavailable` now means the
    // section has no geometry at all, not that the problem is unsolved.
    torsion: canonical && st.j != null ? torsionSource(st.jProvenance) : 'unavailable',
    // A combined criterion is only meaningful if every component feeding it is
    // trustworthy. With shear or torsion unavailable, von Mises over "normal
    // stress plus nothing" is still exact, so the flag tracks whether an
    // INVALID component would be mixed in — never whether one is missing.
    combinedCriteriaValid: canonical,
  };
}

/** Map a torsional constant's provenance onto how much it may be trusted. */
function torsionSource(p: TorsionProvenance): StressComponentSource {
  switch (p) {
    // All three are derived from the section itself and may be relied on.
    case 'exactAnalytical':
    case 'saintVenant':
      return 'canonical';
    case 'catalogue':
      return 'canonical';
    // A value inherited from an old file with no known basis.
    case 'legacy':
      return 'legacy';
    default:
      return 'unavailable';
  }
}

/**
 * Build the canonical detailed-analysis result for one element station.
 *
 * Refuses rather than approximating: a properties-only section, an unresolved
 * section, absent results, or any geometry/digest disagreement all return a
 * structured refusal the panel can render as "detailed geometry unavailable".
 */
export function canonicalPanelResult(
  sec: Section,
  forces: { n: number; my: number; mz: number } | null,
): PanelResult {
  const drawing = resolveDrawingGeometry(sec);
  if (!drawing.ok) return { ok: false, refusal: drawing.refusal };
  if (!forces) return { ok: false, refusal: { kind: 'noForces' } };

  const st = sec.canonical;
  if (!st || st.kind !== 'geometry-backed') {
    return { ok: false, refusal: { kind: 'notResolved' } };
  }

  let bending: BendingResponse;
  try {
    bending = analyzeSectionBending({
      geometry: st.geometry,
      n: forces.n,
      my: forces.my,
      mz: forces.mz,
      // The section's own rotation maps element-local moments into its frame.
      forcesAreLocal: true,
    });
  } catch (err) {
    return { ok: false, refusal: { kind: 'engineError', message: (err as Error)?.message ?? String(err) } };
  }

  // The guard the whole layer exists for: the outline about to be drawn and
  // the field about to be plotted on it must be the same section.
  const mismatch = assertSameGeometry(drawing.geometry, bending);
  if (mismatch) return { ok: false, refusal: mismatch };

  return {
    ok: true,
    geometry: drawing.geometry,
    bending,
    forces,
    provenance: componentProvenance(sec),
  };
}
