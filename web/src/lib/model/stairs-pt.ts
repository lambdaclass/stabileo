/**
 * What the project states about its stairs and its post-tensioned slabs, in the design data.
 *
 * A stair is parametric: its flight (risers, treads, waist), its landings, how its ends bear and
 * its loads, with the beams its reactions were put on. A post-tensioned slab is a physical slab
 * declared `postTensioned`; the tendon system (strand, friction, wedge set, losses, f'ci) is the
 * project's, and each panel states its tendons in x and in y and the bonded steel placed.
 * Read by `store/stairs-pt.ts`.
 */
import type { StairDesignSpec } from '../engine/design/slabs/stairs';
import type { TendonLayout, TendonSystem } from '../engine/design/slabs/post-tensioned';

export interface StairSupport { elementId: number; /** Where the stair starts along the beam, m from its node I. */ a: number }
export interface StairEntry extends StairDesignSpec {
  id: string; name: string;
  /** Main and distribution bar diameters a person set, mm; absent, Ø12 and Ø8. */
  barDia?: number; distDia?: number;
  /** The beams at the foot and at the head its reactions were applied to. */
  supports?: { foot?: StairSupport; head?: StairSupport };
  /** The inclined plate the analysis meshes for this stair, when it was built from the same flight (`store/stair-link.ts`). */
  analysisQuads?: number[];
}

export interface PtPanelChoice {
  x?: TendonLayout; y?: TendonLayout;
  /** Bonded steel placed: m² per metre in the positive zone, m² at each column. */
  bonded?: { pos?: number; neg?: number };
}
export interface PostTensionData { system?: TendonSystem; panels?: Record<string, PtPanelChoice> }
