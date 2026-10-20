/**
 * The reinforcement a member HAS: the decision a design run proposes and a person edits.
 *
 * Part of the design contract. These types used to live inside the reactive model store, so
 * nothing could read a member's bars without pulling in the store; the store re-exports them,
 * so every existing import keeps working. Plain data, no runtime.
 */

/** A group of reinforcement bars (e.g., "4 Ø16"). */
export interface RebarGroup {
  count: number;     // number of bars
  diameter: number;  // mm (matches REBAR_DB diameters: 6, 8, 10, 12, 16, 20, 25, 32)
}

/**
 * A single row/layer of reinforcement bars at a specific depth from the face.
 *
 * Row 0 = closest to face (outermost), row 1 = next inward, etc.
 * Centroid distance from face = cover + stirrup + barDia/2 + row × (barDia + gap).
 *
 * When only one row exists with all bars, this is equivalent to RebarGroup.
 * Multiple rows allow accurate centroid computation for d and d'.
 */
export interface RebarLayer {
  count: number;     // bars in this row
  diameter: number;  // mm
  row: number;       // 0 = outermost (closest to face), 1 = next, etc.
}

/** Stirrup definition (diameter, legs, spacing). */
export interface StirrupDef {
  diameter: number;   // mm
  legs: number;       // number of legs (2, 3, 4...)
  spacing: number;    // m (center-to-center)
}

/**
 * Region-aware beam reinforcement.
 *
 * Three zones matching real RC detailing practice:
 *   - Start support region (t ≈ 0–0.25): top bars for hogging Mz-
 *   - Span region (t ≈ 0.25–0.75): bottom bars for sagging Mz+
 *   - End support region (t ≈ 0.75–1.0): top bars for hogging Mz-
 *
 * Region boundary defaults: t=0.25 and t=0.75.
 * Real support-face offsets depend on column dimensions which are not
 * yet available per-element; t-based regions are a truthful approximation.
 */
/**
 * Longitudinal bar continuity model for beams.
 *
 * Controls whether bars from one region are assumed to extend into adjacent regions,
 * which affects compression steel availability and anchorage requirements.
 *
 * Default: all true (standard continuous practice).
 * Setting to false means the bar group stops at the region boundary —
 * it does not contribute as compression steel in the adjacent region,
 * and an anchorage/development warning may be raised.
 */
/**
 * A longitudinal bar group with explicit curtailment behavior.
 *
 * Each group represents a subset of bars on a face that share the same
 * continuation/cutoff behavior. Multiple groups per face allow partial
 * curtailment: some bars continue while others stop.
 *
 * Example: bottom face of a span region might have:
 *   - Group 1: 4Ø20 — "full-length" bars that continue into both supports
 *   - Group 2: 2Ø20 — "cutoff" bars that stop at the span boundaries
 */
export interface LongBarGroup {
  /** Bar layer(s) in this group */
  layers: RebarLayer[];
  /** Label for identification (e.g., "full-length", "cutoff") */
  label?: string;
  /** Whether this group continues into the start-adjacent region. Default: true. */
  continueStart?: boolean;
  /** Whether this group continues into the end-adjacent region. Default: true. */
  continueEnd?: boolean;
  /** Available extension length into start-adjacent region (m). undefined = assume region length. */
  extensionStart?: number;
  /** Available extension length into end-adjacent region (m). */
  extensionEnd?: number;
  /** Anchorage type at each end. */
  anchorageStart?: 'straight' | 'hook' | 'none';
  anchorageEnd?: 'straight' | 'hook' | 'none';
}

export interface BeamContinuity {
  /** Bottom span bars extend into start support region (compression steel for hogging). Default: true. */
  bottomIntoStart?: boolean;
  /** Bottom span bars extend into end support region (compression steel for hogging). Default: true. */
  bottomIntoEnd?: boolean;
  /** Top start bars extend into span region (compression steel for sagging). Default: true. */
  topStartIntoSpan?: boolean;
  /** Top end bars extend into span region (compression steel for sagging). Default: true. */
  topEndIntoSpan?: boolean;
  /** Development length available at start anchorage (m). 0 = not anchored. undefined = assume adequate. */
  ldStart?: number;
  /** Development length available at end anchorage (m). */
  ldEnd?: number;
}

