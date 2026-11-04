/**
 * What the project states about fire and about its particular elements, in the design data:
 * the fire rating and how it is met (`store/fire.ts`), and the corbels, coupling beams, beam
 * openings, masonry walls, infill panels and connections it designs (`store/special-elements.ts`).
 */
import type { ConcreteFireEntry, FireProtection } from '../engine/design/fire/fire';

export interface FireSettings {
  /** Fire rating, minutes (R30, R60…). Absent: no fire design. */
  rMinutes?: number;
  /** Factor on the live load in the fire combination D + ψ·L. */
  psi?: number;
  steel?: { exposure?: 3 | 4; method?: 'contour' | 'box'; protection?: FireProtection & { name?: string } };
  /** Minimum width and axis distance by kind of member and rating, from the fire code the project follows. */
  concreteTable?: ConcreteFireEntry[];
  /** Charring rate (mm/min), zero-strength layer (mm) and the factor on the reference strengths. */
  timber?: { betaN: number; d0: number; kfi: number };
}

/** A corbel: its geometry and, when it carries a beam of the model, the beam's end that loads it. */
export interface CorbelEntry {
  id: string; name: string;
  bw: number; h: number; d: number; av: number; hEdge?: number;
  /** Stated forces, kN; ignored when `from` reads them from the analysis. */
  vu?: number; nuc?: number; sustained?: number;
  monolithic: boolean;
  from?: { elementId: number; end: 'i' | 'j' };
  ascProvided?: number; ahProvided?: number;
}
/** What the project states about a coupling beam the design found (by element). */
export interface CouplingChoice { alphaDeg?: number; barDia?: number; ashProvided?: number; excluded?: boolean }
/** A rectangular opening through a beam's web. */
export interface OpeningEntry { id: string; elementId: number; x: number; lo: number; ho: number; offset?: number }
/** A masonry wall's material and confining elements, by physical group key. */
export interface MasonryChoice extends Omit<import('../engine/design/masonry/confined-masonry').ConfinedWallInput, 'L' | 't' | 'H' | 'nMin' | 'vu' | 'mu' | 'nu' | 'muOut'> {
  muOut?: number;
}
/** A masonry infill in a frame bay: the two columns and the beam above, and the struts put in the model. */
export interface InfillEntry {
  id: string; name: string;
  columns: [number, number]; beam: number;
  t: number; em: number; strength: number;
  strutIds?: number[]; materialId?: number; sectionId?: number;
}
/** A tubular truss joint at a node: its type (found from the geometry when absent), gap and eccentricity. */
export interface HssJointEntry { id: string; nodeId: number; joint?: 'T' | 'Y' | 'X' | 'K'; gap?: number; e?: number }
/** A timber dowel-type connection: the fastener, the members' bearing values, and the force it carries. */
export interface DowelEntry extends Omit<import('../engine/design/connections/timber-dowel').TimberConnectionInput, 'demand' | 'caseTypes' | 'comboName'> {
  id: string; name: string;
  demand?: number;
  from?: { elementId: number };
}

export interface SpecialElementsData {
  corbels?: CorbelEntry[];
  coupling?: Record<string, CouplingChoice>;
  openings?: OpeningEntry[];
  masonry?: Record<string, MasonryChoice>;
  infills?: InfillEntry[];
  hss?: HssJointEntry[];
  dowels?: DowelEntry[];
}
