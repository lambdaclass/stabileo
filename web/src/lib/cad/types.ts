// CAD → RC draft import: shared types.
//
// Three pure-data layers, each one step closer to a structural model:
//   CadDocument  — geometric IR of the DXF file (layer names preserved as-is,
//                  closed polylines kept as regions, nothing interpreted).
//   ArchPlan     — semantic reading of the plan after the user confirms the
//                  role of each layer (columns/beams/walls/slabs/…).
//   RcDraft      — generated PRO model snapshot + provenance + warnings,
//                  applied to the store only on explicit user confirmation.
//
// Honesty rule: anything ambiguous becomes a warning or a user decision,
// never a silent guess.

import type { ModelSnapshot } from '../store/history.svelte';
import type { ModelProvenance } from '../model/provenance';

// ─── Geometry primitives ──────────────────────────────────────

export interface CadPt {
  x: number;
  y: number;
}

export interface CadBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type CadUnit = 'm' | 'cm' | 'mm';

export const CAD_UNIT_SCALE: Record<CadUnit, number> = { m: 1, cm: 0.01, mm: 0.001 };

// ─── CadDocument IR ───────────────────────────────────────────

export type CadEntity =
  | { kind: 'line'; layer: string; a: CadPt; b: CadPt }
  | { kind: 'polyline'; layer: string; pts: CadPt[]; closed: boolean }
  | { kind: 'arc'; layer: string; center: CadPt; r: number; startAngle: number; endAngle: number }
  | { kind: 'circle'; layer: string; center: CadPt; r: number }
  | { kind: 'insert'; layer: string; at: CadPt; blockName: string; bbox?: CadBBox }
  | { kind: 'text'; layer: string; at: CadPt; value: string };

export type CadEntityKind = CadEntity['kind'];

export interface CadLayer {
  /** Layer name exactly as authored in the DXF (case preserved). */
  name: string;
  entityCounts: Partial<Record<CadEntityKind, number>>;
  total: number;
}

export interface CadDocument {
  sourceName: string;
  /** Unit suggested by the DXF $INSUNITS header, or null when absent/unknown.
   *  The user always confirms the unit — this is only a pre-fill. */
  suggestedUnit: CadUnit | null;
  layers: CadLayer[];
  entities: CadEntity[];
  /** Drawing extent in raw DXF units (null for an empty drawing). */
  bbox: CadBBox | null;
  /** Counts of entity types present in the file but not representable in the
   *  IR (HATCH, SPLINE, DIMENSION, ELLIPSE, …). Surfaced as warnings. */
  unsupported: Record<string, number>;
  warnings: string[];
}

// ─── ArchPlan (semantic layer) ────────────────────────────────

export type LayerRole =
  | 'grid'
  | 'column'
  | 'beam'
  | 'wall'
  | 'slab'
  | 'opening'
  | 'text'
  | 'ignore';

export const LAYER_ROLES: LayerRole[] = [
  'grid', 'column', 'beam', 'wall', 'slab', 'opening', 'text', 'ignore',
];

export type RoleConfidence = 'high' | 'medium' | 'low';

export interface LayerMapping {
  layer: string;
  /** Role currently in effect (user-editable; starts as `suggested`). */
  role: LayerRole;
  suggested: LayerRole;
  confidence: RoleConfidence;
  /** Short human-readable reason for the suggestion (shown in the table). */
  evidence: string;
}

/** Where a member's dimensions came from (precedence: schedule > label >
 *  measured CAD geometry > wizard default). */
export type SpecSource = 'schedule' | 'label' | 'geometry' | 'default';

/** Column found in the plan, in metres (already unit-scaled). */
export interface ArchColumn {
  at: CadPt;
  /** Section size taken from the drawing (closed rectangle / block bbox /
   *  circle), if any. Missing → wizard default section. */
  b?: number;
  h?: number;
  /** Where the size came from, for the preview table. */
  sizeSource: 'rect' | 'insert' | 'circle' | 'default';
  /** Mark label found near the column (e.g. "C1"). */
  mark?: string;
  /** Refined dimension source after spec attachment. */
  specSource?: SpecSource;
  /** Source DXF layer (for per-layer contribution counts). */
  srcLayer?: string;
}

