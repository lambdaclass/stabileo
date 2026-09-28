/**
 * Signed normal stress in members, station by station: the largest tension and the largest
 * compression anywhere on the cross-section.
 *
 * σ = N/A plus unsymmetrical bending, over the section's canonical geometry: the engine's
 * bending analysis (`analyzeSectionBending`, the full inertia tensor, so an angle or a channel is
 * not read as if its geometric axes were principal) gives the stress on the section's boundary,
 * where the extremes of a linear field lie. The field is linear in N, My and Mz, so each section
 * is solved three times, once per unit resultant, and every station is a combination of those:
 * one table over thousands of members does not call the engine once per station.
 *
 * A section known by its properties alone (no geometry) is read over its bounding rectangle,
 * N/A ± My·(h/2)/Iy ± Mz·(b/2)/Iz, when it states b and h, and is not read otherwise.
 *
 * MPa, tension positive.
 */
import { analyzeSectionBending, type CanonicalGeometry } from './wasm-solver';
import { extractForcesAtStation, stationTs, type StationSpec } from './station-forces';
import { analyzeDrawn, compositeStress } from '../section/drawn-properties';
import { catalogueOutline } from '../section/canonical';
import type { DrawnSection } from '../section/drawn';
import type { ElementForces3D } from './types-3d';

export interface StationStress { elementId: number; x: number; sigmaMax: number; sigmaMin: number; basis: 'geometry' | 'bounds' }

/** How a section turns (N, My, Mz) into the extremes of σ. */
export type SectionStressModel = ((n: number, my: number, mz: number) => { max: number; min: number }) & { basis: 'geometry' | 'bounds' };

interface SectionLike {
  a: number; iy?: number; iz: number; b?: number; h?: number;
  canonical?: { kind?: string; geometry?: CanonicalGeometry; composite?: boolean };
  drawn?: DrawnSection;
  rotation?: number;
}

/** The stress model of a section, or null when its geometry and its dimensions are both unknown. */
export function sectionStressModel(sec: SectionLike): SectionStressModel | null {
  // Several materials: the transformed section, n times its stress in each part.
  if (sec.drawn && sec.canonical?.kind === 'geometry-backed' && sec.canonical.composite) {
    const c = compositeStress(analyzeDrawn(sec.drawn, catalogueOutline, { torsion: false }), ((sec.rotation ?? 0) * Math.PI) / 180);
    if (c) {
      const f = ((n: number, my: number, mz: number) => {
        const r = c(n, my, mz);
        return { max: r.max / 1000, min: r.min / 1000 }; // kPa → MPa
      }) as SectionStressModel;
      f.basis = 'geometry';
      return f;
    }
  }
  const g = sec.canonical?.kind === 'geometry-backed' ? sec.canonical.geometry : undefined;
  if (g) {
    try {
      const unit = (n: number, my: number, mz: number) => analyzeSectionBending({ geometry: g, n, my, mz, forcesAreLocal: true }).boundary.map((p) => p.sigma);
      const sn = unit(1, 0, 0), sy = unit(0, 1, 0), sz = unit(0, 0, 1);
      if (sn.length > 0 && sn.length === sy.length && sn.length === sz.length) {
        const f = ((n: number, my: number, mz: number) => {
          let max = -Infinity, min = Infinity;
          for (let i = 0; i < sn.length; i++) {
            const s = n * sn[i]! + my * sy[i]! + mz * sz[i]!;
            if (s > max) max = s;
            if (s < min) min = s;
          }
          return { max: max / 1000, min: min / 1000 }; // kPa → MPa
        }) as SectionStressModel;
        f.basis = 'geometry';
        return f;
      }
    } catch {
      // Fall through to the bounding rectangle.
    }
  }
  const iy = sec.iy ?? sec.iz;
  if (!(sec.a > 0 && sec.b && sec.h && iy > 0 && sec.iz > 0)) return null;
  const wy = iy / (sec.h / 2), wz = sec.iz / (sec.b / 2);
  const f = ((n: number, my: number, mz: number) => {
    const axial = n / sec.a, bend = Math.abs(my) / wy + Math.abs(mz) / wz;
    return { max: (axial + bend) / 1000, min: (axial - bend) / 1000 };
  }) as SectionStressModel;
  f.basis = 'bounds';
  return f;
}

/** The stations of one member, `n` equally spaced (ends included) or the critical ones, with σmax and σmin at each. */
export function memberStationStresses(ef: ElementForces3D, model: SectionStressModel, n: StationSpec = 5): StationStress[] {
  const out: StationStress[] = [];
  for (const t of stationTs(ef, n)) {
    const s = extractForcesAtStation(ef, t);
    const r = model(s.n, s.my, s.mz);
    out.push({ elementId: ef.elementId, x: t * ef.length, sigmaMax: r.max, sigmaMin: r.min, basis: model.basis });
  }
  return out;
}