export interface BeamRegions {
  // ── Grouped bar fields (backward compatible, single-row assumption) ──
  topStart?: RebarGroup;        // top bars at start support (hogging)
  topEnd?: RebarGroup;          // top bars at end support (hogging)
  bottomSpan?: RebarGroup;      // bottom bars at span (sagging)
  // ── Explicit layer fields (when multiple rows are specified) ──
  topStartLayers?: RebarLayer[];   // top rows at start support
  topEndLayers?: RebarLayer[];     // top rows at end support
  bottomSpanLayers?: RebarLayer[]; // bottom rows at span
  // ── Partial curtailment: multiple bar groups per face ──
  /** Bottom bar groups in span (each with own curtailment). Overrides bottomSpanLayers when present. */
  bottomGroups?: LongBarGroup[];
  /** Top bar groups at start support. Overrides topStartLayers when present. */
  topStartGroups?: LongBarGroup[];
  /** Top bar groups at end support. Overrides topEndLayers when present. */
  topEndGroups?: LongBarGroup[];
  // ── Longitudinal continuity (legacy boolean — superseded by barGroups when present) ──
  continuity?: BeamContinuity;
  // ── Stirrups ──
  stirrupsSupport?: StirrupDef; // tighter stirrups near supports
  stirrupsSpan?: StirrupDef;    // wider stirrups at midspan
  /** Region boundary (t-value, default 0.25). Start region: [0, t1], span: [t1, 1-t1], end: [1-t1, 1] */
  regionT?: number;
  /**
   * Skin bars on both side faces of a deep beam (§9.7.2.3, h > 900 mm), over the half of the depth
   * nearest the tension face: their diameter, mm, and spacing, m.
   */
  skin?: { diameter: number; spacing: number };
}

/**
 * Provided reinforcement for an RC element — entered or accepted by the engineer.
 *
 * For beams:
 *   - `regions`: region-aware reinforcement (start/span/end with separate stirrups)
 *   - Legacy `top`/`bottom`/`stirrups` still supported for backward compatibility
 *     and are treated as element-global (all regions use the same bars)
 *
 * For columns:
 *   - `longitudinal`: total longitudinal bars (symmetric layout assumed)
 *   - `stirrups`: transverse confinement/shear ties
 *
 * This is the engineer's stated design intent. Verification checks this
 * against the station-based governing demands, not the auto-proposed values.
 */
/**
 * Structured column reinforcement model.
 *
 * Breaks down the longitudinal reinforcement into corner + face bars,
 * which maps directly to the perimeter distribution used in verification
 * and the section schematic.
 *
 * Total bars = 4 corners + nBottom + nTop + nLeft + nRight.
 */
export interface ColumnReinforcement {
  cornerDia: number;        // mm — corner bar diameter (4 corners always)
  faceDia: number;          // mm — face bar diameter (may differ from corner)
  nBottom: number;          // face bars on bottom edge (between corners)
  nTop: number;             // face bars on top edge
  nLeft: number;            // face bars on left edge
  nRight: number;           // face bars on right edge
}

/**
 * A wall's reinforcement on one level: its vertical and horizontal bars in one or two curtains,
 * the extra vertical bars concentrated at each end (boundary elements), and the bars beside each
 * side of each opening (§11.7.5).
 */
export interface WallReinforcement {
  vertical: { diameter: number; spacing: number };
  horizontal: { diameter: number; spacing: number };
  curtains: 1 | 2;
  boundary?: { count: number; diameter: number };
  openings?: { count: number; diameter: number };
}

/** A band of extra slab bars: face, bar direction, plan rectangle, bars. */
export interface SlabBand {
  id: string;
  face: 'top' | 'bottom';
  dir: 'x' | 'y';
  x0: number; x1: number; y0: number; y1: number;
  diameter: number; spacing: number;
  hookStart?: boolean; hookEnd?: boolean;
  /**
   * The bars' direction in plan, degrees from x; absent, along `dir` (0 or 90). A band at an
   * angle carries cos² of its area per metre in x and sin² in y.
   */
  angle?: number;
  /** A free outline in plan, m; absent, the rectangle x0–x1 × y0–y1 (which stays its bounding box). */
  outline?: Array<{ x: number; y: number }>;
  /** Equal bands drawn and scheduled as one package, under one mark. */
  group?: string;
  /** Where the band's text sits on the plan, m; absent, at the middle of its bars. */
  label?: { x: number; y: number };
}

/**
 * A slab panel's reinforcement: a base mat per face and direction (absent where none) and
 * bands of extra bars where the strips need more than the base.
 */
export interface SlabPanelReinforcement {
  base: Partial<Record<'topX' | 'topY' | 'bottomX' | 'bottomY', { diameter: number; spacing: number }>>;
  bands: SlabBand[];
}

export interface ProvidedReinforcement {
  // ─── Beam reinforcement (region-aware) ───
  regions?: BeamRegions;
  // ─── Beam reinforcement (legacy element-global, backward compatible) ───
  top?: RebarGroup;             // top bars (all support regions)
  bottom?: RebarGroup;          // bottom bars (span region)
  // ─── Column reinforcement (structured) ───
  column?: ColumnReinforcement;
  // ─── Column reinforcement (circular, T and L sections) ───
  /** Bars spread around a non-rectangular outline, and the spiral of a circular column. */
  shaped?: { count: number; diameter: number; spiral?: { diameter: number; pitch: number } };
  // ─── Column reinforcement (legacy grouped) ───
  longitudinal?: RebarGroup;    // total longitudinal bars
  // ─── Transverse reinforcement (beams and columns) ───
  stirrups?: StirrupDef;
  /** A column's denser ties at both ends: how far from each end, m, and at what spacing, m. */
  tieZones?: { endLength: number; endSpacing: number };
}