export interface ArchBeam {
  a: CadPt;
  b: CadPt;
  /** Beam width measured from paired face lines or a face polygon (m). */
  width?: number;
  /** Mark label found near the beam (e.g. "V-101"). */
  mark?: string;
  /** Depth from a label like "V-101: 15x40" (m). */
  depth?: number;
  specSource?: SpecSource;
  /** How the beam geometry was read: a single drawn centerline, a paired
   *  face-line couple, or a closed/open face polygon (PR [14] Layer 4). */
  geomSource?: 'centerline' | 'paired' | 'polygon';
  srcLayer?: string;
}

export interface ArchWall {
  a: CadPt;
  b: CadPt;
  /** Thickness from double-line pairing, if detected. Missing → default. */
  thickness?: number;
  thicknessSource: 'paired' | 'default';
  mark?: string;
  specSource?: SpecSource;
  srcLayer?: string;
}

export interface ArchSlab {
  /** Closed outline, collinear vertices pruned, no repeated last point. */
  outline: CadPt[];
  /** True when the pruned outline has exactly 4 corners (directly meshable). */
  isQuad: boolean;
  /** Axis-aligned rectilinear outline (decomposable into rectangles). */
  isRectilinear: boolean;
  /** Thickness from a label like "L1 h=15" (m). */
  thickness?: number;
  mark?: string;
  specSource?: SpecSource;
  /** True when this panel was INFERRED from the beam grid, not drawn as a
   *  closed outline (PR [14] Layer 2) — surfaced in provenance. */
  inferred?: boolean;
  srcLayer?: string;
}

/** One section-schedule row: member kind + mark (or '*' wildcard) + floor
 *  range (1-based, inclusive) + dimensions in metres (b×h for columns/beams,
 *  t for walls/slabs). Source: CAD schedule text or the wizard editor. */
export interface SectionScheduleEntry {
  kind: 'column' | 'beam' | 'wall' | 'slab';
  mark: string; // member mark or '*' for all
  fromFloor: number;
  toFloor: number;
  b?: number;
  h?: number;
  t?: number;
  source: 'cad' | 'wizard';
}

export interface ArchOpening {
  outline: CadPt[];
}

/** A recognized architectural room/use label at a plan position (metres). */
export interface RoomLabel {
  at: CadPt;
  category: string;
  q: number;   // live load kN/m² (CIRSOC 101)
  raw: string; // cleaned label text
}

export interface ArchPlan {
  /** All geometry below is in metres (unit scale already applied). */
  unit: CadUnit;
  mappings: LayerMapping[];
  columns: ArchColumn[];
  beams: ArchBeam[];
  walls: ArchWall[];
  slabs: ArchSlab[];
  openings: ArchOpening[];
  /** Grid/axis lines, preview-only (no structural meaning in v1). */
  gridLines: Array<{ a: CadPt; b: CadPt }>;
  /** Section-schedule rows parsed from CAD schedule text (STB_SECTION_SCHEDULE_*). */
  schedules: SectionScheduleEntry[];
  /** Architectural room/use labels (text), in metres, with their mapped
   *  live-load category + q. Empty when the plan has no recognizable rooms. */
  roomLabels: RoomLabel[];
  /** Per-story heights parsed from an STB_LEVEL_SCHEDULE block, base→top (m). */
  levelHeights?: number[];
  warnings: string[];
  /** Entities on structural layers that could not be converted (kind + layer
   *  + reason). Shown in the preview as "skipped". */
  skipped: Array<{ kind: CadEntityKind; layer: string; reason: string }>;
}

// ─── Draft assumptions & result ───────────────────────────────

export type ConcreteGrade = 'H-21' | 'H-25' | 'H-30' | 'H-35' | 'H-40';

export const CONCRETE_GRADES: Record<ConcreteGrade, { e: number; fc: number; rho: number }> = {
  // e in MPa, fc (f'c) in MPa carried in material.fy, rho in kN/m³
  'H-21': { e: 21000, fc: 21, rho: 24 },
  'H-25': { e: 25000, fc: 25, rho: 24 },
  'H-30': { e: 30000, fc: 30, rho: 25 },
  'H-35': { e: 33000, fc: 35, rho: 25 },
  'H-40': { e: 35000, fc: 40, rho: 25 },
};

