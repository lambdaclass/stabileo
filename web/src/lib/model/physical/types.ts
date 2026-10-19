/**
 * Physical elements: a continuous beam, a column of several storeys, a slab, a wall, a brace.
 *
 * What an engineer draws and designs, above the analysis bars and shells that represent it. Kept
 * as model groups of kind `physicalMember`, whose data round-trips verbatim, so a file with
 * physical elements opens intact in a build that does not know them, and a kind added later
 * needs no new schema.
 */
export const PHYSICAL_GROUP_KIND = 'physicalMember' as const;

export type PhysicalKind = 'beam' | 'column' | 'brace' | 'slab' | 'wall' | (string & {});

/** Typologies a kind can take. Open: an unknown one is kept as it is. */
export const TYPOLOGIES: Record<string, readonly string[]> = {
  beam: ['dropped', 'flat', 'inverted', 'foundation', 'tie', 'strap', 'edge', 'steel', 'timber'],
  column: ['concrete', 'steel', 'composite', 'timber'],
  brace: ['steel', 'timber'],
  slab: ['solid', 'joist', 'waffle', 'hollowCore', 'composite', 'postTensioned', 'ramp'],
  wall: ['concrete', 'masonry', 'basement'],
};

/** Where the kind came from: a person said it, a generator made it, or it was read off the geometry. */
export type PhysicalProvenance = 'declared' | 'generator' | 'inferred';

export interface PhysicalData {
  kind: PhysicalKind;
  typology?: string;
  /** Level ids (`lib/model/grid.ts`) or, with no grid, the elevation as `z:<m>`. */
  levelFrom?: string;
  levelTo?: string;
  provenance: PhysicalProvenance;
  /** A basement wall's retained soil: grade, unit weight, K, surcharge, a plan point in the soil. */
  retains?: { gradeZ: number; gamma: number; k: number; surcharge: number; side?: { x: number; y: number } };
  /** A wall's openings, along its length from its start and up from its level, m. */
  openings?: Array<{ offset: number; width: number; sill: number; height: number }>;
}

export interface PhysicalDraft extends PhysicalData {
  name: string;
  elements: number[];
  plates: number[];
  quads: number[];
}