export interface RcDraftAssumptions {
  nFloors: number;
  /** Per-story heights in m, base→top. Length must equal nFloors. */
  storyHeights: number[];
  concreteGrade: ConcreteGrade;
  /** Default column section (m), used when the drawing gives no size. */
  columnSection: { b: number; h: number };
  beamSection: { b: number; h: number };
  slabThickness: number;
  wallThickness: number;
  baseSupport: 'fixed3d' | 'pinned3d';
  /** Explicit user-entered area loads on slabs, kN/m² (0 allowed). These are
   *  NOT code-generated; self-weight is NOT added automatically. */
  deadLoad: number;
  liveLoad: number;
  /** Roof live load Lr (kN/m²). When defined, the TOP floor's slabs carry Lr
   *  (load case type 'Lr') instead of L; lower floors keep L. Undefined →
   *  L applies to every floor including the roof (previous behavior). */
  roofLiveLoad?: number;
  /** Floor-dependent section schedules (wizard rows win over same-key CAD
   *  rows; both win over labels/geometry; defaults fill the rest). */
  schedules?: SectionScheduleEntry[];
  /** Detect beams flush with column faces and write PR [7] member offsets. */
  detectOffsets?: boolean;
  /** Assign per-quad live loads from architectural room labels (nearest-label
   *  classification) instead of one global L. Default false → global L. */
  roomBasedLiveLoads?: boolean;
  /** Explicit override: when true, openings are NOT cut from slab shells
   *  (meshed solid) and a high-severity warning is emitted. Default false —
   *  openings are respected (cut, or the affected shell is refused/warned). */
  ignoreOpenings?: boolean;
  /** Min plan eccentricity (m) to treat as a real offset. Default 0.03. */
  offsetTolerance?: number;
  /** Generate only the simple explicit combos 1.4D and 1.2D+1.6L. */
  generateCombos: boolean;
  meshSlabs: boolean;
  /** Meshing mode. 'targetSize' (default) sizes cells near `meshTargetSize`
   *  and forces mesh lines through beams/openings/walls/columns; legacy
   *  'fixedDivisions' uses `meshDivisions` even subdivisions per panel. */
  meshMode?: 'targetSize' | 'fixedDivisions';
  /** Target shell element size in m for 'targetSize' mode (default 1.0). */
  meshTargetSize?: number;
  /** Subdivisions per slab side in legacy 'fixedDivisions' mode. */
  meshDivisions: number;
  /** Split beams at slab-mesh edge nodes so shells share nodes with beams. */
  splitBeams: boolean;
  /** Node weld/snap tolerance in m. */
  snapTolerance: number;
}

export type DraftWarningSeverity = 'error' | 'warning' | 'info';

export interface DraftWarning {
  severity: DraftWarningSeverity;
  message: string;
}

export interface RcDraftResult {
  snapshot: ModelSnapshot;
  provenance: ModelProvenance;
  warnings: DraftWarning[];
  counts: {
    nodes: number;
    columns: number;
    beams: number;
    slabQuads: number;
    wallQuads: number;
    supports: number;
    loads: number;
    combinations: number;
    beamsSplit: number;
    slabsSkipped: number;
    /** Beam elements that received a detected eccentric member offset. */
    beamsWithOffsets: number;
    /** Eccentricity candidates left unapplied because they were ambiguous. */
    offsetsAmbiguous: number;
    /** Members (counted once, at floor 1) by dimension source. */
    specSections: Record<SpecSource, number>;
    /** Member-story segments whose section came from a schedule row. */
    scheduleAssignments: number;
    /** Openings recognized on opening layers (whole plan). */
    openingsDetected: number;
    /** Openings cut out of at least one generated slab shell. */
    openingsCutFromSlabs: number;
    /** Openings recognized but NOT cut (skewed slab, or user chose ignore). */
    openingsNotCut: number;
    /** Slabs supported on exactly one edge (cantilever / balcón–voladizo). */
    cantileverSlabs: number;
    /** Slabs with no structural support — skipped (an isolated slab is invalid). */
    slabsIsolated: number;
    /** When room-based L is on: live-quad count per room category (floor quads,
     *  one count per quad-floor). Empty/absent when global L is used. */
    liveLoadByCategory: Record<string, number>;
    /** Floor quads that fell back to the default L (no nearby room label). */
    liveLoadDefaulted: number;
  };
}
