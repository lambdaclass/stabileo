import {
  defaultCodeSettings, migrateCodeSettings, type ProjectCodeSettings,
} from '../codes/project-code-settings';
import {
  emptyDetailingStore, migrateDetailingStore, type DetailingStore,
} from '../engine/detailing/assembly';
import { migrateRegulations, type StoredRegulations } from '../codes/roles';
import {
  cloneStoredJointDesigns, type StoredJointDesigns,
} from '../connection/joint-choices';
import type { RevisionVector } from '../codes/revisions';
import {
  defaultFootingMatPreferences, migrateFootingMatPreferences, migrateFootings, newFooting,
  type Footing, type FootingMatPreferences,
} from '../model/footing';
import { DEFAULT_COVER } from '../engine/design/member-context';
import {
  emptyGeotechnical, migrateGeotechnical, newSoilProfile,
  type ProjectGeotechnical, type SoilProfile,
} from '../model/geotechnical';
// Model store - manages the structural model
import type { KinematicResult } from '../engine/kinematic-2d';
import {
  refreshCanonicalSections as refreshCanonicalSectionsImpl,
  restoreCanonicalSections,
  resolveDefaultSection,
  resolveOnCreate,
  resolveOnUpdate,
} from './canonical-sections';
import type { SolverInput, FullEnvelope, AnalysisResults } from '../engine/types';
import type { SolverInput3D, AnalysisResults3D, FullEnvelope3D, Constraint3D, ConnectorElement } from '../engine/types-3d';
export type { ConnectorElement };
import type { ModelSnapshot, SnapshotKind } from './history.svelte';
import { getFixture, is2DFixture, is3DFixture } from '../templates/fixture-index';
import { loadFixture } from '../templates/load-fixture';
import { inferLoadCaseType } from '../engine/combinations-service';
import { t } from '../i18n';
import { validateAndSolve2D, validateAndSolve2DAsync, buildSolverInput2D, validateAndSolve3D, validateAndSolve3DAsync, buildSolverInput3D as buildSolverInput3DFn, solveCombinations2D, solveCombinations3D as solveCombinations3DFn, solveCombinations3DParallel as solveCombinations3DParallelFn } from '../engine/solver-service';
import { computeInfluenceLine as computeInfluenceLineFn } from '../engine/influence-service';
import { to2D, remapNodalLoad2D, remapMoment2D, type DrawPlane } from '../geometry/plane-projection';
import { pickElement3DMetadata, type Element3DMetadata, type MemberOffset } from '../model/element-3d-metadata';
import type { ModelProvenance } from '../model/provenance';
export type { MemberOffset, MemberOffsetVec } from '../model/element-3d-metadata';
import { uiStore } from './ui.svelte';
import { plainDeepCopy } from '../utils/plain-deep-copy';
// Cycle-safe: switch-2d imports this module, but resetSwitchBackup is a
// hoisted function declaration and is only ever CALLED at runtime (clear(),
// below), never during module initialisation.
import { resetSwitchBackup } from './switch-2d';

export interface Node {
  id: number;
  x: number;
  y: number;
  z?: number;  // 3D coordinate (default 0 for 2D models)
}

export interface Material {
  id: number;
  name: string;
  e: number;  // MPa
  nu: number;
  rho: number; // kN/m³
  fy?: number; // MPa (yield stress for stress verification)
  /**
   * Which catalogued grade this material came from, when it came from one.
   *
   * Stored rather than inferred from `name`: a user can rename a material to
   * anything, and reading a designation back out of a label is the kind of
   * guess this codebase avoids elsewhere. Absent means "not from the
   * catalogue", which is a real state and not a missing value — nothing that
   * reads this should warn about its absence.
   */
  gradeId?: string;
  /**
   * Maximum nominal coarse-aggregate size, mm, or null when the project has not stated it.
   *
   * This lives on the MATERIAL, not on the regulation settings. It is a property of the
   * concrete mixture — CIRSOC 200 territory — and CIRSOC 201-2025 §25.2.1 merely consumes
   * it inside the minimum clear-spacing rule. Having the regulation panel own it was a
   * category error: it made the value look like a code choice rather than a mix design.
   *
   * `null` is meaningful and persisted: it is what keeps the fallback visible as an
   * assumption on every subsequent open instead of baking 20 mm in permanently.
   */
  maxAggregateSizeMm?: number | null;
  /**
   * Additional transverse bar-spacing margin above the regulatory minimum, mm.
   *
   * A PROJECT decision, not a code one. CIRSOC's minimum clear spacing IS the construction
   * requirement and prescribes nothing further between parallel bars, so the default is
   * zero and the app never implies otherwise. An engineer raises it to get a more
   * conservative cage.
   *
   * Lives beside the aggregate size for the same reason that does: both are properties of
   * how the concrete gets placed, not of the regulation. `null` and `0` mean the same
   * thing here — no margin — but `null` records that the project never stated one.
   *
   * §26.6.2.1 cover and effective-depth tolerances are mandatory, prescribed, and entirely
   * separate from this.
   */
  spacingMarginMm?: number | null;
  /** Placed by shotcrete, which caps d_agg at 13 mm (§26.4.2.1(a)(13)). */
  shotcrete?: boolean;
}

export interface Section {
  id: number;
  name: string;
  a: number;  // m²
  iz: number; // m⁴ — moment of inertia about Z-axis (vertical)
  b?: number; // m
  h?: number; // m
  /**
   * `'Z'` is the lipped cold-formed zed, added because a Z could not otherwise be stored or
   * drawn: `createSectionShape` dispatches on this field, so a section without a literal here
   * has no outline. Field meanings follow `'C'` exactly — `t` is the lip LENGTH and `tl` the lip
   * thickness — so nothing else about a Z section is new. See `profiles/cold-formed.ts`.
   */
  shape?: 'I' | 'H' | 'U' | 'L' | 'RHS' | 'CHS' | 'rect' | 'generic' | 'T' | 'invL' | 'C' | 'Z';
  tw?: number;  // m - espesor alma (web thickness)
  tf?: number;  // m - espesor ala (flange thickness)
  t?: number;   // m - espesor pared (wall thickness, hollow sections) / lip length (C-channel)
  tl?: number;  // m - lip thickness (C-channel only)
  iy?: number;  // m⁴ — moment of inertia about Y-axis (horizontal) (3D only)
  j?: number;   // m⁴ — torsional constant Saint-Venant (3D only)
  rotation?: number;  // degrees — rotation of section profile around bar axis (0-360)
  /**
   * Which catalogue family this section was picked from (IPE, W, UPN...).
   *
   * Same reasoning as `Material.gradeId`: recorded at selection time, never
   * parsed back out of the name. It is what lets the app tell whether a
   * section/steel pairing matches what mills actually roll.
   */
  profileFamily?: string;
  /**
   * How a PARAMETRIC section was built: which template, and the numbers typed into it.
   *
   * ── What it is not ────────────────────────────────────────────────
   *
   * Not `composition`. That field names parts of the CATALOGUE — `profileName` is documented as
   * "exact catalogue name" — and a section built from a template has no catalogue part to name.
   * Writing one would be the defect `composition` exists to close: the make-up of a section
   * stated in a string nobody can act on.
   *
   * Not provenance either. `ModelProvenance` records where a whole MODEL came from; this is a
   * property of one section, and a project can mix a built section with catalogue picks.
   *
   * ── What it buys, stated precisely ────────────────────────────────
   *
   * The derived numbers were already stored: `a`, `iy`, `iz`, `j`, plus `shape` and the
   * thicknesses. What was NOT stored is the INPUT, and three things follow from that:
   *
   *   1. **A built section cannot be edited.** Reopening a project, the only way to change a web
   *      thickness is to delete the section and retype every parameter, because nothing recorded
   *      what they were.
   *   2. **Its origin is unanswerable.** A catalogue pick carries `profileFamily`, an assembly
   *      carries `composition`, and a built section carried neither — so "where did this come
   *      from" had no answer for exactly one of the three ways a section can be created.
   *   3. **A parameter the apply path forgets is invisible.** The lipped channel is the live case:
   *      `computeSectionProperties` takes `tl` — lip thickness — as its own input and returns it,
   *      the apply path dropped it, and `createSectionShape`'s `case 'C'` falls back to the FLANGE
   *      thickness when it is absent. So the properties were computed from one lip and the outline
   *      drawn with another, and the two agreed only while a user left them equal. With the inputs
   *      travelling on the section, that class of loss is detectable instead of silent.
   *
   * ── Declarative, like `composition` ───────────────────────────────
   *
   * Nothing in the properties path reads it. `a`/`iy`/`iz`/`j` on this section stay
   * authoritative, and the canonical resolver is not handed a second opinion about the geometry.
   * It is a record of an input, not a source of truth about an output.
   *
   * ── Where it persists, and where it does not ──────────────────────
   *
   * Optional, so every stored model predating it stays valid — and `snapshot()` spreads the
   * section wholesale while `restore()` copies it, so `.ded`, undo/redo and tab capture carry it
   * with no change to any of them.
   *
   * A SHARE LINK does not. `compressV2` in `utils/url-sharing.ts` encodes a section as the
   * positional tuple `[id, name, a, iz, {s,b,h,w,f,t,iy,j,rot}]`, which has never carried `tl`,
   * `profileFamily` or `composition` either — so an assembly shared by URL already comes back
   * without its make-up. Widening that format is a separate, versioned decision
   * (`SHARE_VERSION`); `built-section-contract.test.ts` pins the current loss so it is a stated
   * limitation and not a surprise.
   */
  built?: {
    /** Template id from `data/section-shapes.ts`, e.g. `I-custom`, `hollow-rect`, `C-custom`. */
    shapeType: string;
    /** The parameters as entered, in the units that template declares (metres for lengths). */
    params: Record<string, number>;
  };
  /**
   * What this section is MADE OF, when it is an assembly of catalogue profiles.
   *
   * ── The defect this closes ────────────────────────────────────────
   *
   * The one industrial example in this repository carries its double angles as
   * `{ name: 'Col cord 2L75', shape: 'L', a: 0.00114 }` — the composition stated in the NAME
   * and nowhere a reader or a renderer can act on. The 3-D viewport therefore drew a
   * double-angle chord as a single fabricated I-beam, because with no `shape` it defaults to
   * one, and with `shape: 'L'` it would have drawn one angle where there are two.
   *
   * So the composition is data. It is DECLARATIVE and deliberately not geometry: nothing in
   * the properties path reads it, `a`/`iy`/`iz`/`j` on this section stay authoritative, and
   * `resolveCanonicalSection` continues to treat an assembly as properties-only. That
   * separation is load-bearing — a `shape` or a `polygon` on a compound section would make
   * the canonical resolver rebuild ONE part's outline and silently replace the assembly's
   * properties with it.
   *
   * Present on every generated section, `single` included, so a reader never has to infer
   * "one profile" from the absence of a record.
   */
  composition?: {
    /** Exact catalogue name of the part, e.g. `UPN 100`. */
    profileName: string;
    /** Arrangement id — see `engine/generators/built-up-section.ts`. */
    arrangement: string;
    /** Gap between the parts, mm. Zero for a single profile. */
    gapMm: number;
  };
  /**
   * Explicit canonical outline, in metres, section coordinates.
   *
   * When present this IS the section's geometry — it wins over `shape` and
   * over any catalogue lookup, and nothing is inferred from the name. Absent
   * means the geometry comes from `shape` plus dimensions, or the section is
   * properties-only. See `lib/section/canonical.ts`.
   */
  polygon?: Array<[number, number]>;
  /** Holes in `polygon`, same units and frame. */
  holes?: Array<Array<[number, number]>>;
  /**
   * Solver-ready canonical state, resolved at the edges (create, edit,
   * catalogue selection, migration, load) and read synchronously by
   * `buildSolverInput`.
   *
   * Resolving inside solver preparation would make that path async or risk
   * publishing unverified numbers, so it is cached here with a `digest` that
   * identifies the exact geometry it came from. See `lib/section/state.ts`.
   */
  canonical?: import('../section/state').SectionState;
}

/** Which relative translation a 2D sliding joint releases at an element end.
 *  - `x`: along local member axis (axis='local') or world X (axis='global').
 *  - `z`: perpendicular to the member (axis='local') or world Z (axis='global'). */
export type SlideKind = 'x' | 'z';
/** Frame the sliding direction is measured in. `local` follows the member, so
 *  inclined members slide along/perpendicular to their own axis. */
export type SlideAxisMode = 'global' | 'local';

/** Per-end release on a frame element.
 *  Rotational/torsional (the classic hinge):
 *  - `mz`: strong-axis bending release (the only rotation 2D models can release).
 *  - `my`: weak-axis bending release (3D only — has no DOF in 2D, ignored).
 *  - `t`:  torsion release (3D only — has no DOF in 2D, ignored).
 *  Translational (Basic 2D sliding joint):
 *  - `slide`: releases the chosen relative translation at this end while the
 *    perpendicular translation and rotation stay tied. The solver realizes this
 *    via a coincident helper node + equalDOF/linearMPC (see sliding-joints.ts);
 *    there is no element-level translational condensation. `undefined` = no slider.
 *  - `slideAxis`: `global` or `local` frame for `slide` (default `global`).
 *  Trusses ignore the moment flags; `slide` still applies. */
export interface Release {
  my: boolean;
  mz: boolean;
  t: boolean;
  slide?: SlideKind;
  slideAxis?: SlideAxisMode;
}

export const NO_RELEASE: Readonly<Release> = Object.freeze({ my: false, mz: false, t: false });

/** Basic 3D internal joint: per-element-end relative-DOF release mask.
 *  Six global DOFs in solver order [0]=dx [1]=dy [2]=dz [3]=θx [4]=θy [5]=θz;
 *  `true` = that relative DOF is RELEASED (free), `false` = tied between the
 *  member end and its joint node. This is an INTERNAL release (not a support to
 *  ground): the solver realizes it with a coincident helper node +
 *  eccentricConnection whose `releases` mask is exactly `dof` (see
 *  expand-joints-3d.ts). undefined / all-false = rigid connection. */
export interface Joint3D {
  dof: [boolean, boolean, boolean, boolean, boolean, boolean];
}

/** Convenient labels for the six relative DOFs of a 3D joint, in mask order. */
export const JOINT3D_DOF_LABELS = ['dx', 'dy', 'dz', 'θx', 'θy', 'θz'] as const;

/** True if a joint mask releases at least one DOF. */
export function jointHasRelease(j: Joint3D | undefined): boolean {
  return !!j && j.dof.some(Boolean);
}

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

export interface ProvidedReinforcement {
  // ─── Beam reinforcement (region-aware) ───
  regions?: BeamRegions;
  // ─── Beam reinforcement (legacy element-global, backward compatible) ───
  top?: RebarGroup;             // top bars (all support regions)
  bottom?: RebarGroup;          // bottom bars (span region)
  // ─── Column reinforcement (structured) ───
  column?: ColumnReinforcement;
  // ─── Column reinforcement (legacy grouped) ───
  longitudinal?: RebarGroup;    // total longitudinal bars
  // ─── Transverse reinforcement (beams and columns) ───
  stirrups?: StirrupDef;
}

export interface Element extends Element3DMetadata {
  id: number;
  type: 'frame' | 'truss';
  nodeI: number;
  nodeJ: number;
  materialId: number;
  sectionId: number;
  releaseI: Release;
  releaseJ: Release;
  // Basic 3D internal joints — per-end relative-DOF release masks (undefined = rigid).
  jointI?: Joint3D;
  jointJ?: Joint3D;
  // PRO: provided reinforcement for RC design verification
  reinforcement?: ProvidedReinforcement;
}

export type ReleaseEnd = 'i' | 'j';
/** Boolean rotational/torsional release axes (excludes the non-boolean slide fields). */
export type ReleaseAxis = 'my' | 'mz' | 't';

export type SupportType = 'fixed' | 'pinned' | 'rollerX' | 'rollerY' | 'rollerZ' | 'spring'
  | 'fixed3d' | 'pinned3d' | 'rollerXZ' | 'rollerXY' | 'rollerYZ' | 'spring3d'
  | 'custom3d';

export interface Support {
  id: number;
  nodeId: number;
  type: SupportType;
  kx?: number; // kN/m
  ky?: number; // kN/m
  kz?: number; // kN·m/rad (2D rotation spring / 3D rotation-Z spring)
  dx?: number; // prescribed ux (m)
  dz?: number; // prescribed uz (m)
  dry?: number; // prescribed rotation about Y (rad)
  dy?: number; // legacy alias for prescribed uz (m)
  drz?: number; // legacy alias for prescribed rotation about Y (rad)
  angle?: number;    // ángulo en grados (solo para rollers) — 0 = horizontal
  isGlobal?: boolean; // true = ejes globales (default), false = ejes locales
  // 3D-specific fields
  drx?: number;  // prescribed rotation about X (rad, 3D)
  krx?: number;  // kN·m/rad — torsional spring (3D)
  kry?: number;  // kN·m/rad — rotation about Y spring (3D)
  krz?: number;  // kN·m/rad — rotation about Z spring (3D)
  // Inclined support (3D): normal vector of constraint plane
  normalX?: number;
  normalY?: number;
  normalZ?: number;
  isInclined?: boolean;
  // Per-DOF 3D configuration (overrides 'type' for 3D solver when present)
  dofRestraints?: {
    tx: boolean; ty: boolean; tz: boolean;
    rx: boolean; ry: boolean; rz: boolean;
  };
  dofFrame?: 'global' | 'local';
  dofLocalElementId?: number;  // Element ID for local axis reference
}

export interface NodalLoad {
  id: number;
  nodeId: number;
  fx: number; // kN
  fz: number; // kN
  my: number; // kN·m
  fy?: number; // legacy alias
  mz?: number; // legacy alias
  caseId?: number; // load case ID (default: 1)
}

export interface DistributedLoad {
  id: number;
  elementId: number;
  qI: number; // kN/m at node I (or at position a if partial)
  qJ: number; // kN/m at node J (or at position b if partial)
  caseId?: number;
  angle?: number;     // degrees, rotation from base direction (default 0)
  isGlobal?: boolean; // false=local coords (default), true=global coords
  a?: number; // start position from node I (m). Default: 0 (full length)
  b?: number; // end position from node I (m). Default: L (full length)
}

export interface PointLoadOnElement {
  id: number;
  elementId: number;
  a: number; // distance from node I (m)
  p: number; // kN (perpendicular, local coords)
  px?: number; // kN (axial, local coords — positive = tension toward J)
  my?: number; // kN·m (moment at position a — positive = CCW)
  mz?: number; // legacy alias
  caseId?: number;
  angle?: number;     // degrees, rotation from base direction (default 0)
  isGlobal?: boolean; // false=local coords (default), true=global coords
}

export interface ThermalLoad {
  id: number;
  elementId: number;
  dtUniform: number;  // °C (uniform temperature change)
  dtGradient: number; // °C (temperature difference top-bottom)
  caseId?: number;
}

// ─── 3D Load Types ──────────────────────────────────────────────

export interface NodalLoad3D {
  id: number;
  nodeId: number;
  fx: number; fy: number; fz: number;  // kN (global)
  mx: number; my: number; mz: number;  // kN·m (global)
  caseId?: number;
}

export interface DistributedLoad3D {
  id: number;
  elementId: number;
  qYI: number; qYJ: number;  // kN/m in local Y at node I/J
  qZI: number; qZJ: number;  // kN/m in local Z at node I/J
  a?: number; b?: number;     // partial load positions (m from node I)
  caseId?: number;
}

export interface PointLoadOnElement3D {
  id: number;
  elementId: number;
  a: number;    // distance from node I (m)
  py: number;   // kN in local Y
  pz: number;   // kN in local Z
  caseId?: number;
}

export interface SurfaceLoad3D {
  id: number;
  quadId: number;
  q: number;    // kN/m² (positive = downward, applied as -Z global)
  caseId?: number;
}

export interface ThermalLoadQuad3D {
  id: number;
  quadId: number;
  dtUniform: number;  // °C uniform temperature change
  dtGradient: number; // °C gradient through thickness
  caseId?: number;
}

export type Load =
  | { type: 'nodal'; data: NodalLoad }
  | { type: 'distributed'; data: DistributedLoad }
  | { type: 'pointOnElement'; data: PointLoadOnElement }
  | { type: 'thermal'; data: ThermalLoad }
  | { type: 'nodal3d'; data: NodalLoad3D }
  | { type: 'distributed3d'; data: DistributedLoad3D }
  | { type: 'pointOnElement3d'; data: PointLoadOnElement3D }
  | { type: 'surface3d'; data: SurfaceLoad3D }
  | { type: 'thermalQuad3d'; data: ThermalLoadQuad3D };

export type LoadCaseType = string;

export interface LoadCase {
  id: number;
  type: LoadCaseType;
  name: string;
}

export interface LoadCombination {
  id: number;
  name: string;
  factors: Array<{ caseId: number; factor: number }>;
}

export interface Plate {
  id: number;
  nodes: [number, number, number];
  materialId: number;
  thickness: number;
  shellFamily?: import('../engine/types-3d').ShellFamily;
  /** Analytical mid-surface offset (eccentric). Solver-input only. */
  offset?: import('../model/element-3d-metadata').ShellOffset;
}

export interface Quad {
  id: number;
  nodes: [number, number, number, number];
  materialId: number;
  thickness: number;
  shellFamily?: import('../engine/types-3d').ShellFamily;
  /** Analytical mid-surface offset (eccentric). Solver-input only. */
  offset?: import('../model/element-3d-metadata').ShellOffset;
  /** Solve as a degenerated-continuum CURVED shell (captures curvature) rather
   *  than a flat MITC4. Serialized to the engine's curvedShells. */
  curved?: boolean;
}

export interface StructureModel {
  name: string;
  nodes: Map<number, Node>;
  materials: Map<number, Material>;
  sections: Map<number, Section>;
  elements: Map<number, Element>;
  supports: Map<number, Support>;
  loads: Load[];
  loadCases: LoadCase[];
  combinations: LoadCombination[];
  plates: Map<number, Plate>;
  quads: Map<number, Quad>;
  constraints: Constraint3D[];
  /** Joint/spring/bearing primitives between two nodes — mirrors Rust top-level
   *  `connectors: HashMap<String, ConnectorElement>`. Surfaced as joint-style
   *  entries inside the existing structural-control workflow (not a separate
   *  top-level "Connectors" object family). */
  connectors: Map<number, ConnectorElement>;
  /**
   * Isolated spread footings.
   *
   * A modelled entity rather than a run-time dialog value, because a foundation that
   * cannot be reopened, re-checked, revised and drawn is not a deliverable. See
   * `model/footing.ts` for why inferring one under every support was refused.
   */
  footings: Map<number, Footing>;
  /**
   * Project ground conditions, referenced by footings rather than copied into them.
   *
   * A bearing pressure is a property of a stratum shared by many footings; burying it in
   * each one is how two footings end up verified against different soils by accident.
   * Absent on models saved before foundations existed — `migrateGeotechnical` turns that
   * into an EMPTY set, never a seeded stratum.
   */
  geotechnical?: ProjectGeotechnical;
  /**
   * Bottom-mat design preferences shared by every footing on the project.
   *
   * Absent on models saved before PR18-A. `migrateFootingMatPreferences` turns that into
   * 16 mm / 16 mm / AUTO_CODE_COMPLIANT — the values the invisible store constant was already
   * applying to those projects — so reopening one reproduces its numbers instead of
   * redesigning it under a new default.
   */
  footingMatPreferences?: FootingMatPreferences;
  /** Where the model came from (e.g. CAD-derived draft) and review status.
   *  Absent for hand-built models. */
  provenance?: ModelProvenance;
  /** Local-axis convention this model is evaluated under. The current (and only)
   *  convention is 'zUpStrongAxis': local z = global up projected ⊥ the member
   *  axis, so gravity bends about local y (My) and the section depth resists it.
   *  Models saved before this metadata existed load WITHOUT it and are then
   *  evaluated under the corrected convention (no legacy mode) — see file.ts. */
  localAxisConvention?: 'zUpStrongAxis';
  /**
   * Jurisdiction, adopted regulation editions and concrete data.
   *
   * Lives on the model rather than in a side store so it travels through every
   * persistence path for free — .ded save/open, tab capture/restore, URL sharing and
   * autosave all go through snapshot()/restore(). A project that records which edition
   * it was designed to is not optional metadata: it is what makes a stored certificate
   * interpretable later.
   *
   * Absent on models saved before this existed; `migrateCodeSettings` turns that into
   * an explicit CIRSOC 201-2005 project rather than silently adopting the 2025 default.
   */
  codeSettings?: ProjectCodeSettings;
  /**
   * Code-neutral regulation stack: one adapter bound per role.
   *
   * Supersedes `codeSettings`, which was CIRSOC-specific. `codeSettings` is retained only
   * so an older saved project can still be read and migrated; nothing writes it.
   */
  regulations?: StoredRegulations;
  /** The revision vector every downstream result is stamped against. */
  revisions?: RevisionVector;
  /**
   * The joint designs the project carries — I-06.
   *
   * On the model for exactly the reason `codeSettings` and `regulations` are: `.ded` save/open,
   * undo/redo, tab capture and autosave all go through `snapshot()`/`restore()`, so a field that
   * lives here travels all four for free and a field that lives in a side store travels none of
   * them. `jointDesignStore` held these in a `$state` Map and in nothing else, so twenty
   * designed joints were lost on closing the tab.
   *
   * Only the CHOICES, never a computed capacity. Absent on projects saved before this existed,
   * which reads as «no joints were designed» — the true answer for them.
   */
  jointDesigns?: StoredJointDesigns;
  /**
   * Coordinated detailing assemblies.
   *
   * Persisted with the model for the same reason codeSettings is: a coordinated floor
   * that has to be regenerated on every open is not a deliverable, and the engineer's
   * review record has to survive a save/load cycle or it is not a record.
   */
  detailing?: DetailingStore;
  /**
   * Run detailing automatically after a successful design run. Default ON (undefined is
   * treated as on), so a user who verifies a floor gets its bars without a second command.
   * Persisted with the model because it is a project decision, not a browser preference.
   */
  detailingAuto?: boolean;
  /** Project-level opt-out from bent-up (cranked) bars. */
  detailingBentUpOptOut?: boolean;
}

export type { AnalysisResults };
export type { AnalysisResults3D };

// ─── Influence Line Types ───────────────────────────────────────

export type InfluenceQuantity = 'Rz' | 'Ry' | 'Rx' | 'My' | 'Mz' | 'V' | 'M';

export interface InfluenceLineResult {
  /** What quantity is being tracked */
  quantity: InfluenceQuantity;
  /** Target node for reactions, or target element+position for V/M */
  targetNodeId?: number;
  targetElementId?: number;
  targetPosition?: number; // 0..1 along target element
  /** Data points: loadPosition (global x along structure) → quantity value */
  points: Array<{ x: number; y: number; elementId: number; t: number; value: number }>;
}

function createModelStore() {
  const normalize2DSupportType = (type: SupportType): SupportType =>
    type === 'rollerY' ? 'rollerZ' : type;
  const canonicalSupportDz = (support: Partial<Support>): number | undefined => support.dz ?? support.dy;
  const canonicalSupportDry = (support: Partial<Support>): number | undefined => support.dry ?? support.drz;
  const canonicalLoadFz = (load: Partial<NodalLoad>): number => load.fz ?? load.fy ?? 0;
  const canonicalLoadMy = (load: Partial<NodalLoad>): number => load.my ?? load.mz ?? 0;
  const canonicalPointMoment = (load: Partial<PointLoadOnElement>): number | undefined => load.my ?? load.mz;

  let model = $state<StructureModel>({
    name: t('tabBar.newStructure'),
    nodes: new Map(),
    materials: new Map(),
    sections: new Map(),
    elements: new Map(),
    supports: new Map(),
    loads: [],
    loadCases: [
      { id: 1, type: 'D', name: 'Dead Load' },
      { id: 2, type: 'L', name: 'Live Load' },
      { id: 3, type: 'W', name: 'Wind' },
      { id: 4, type: 'E', name: 'Earthquake' },
    ],
    combinations: [
      { id: 1, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
      { id: 2, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] },
      { id: 3, name: '1.2D + L + 1.6W', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.6 }] },
      { id: 4, name: '1.2D + L + E', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 4, factor: 1.0 }] },
    ],
    plates: new Map(),
    quads: new Map(),
    constraints: [],
    connectors: new Map(),
    footings: new Map(),
    // A new project has no strata, not one invented stratum. See migrateGeotechnical.
    geotechnical: emptyGeotechnical(),
    // Unlike the strata, the mat convention DOES get a starting value, and it is a preference
    // rather than a result: Ø16 both ways, spacing derived from the code. It is visible and
    // editable in the Foundations panel, which is the whole difference from the module
    // constant it replaces.
    footingMatPreferences: defaultFootingMatPreferences(),
    localAxisConvention: 'zUpStrongAxis',
    codeSettings: defaultCodeSettings(),
    detailing: emptyDetailingStore(),
  });

  let lastKinematicResult = $state<KinematicResult | null>(null);
  let modelVersion = $state(0);

  /** DOF-name → index map for migrating pre-rename persisted constraints. */
  const LEGACY_DOF_NAME_TO_INDEX: Record<string, number> = { ux: 0, uy: 1, uz: 2, rx: 3, ry: 4, rz: 5 };

  /**
   * Read-migration for constraints persisted before the discriminator/DOF
   * rename ('equalDof'→'equalDOF', 'linearMpc'→'linearMPC', DOF name strings
   * → integer indices). Mirrors the hinge→release and iy/iz read-migrations:
   * the write path emits only the new shape, so old snapshots/share URLs and
   * autosaves are normalized here, at the single restore chokepoint.
   * Unknown constraint kinds are dropped rather than shipped to the solver
   * (Rust serde would reject the whole payload).
   */
  function migrateConstraint(raw: any): Constraint3D | null {
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') return null;
    const type = raw.type === 'equalDof' ? 'equalDOF'
      : raw.type === 'linearMpc' ? 'linearMPC'
      : raw.type;
    const mapDofs = (dofs: any): number[] | undefined => Array.isArray(dofs)
      ? dofs
          .map((d: any) => (typeof d === 'string' ? LEGACY_DOF_NAME_TO_INDEX[d] : d))
          .filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 5)
      : undefined;
    switch (type) {
      case 'rigidLink': {
        // `dofs` is OPTIONAL on a rigid link (absent = all translational DOFs), and Rust
        // spells that `#[serde(default)] dofs: Vec<usize>`. `#[serde(default)]` covers a
        // MISSING field, not a field that is present and holds a unit value — so writing
        // `dofs: undefined` here materialised an own property that made serde reject the
        // whole payload with `invalid type: unit value, expected a sequence`, aborting the
        // first load case of every restored project. Emit the key only when there is one.
        const dofs = mapDofs(raw.dofs);
        const out = { ...raw, type } as any;
        if (dofs) out.dofs = dofs; else delete out.dofs;
        return out;
      }
      case 'equalDOF':
        return { ...raw, type, dofs: mapDofs(raw.dofs) ?? [] };
      case 'linearMPC': {
        const terms = (raw.terms ?? []).map((t: any) => ({
          ...t,
          dof: typeof t.dof === 'string' ? LEGACY_DOF_NAME_TO_INDEX[t.dof] : t.dof,
        }));
        // An unmappable term DOF must drop the whole constraint — silently
        // rewriting it (e.g. to ux) would change the equation's meaning.
        if (terms.length === 0 || terms.some((t: any) => !Number.isInteger(t.dof) || t.dof < 0 || t.dof > 5)) {
          return null;
        }
        return { ...raw, type, terms };
      }
      case 'diaphragm':
      case 'eccentricConnection':
        return { ...raw, type };
      default:
        return null;
    }
  }

  /**
   * Create a remapped model view where node coordinates and loads are projected
   * into the 2D convention (x=horizontal, y=vertical) for the given plane.
   * The returned object is a shallow copy safe for passing to solver functions.
   */
  function remapModelForPlane(plane: DrawPlane): { nodes: Map<number, Node>; elements: typeof model.elements; supports: typeof model.supports; loads: typeof model.loads; materials: typeof model.materials; sections: typeof model.sections; connectors?: typeof model.connectors; constraints?: typeof model.constraints } | string {
    if (plane === 'xy') {
      return { nodes: model.nodes, elements: model.elements, supports: model.supports,
        loads: model.loads, materials: model.materials, sections: model.sections,
        connectors: model.connectors, constraints: model.constraints };
    }

    // Remap nodes into the selected 2D plane
    const remappedNodes = new Map<number, Node>();
    for (const [id, node] of model.nodes) {
      const p = to2D(plane, node.x, node.y, node.z ?? 0);
      remappedNodes.set(id, { ...node, x: p.x, y: p.y, z: undefined });
    }

    // Validate: check for zero-length elements after projection
    for (const elem of model.elements.values()) {
      const ni = remappedNodes.get(elem.nodeI);
      const nj = remappedNodes.get(elem.nodeJ);
      if (ni && nj) {
        const dx = nj.x - ni.x, dy = nj.y - ni.y;
        const L = Math.sqrt(dx * dx + dy * dy);
        if (L < 1e-8) {
          const planeLabel = plane.toUpperCase();
          return t('svc.planeCollapse')
            .replace('{elem}', String(elem.id))
            .replace('{plane}', planeLabel);
        }
      }
    }

    // Remap 3D supports to 2D equivalents
    const sup3dTo2d: Record<string, string> = {
      'fixed3d': 'fixed', 'pinned3d': 'pinned', 'spring3d': 'spring',
      'rollerXZ': 'rollerX', 'rollerXY': 'rollerX', 'rollerYZ': 'rollerX',
      'custom3d': 'pinned',
    };
    const remappedSupports = new Map<number, any>();
    for (const [id, sup] of model.supports) {
      const type2d = sup3dTo2d[sup.type] ?? sup.type;
      remappedSupports.set(id, { ...sup, type: type2d });
    }

    // Remap loads: nodal3d → nodal, distributed3d → distributed
    const remappedLoads = model.loads.map(l => {
      if (l.type === 'nodal') {
        const d = l.data as any;
        const f = remapNodalLoad2D(plane, d.fx ?? 0, d.fz ?? d.fy ?? 0, 0);
        const m = remapMoment2D(plane, 0, 0, d.my ?? d.mz ?? 0);
        return { ...l, data: { ...d, fx: f.fx, fz: f.fy, my: m } };
      }
      if (l.type === 'nodal3d') {
        const d = l.data as any;
        const f = remapNodalLoad2D(plane, d.fx ?? 0, d.fy ?? 0, d.fz ?? 0);
        const m = remapMoment2D(plane, d.mx ?? 0, d.my ?? 0, d.mz ?? 0);
        return { type: 'nodal' as const, data: { id: d.id, nodeId: d.nodeId, fx: f.fx, fz: f.fy, my: m, caseId: d.caseId } };
      }
      if (l.type === 'distributed3d') {
        // Map 3D distributed loads to 2D: use the component in the selected plane's vertical axis
        const d = l.data as any;
        let qI = 0, qJ = 0;
        if (plane === 'xz') { qI = d.qZI ?? 0; qJ = d.qZJ ?? 0; }
        else if (plane === 'yz') { qI = d.qZI ?? 0; qJ = d.qZJ ?? 0; }
        else { qI = d.qYI ?? 0; qJ = d.qYJ ?? 0; }
        return { type: 'distributed' as const, data: { id: d.id, elementId: d.elementId, qI, qJ, caseId: d.caseId } };
      }
      return l;
    });

    // Connectors are pure node-id + stiffness pairs — no geometry to remap.
    // Constraints are carried verbatim; the 2D wire layer (constraintsTo2D in
    // solver-service) maps their 3D DOF semantics onto the 2D solver's
    // [ux, uz, ry] convention.
    return { nodes: remappedNodes, elements: model.elements, supports: remappedSupports,
      loads: remappedLoads, materials: model.materials, sections: model.sections,
      connectors: model.connectors, constraints: model.constraints };
  }

  let nextId = $state({
    node: 1,
    material: 1,
    section: 1,
    element: 1,
    support: 1,
    load: 1,
    loadCase: 5,
    combination: 5,
    plate: 1,
    quad: 1,
    connector: 1,
    footing: 1,
    soilProfile: 1,
  });



  // Default material and section
  const defaultMaterial: Material = {
    id: 1,
    name: 'Acero A36',
    e: 200000,
    nu: 0.3,
    rho: 78.5,
    fy: 250,
  };

  const defaultSection: Section = {
    id: 1,
    name: 'IPN 300',
    a: 0.00690,           // 69.0 cm² → m²
    iy: 0.00009800,       // 9800 cm⁴ → m⁴ — about Y (horizontal)
    iz: 0.00000451,       // 451 cm⁴ → m⁴ — about Z (vertical)
    j: 0.0000004666,      // ≈46.7 cm⁴ → m⁴
    b: 0.125,             // 125 mm → m
    h: 0.300,             // 300 mm → m
    shape: 'I',
    tw: 0.0108,           // 10.8 mm → m
    tf: 0.0162,           // 16.2 mm → m
  };

  // Initialize with defaults
  model.materials.set(1, defaultMaterial);
  model.sections.set(1, defaultSection);
  nextId.material = 2;
  nextId.section = 2;

  // History integration — set externally to avoid circular import
  let _pushUndo: (() => void) | null = null;
  /** History push that does NOT bump modelVersion or fire the mutation hook.
   *  Used only by reinforcementTransaction (reinforcement does not affect forces). */
  let _pushUndoSilent: (() => void) | null = null;
  /** Foundation-channel history push. See `_setHistoryPush` and `restoreFoundationOnly`. */
  let _pushUndoFoundation: (() => void) | null = null;
  /** Called after a reinforcement transaction commits, with the written ids. */
  let _onReinforcementCommit: ((written: Set<number>) => void) | null = null;
  /**
   * Called when a footing or geotechnical input changes.
   *
   * Analysis-neutral, document-INVALIDATING. See `_setOnFoundationChange`.
   */
  let _onFoundationChange: (() => void) | null = null;
  let _undoBatching = false;
  // Results invalidation callback — set externally by store/index.ts to clear stale results
  let _onMutation: (() => void) | null = null;
  // Bulk mutation mode: during loadExample (and other wholesale mutations) we
  // want a single reactive commit instead of one per entity. Add/update methods
  // skip their per-call Map / array reassignment while this flag is true;
  // bulkMutate() reassigns everything once at the end.
  let _bulkMutating = false;
  let _bulkLoadBuffer: Load[] | null = null;
  let _bulkConstraintBuffer: Constraint3D[] | null = null;

  return {
    _setHistoryPush(fn: (kind: SnapshotKind) => void) {
      _pushUndo = () => { modelVersion++; _onMutation?.(); fn('structural'); };
      // Same history snapshot, WITHOUT the modelVersion bump and WITHOUT firing the
      // results-invalidation hook. Required for reinforcement transactions: a rebar
      // edit must be undoable, but it must not destroy the structural analysis.
      // Tagged 'reinforcement' so historyStore's undo()/redo() can restore it through
      // the silent, targeted-invalidation path (restoreReinforcementOnly) instead of
      // a full model restore that would wipe results.
      _pushUndoSilent = () => fn('reinforcement');
      // Foundations get their OWN channel for the same reason reinforcement does, but they
      // are a different slice of the model: a footing edit must be undoable without
      // destroying the solve, and restoring it must bring back the FOOTINGS and the ground,
      // which `restoreReinforcementOnly` does not touch. Tagging these 'reinforcement' —
      // which is what they did — pushed a snapshot that undo then restored through the
      // reinforcement path, so Ctrl+Z appeared to do nothing to a footing at all.
      _pushUndoFoundation = () => fn('foundation');
    },

    /** Register a callback to be called on every model mutation (used to clear stale results) */
    _setOnMutation(fn: () => void) { _onMutation = fn; },

    /** Register a callback fired after a reinforcement transaction commits, with the
     *  set of element ids written. Wired in store/index.ts so this store never
     *  imports verificationStore. */
    _setOnReinforcementCommit(fn: (written: Set<number>) => void) { _onReinforcementCommit = fn; },

    /**
     * Register a callback fired when a FOUNDATION input changes.
     *
     * ── The edge this closes ────────────────────────────────────────
     *
     * Footing and geotechnical edits are analysis-NEUTRAL and deliberately do not go through
     * `_pushUndo`: a footing carries a reaction, it does not change the stiffness that
     * produced one, and routing them through the mutation hook cleared the solve on every
     * edit — which left every footing reporting "no reaction" at design time.
     *
     * But they are NOT document-neutral. Widening a base, or changing the allowable bearing
     * pressure, invalidates the footing design and every drawing, schedule and report built
     * from it. That edge was declared in PR18 and never connected, so a project could edit a
     * footing and keep issuing the document that justified the old one.
     *
     * Injected rather than imported, like the two hooks above, so this store never imports
     * `detailingStore` — which imports this one.
     */
    _setOnFoundationChange(fn: () => void) { _onFoundationChange = fn; },

    /**
     * Run one undoable reinforcement transaction.
     *
     * Guarantees (each pinned by a store test):
     *   - exactly ONE history snapshot for the whole batch → one Ctrl+Z
     *   - exactly ONE `model.elements` reassignment → one reactive commit
     *   - NO `modelVersion` bump, NO `_onMutation` → analysis results survive
     *   - NO structural solve is triggered
     *
     * Elements are REPLACED (via `$state.snapshot` + deep clone) rather than mutated
     * in place. That also removes an aliasing hazard: `restore()` shallow-spreads
     * elements, so an in-place edit could previously corrupt an undo snapshot that
     * shared the same `reinforcement` object.
     */
    reinforcementTransaction(
      fn: (api: { setReinforcement(elemId: number, r: ProvidedReinforcement | undefined): void }) => void,
    ): Set<number> {
      const written = new Set<number>();
      const pending = new Map<number, ProvidedReinforcement | undefined>();
      fn({
        setReinforcement(elemId: number, r: ProvidedReinforcement | undefined) {
          if (!model.elements.has(elemId)) return;
          pending.set(elemId, r);
        },
      });
      if (pending.size === 0) return written;

      // One snapshot for the whole batch, taken BEFORE any write.
      _pushUndoSilent?.();

      for (const [elemId, r] of pending) {
        const elem = model.elements.get(elemId);
        if (!elem) continue;
        const plain = $state.snapshot(elem) as Element;
        plain.reinforcement = r
          ? (JSON.parse(JSON.stringify($state.snapshot(r))) as ProvidedReinforcement)
          : undefined;
        model.elements.set(elemId, plain);
        written.add(elemId);
      }
      // Single reactive commit (Svelte 5 Map reactivity: reassign the Map).
      model.elements = new Map(model.elements);
      _onReinforcementCommit?.(written);
      return written;
    },

    /**
     * Undo/redo counterpart to `reinforcementTransaction`: restore ONLY the
     * per-element `reinforcement` field from a snapshot known to differ from the
     * live model in nothing but reinforcement (historyStore uses this exclusively
     * for a history entry tagged 'reinforcement' — see `_setHistoryPush`).
     *
     * Leaves nodes, loads, supports and everything analysis-relevant untouched:
     * NO `modelVersion` bump, NO `_onMutation` call. A reinforcement edit does not
     * affect the structural analysis, so undoing/redoing one must not destroy it.
     *
     * Returns the set of element ids whose reinforcement actually changed, so the
     * caller can drop just those elements' cached provided-rebar verification via
     * the existing `_onReinforcementCommit` hook — the same targeted invalidation
     * `reinforcementTransaction` uses for a forward edit.
     */
    restoreReinforcementOnly(s: ModelSnapshot): Set<number> {
      const written = new Set<number>();
      const incoming = new Map(s.elements.map(([id, v]) => [id, v.reinforcement]));
      for (const [id, elem] of model.elements) {
        const nextReinf = incoming.get(id);
        const curKey = JSON.stringify(elem.reinforcement ?? null);
        const nextKey = JSON.stringify(nextReinf ?? null);
        if (curKey === nextKey) continue;
        model.elements.set(id, {
          ...elem,
          reinforcement: nextReinf ? (JSON.parse(JSON.stringify(nextReinf)) as ProvidedReinforcement) : undefined,
        });
        written.add(id);
      }
      if (written.size > 0) {
        model.elements = new Map(model.elements);
        _onReinforcementCommit?.(written);
      }
      return written;
    },

    /**
     * Restore ONLY the foundation slice — footings and the ground they bear on.
     *
     * The mirror of `restoreReinforcementOnly`, for the same reason and with the same
     * guarantees. A footing carries a reaction; it does not contribute stiffness. So undoing
     * a footing edit must not bump `modelVersion` or fire `_onMutation`, because that would
     * clear a valid solve and leave every footing reporting "no reaction" at design time —
     * the exact failure the forward-edit path was written to avoid.
     *
     * Restoring the whole snapshot would do precisely that, and restoring through the
     * reinforcement path (which is what a 'reinforcement'-tagged foundation entry did) does
     * not touch `footings` at all, so Ctrl+Z silently did nothing. This restores the two
     * collections that a foundation transaction can write, and nothing else.
     *
     * It DOES fire `_onFoundationChange`: undoing back to a narrower base invalidates the
     * documents built from the wider one exactly as widening it did. A restored footing is a
     * changed footing.
     */
    restoreFoundationOnly(s: ModelSnapshot): void {
      const nextFootings = new Map((s.footings ?? []).map(([id, f]) => [id, { ...f }]));
      const beforeFootings = JSON.stringify([...model.footings.entries()]);
      const afterFootings = JSON.stringify([...nextFootings.entries()]);
      const beforeGround = JSON.stringify(model.geotechnical ?? null);
      const afterGround = JSON.stringify(s.geotechnical ?? null);
      // The mat preferences travel on this channel too, because they are edited through it:
      // `setFootingMatPreferences` pushes a foundation entry, so leaving them out here would
      // make that edit the one foundation change Ctrl+Z does nothing to — the same defect
      // that tagging footing edits as 'reinforcement' produced for the footings themselves.
      const nextPrefs = migrateFootingMatPreferences(s.footingMatPreferences).preferences;
      const beforePrefs = JSON.stringify(model.footingMatPreferences ?? null);
      const afterPrefs = JSON.stringify(nextPrefs);
      if (beforeFootings === afterFootings && beforeGround === afterGround
        && beforePrefs === afterPrefs) return;

      model.footings = nextFootings;
      model.geotechnical = s.geotechnical
        ? (JSON.parse(JSON.stringify(s.geotechnical)) as typeof model.geotechnical)
        : undefined;
      model.footingMatPreferences = nextPrefs;
      _onFoundationChange?.();
    },

    /** Increment modelVersion to signal model changed (used by historyStore for direct mutations) */
    bumpModelVersion() { modelVersion++; _onMutation?.(); },

    /** Run multiple mutations as a single undo step */
    batch(fn: () => void): void {
      _pushUndo?.();
      _undoBatching = true;
      try { fn(); } finally { _undoBatching = false; }
    },

    /** Run a batch of structural mutations as a single reactive commit + undo step.
     *  Skips per-call Map/array reassignment; reassigns everything once at the end
     *  so the viewport syncs and `$effect`s re-run only once for the whole batch. */
    bulkMutate(fn: () => void): void {
      if (_bulkMutating) { fn(); return; }
      if (!_undoBatching) _pushUndo?.();
      const ownUndoBatch = !_undoBatching;
      if (ownUndoBatch) _undoBatching = true;
      _bulkMutating = true;
      _bulkLoadBuffer = [...model.loads];
      _bulkConstraintBuffer = [...model.constraints];
      try {
        fn();
      } finally {
        const commitLoads = _bulkLoadBuffer!;
        const commitConstraints = _bulkConstraintBuffer!;
        _bulkLoadBuffer = null;
        _bulkConstraintBuffer = null;
        _bulkMutating = false;
        if (ownUndoBatch) _undoBatching = false;
        // Single reactive commit — one bump, one scene sync pass
        model.nodes = new Map(model.nodes);
        model.elements = new Map(model.elements);
        model.supports = new Map(model.supports);
        model.materials = new Map(model.materials);
        model.sections = new Map(model.sections);
        model.plates = new Map(model.plates);
        model.quads = new Map(model.quads);
        model.loads = commitLoads;
        model.constraints = commitConstraints;
        modelVersion++;
        _onMutation?.();
      }
    },

    get modelVersion() { return modelVersion; },

    get model() { return model; },
    get nodes() { return model.nodes; },
    get elements() { return model.elements; },
    get supports() { return model.supports; },
    get loads() { return model.loads; },
    get materials() { return model.materials; },
    get sections() { return model.sections; },
    get loadCases() { return model.loadCases; },
    get combinations() { return model.combinations; },
    get plates() { return model.plates; },
    get quads() { return model.quads; },
    get constraints() { return model.constraints; },
    get connectors() { return model.connectors; },
    get footings() { return model.footings; },
    get geotechnical() { return model.geotechnical; },
    get kinematicResult() { return lastKinematicResult; },

    snapshot(): ModelSnapshot {
      // $state.snapshot() is the official Svelte 5 API to deeply unwrap reactive proxies
      // into plain JavaScript objects. This avoids all proxy-related serialization issues.
      const snap = $state.snapshot(model);
      const snapId = $state.snapshot(nextId);
      const result: ModelSnapshot = {
        name: snap.name,
        nodes: Array.from(snap.nodes.entries()) as ModelSnapshot['nodes'],
        materials: Array.from(snap.materials.entries()) as ModelSnapshot['materials'],
        // `canonical` is a DERIVED cache keyed by the section's own dimensions,
        // not model data. Keeping it out of snapshots keeps the undo stack and
        // the saved file small, makes save/open inherently idempotent, and
        // means a restored model always re-derives and re-verifies rather than
        // trusting whatever a file happened to contain. See section/migration.
        sections: Array.from(snap.sections.entries()).map(
          ([k, v]) => {
            const { canonical: _drop, ...rest } = v as Section;
            return [k, rest];
          },
        ) as ModelSnapshot['sections'],
        elements: Array.from(snap.elements.entries()).map(([k, v]) => [k, {
          ...v,
          releaseI: { ...(v.releaseI ?? NO_RELEASE) },
          releaseJ: { ...(v.releaseJ ?? NO_RELEASE) },
        }]) as ModelSnapshot['elements'],
        supports: Array.from(snap.supports.entries()).map(([k, v]) => [k, {
          ...v,
          type: normalize2DSupportType(v.type),
          dz: canonicalSupportDz(v),
          dry: canonicalSupportDry(v),
        }]) as ModelSnapshot['supports'],
        loads: snap.loads.map((load) => {
          if (load.type === 'nodal') {
            const data = load.data as NodalLoad;
            return { type: load.type, data: { ...data, fz: canonicalLoadFz(data), my: canonicalLoadMy(data) } };
          }
          if (load.type === 'pointOnElement') {
            const data = load.data as PointLoadOnElement;
            return { type: load.type, data: { ...data, my: canonicalPointMoment(data) } };
          }
          return load;
        }) as ModelSnapshot['loads'],
        loadCases: snap.loadCases as ModelSnapshot['loadCases'],
        combinations: snap.combinations as ModelSnapshot['combinations'],
        plates: Array.from(snap.plates.entries()) as ModelSnapshot['plates'],
        quads: Array.from(snap.quads.entries()) as ModelSnapshot['quads'],
        constraints: snap.constraints as ModelSnapshot['constraints'],
        connectors: Array.from(snap.connectors.entries()) as ModelSnapshot['connectors'],
        nextId: snapId as ModelSnapshot['nextId'],
        // Stamp the corrected local-axis convention on every snapshot/save so
        // models written from now on are self-describing.
        localAxisConvention: snap.localAxisConvention ?? 'zUpStrongAxis',
        codeSettings: snap.codeSettings
          ? (JSON.parse(JSON.stringify(snap.codeSettings)) as ProjectCodeSettings)
          : defaultCodeSettings(),
        detailing: snap.detailing
          ? (JSON.parse(JSON.stringify(snap.detailing)) as DetailingStore)
          : emptyDetailingStore(),
        // Both of these were declared on StructureModel AND on ModelSnapshot and
        // emitted by neither, so the regulation stack and the revision vector were
        // dropped by every path that goes through snapshot(): .ded save, undo/redo,
        // tab capture and autosave. A project silently reverted to the default
        // regulations on open, and a stored certificate's stamp became
        // uninterpretable because the vector it was compared against was gone.
        regulations: snap.regulations
          ? (JSON.parse(JSON.stringify(snap.regulations)) as StoredRegulations)
          : undefined,
        revisions: snap.revisions ? { ...snap.revisions } : undefined,
        /*
         * Cloned deeply, because `choices.bolts` and `choices.battens` are nested objects: a
         * shallow copy would leave the saved project sharing them with the live model, so
         * editing a batten gap would rewrite the undo entry meant to go back before it.
         *
         * Absent stays absent, like `regulations` above — `restore(snapshot())` has to be a
         * no-op, and materialising an empty container here would make a cancelled CAD draft
         * differ from its own starting point.
         */
        jointDesigns: snap.jointDesigns
          ? cloneStoredJointDesigns(snap.jointDesigns as StoredJointDesigns)
          : undefined,
        // Cloned one level deeper than the other Map families because `pedestal` is a
        // nested object: a shallow `{ ...v }` would share it between the snapshot and the
        // live model, so editing a pedestal would silently rewrite the undo entry.
        footings: Array.from(snap.footings.entries()).map(
          ([k, v]): [number, Footing] => [
            k,
            { ...v, ...(v.pedestal ? { pedestal: { ...v.pedestal } } : {}) },
          ],
        ),
        // Emitted even when absent, like `codeSettings` and `detailing` above: a container
        // the UI binds to and mutates is far easier to reason about when it always exists,
        // and emitting the empty form keeps `restore(snapshot())` a no-op.
        geotechnical: snap.geotechnical
          ? (JSON.parse(JSON.stringify(snap.geotechnical)) as ProjectGeotechnical)
          : emptyGeotechnical(),
        // Emitted always, for the same reason as `geotechnical` above: `restore(snapshot())`
        // has to be a no-op, and a preference that vanished on save would take the project
        // back to the default mat on every open.
        footingMatPreferences: { ...(snap.footingMatPreferences ?? defaultFootingMatPreferences()) },
      };
      if (snap.provenance) {
        result.provenance = {
          ...snap.provenance,
          assumptions: [...snap.provenance.assumptions],
          layerMappings: snap.provenance.layerMappings.map((m) => ({ ...m })),
        };
      }
      return result;
    },

    restore(rawSnapshot: ModelSnapshot): void {
      // ── Why the incoming snapshot is unwrapped before anything reads it ──────────
      //
      // Every family below is copied ONE level deep (`{ ...v }`), which is enough to stop the
      // restored model from aliasing the snapshot's top-level records but NOT enough to stop
      // it from aliasing their nested arrays and objects — `quad.nodes`, `diaphragm.slaveNodes`,
      // `element.reinforcement`, a load's `data`.
      //
      // That aliasing is normally invisible. It stops being invisible the moment a caller holds
      // the snapshot in reactive state, which two of them do: the autosave banner keeps the
      // parsed project in `$state`, and the tab manager keeps every tab's captured state there.
      // Svelte then hands back a deep PROXY of that snapshot, the shallow copies adopt those
      // proxies into the live model, and the proxies travel all the way to
      // `worker.postMessage`, where structured clone refuses an exotic object outright:
      // `DataCloneError: [object Array] could not be cloned`. Restoring a project and pressing
      // Calcular died there, and the sequential fallback then died on the same data for an
      // unrelated reason, so the user saw two errors and no results.
      //
      // Copying once, here, is what makes "the model holds plain data it owns" true for every
      // family at once, rather than for whichever families someone remembered to clone deeply.
      // `plainDeepCopy` rather than `$state.snapshot`: compiled for the server the rune is the
      // identity function, so the guarantee would hold in the browser and evaporate under the
      // test suite — which is where it has to be provable.
      const s = plainDeepCopy(rawSnapshot);
      modelVersion++;
      _onMutation?.();
      if (s.name) model.name = s.name;
      model.nodes = new Map(s.nodes.map(([k, v]) => [k, { ...v }]));
      model.materials = new Map(s.materials.map(([k, v]) => [k, { ...v }]));
      // Canonical section state is re-derived from each section's own
      // dimensions rather than trusted as stored: a saved digest is a claim to
      // be checked, and solver preparation reads these values synchronously,
      // so a stale one would become wrong numbers with no later chance to
      // notice. `restoreSections` also deep-copies, so a restored model never
      // shares polygon arrays with the snapshot it came from.
      model.sections = restoreCanonicalSections(
        new Map(s.sections.map(([k, v]) => [k, { ...v } as Section])),
      );
      model.elements = new Map(s.elements.map(([k, v]) => [k, {
        ...v,
        releaseI: { ...(v.releaseI ?? NO_RELEASE) },
        releaseJ: { ...(v.releaseJ ?? NO_RELEASE) },
      }]));
      // Deduplicate supports: keep only the last support per node (legacy cleanup)
      const supEntries = s.supports.map(([k, v]) => [k, {
        ...v,
        type: normalize2DSupportType(v.type as SupportType),
        dz: canonicalSupportDz(v),
        dry: canonicalSupportDry(v),
      }] as [number, Support]);
      const seenNodes = new Set<number>();
      const dedupedEntries: [number, Support][] = [];
      for (let i = supEntries.length - 1; i >= 0; i--) {
        const [k, v] = supEntries[i];
        if (!seenNodes.has(v.nodeId)) {
          seenNodes.add(v.nodeId);
          dedupedEntries.push([k, v]);
        }
      }
      dedupedEntries.reverse();
      model.supports = new Map(dedupedEntries);
      // Deep-copy loads manually (structuredClone fails on Svelte reactive proxies)
      model.loads = s.loads.map((l) => {
        if (l.type === 'nodal') {
          const data = l.data as Partial<NodalLoad>;
          return { type: l.type, data: { ...data, fz: canonicalLoadFz(data), my: canonicalLoadMy(data) } };
        }
        if (l.type === 'pointOnElement') {
          const data = l.data as Partial<PointLoadOnElement>;
          return { type: l.type, data: { ...data, my: canonicalPointMoment(data) } };
        }
        return { type: l.type, data: { ...l.data } };
      }) as unknown as Load[];
      // Migrate old distributed loads: q → qI/qJ
      for (const l of model.loads) {
        if (l.type === 'distributed') {
          const d = l.data as any;
          if (d.q !== undefined && d.qI === undefined) {
            d.qI = d.q;
            d.qJ = d.q;
            delete d.q;
          }
        }
      }
      model.loadCases = s.loadCases
        ? s.loadCases.map(c => ({ type: (c as any).type ?? inferLoadCaseType(c.name), ...c }))
        : [{ id: 1, type: 'D' as LoadCaseType, name: 'Dead Load' }, { id: 2, type: 'L' as LoadCaseType, name: 'Live Load' }, { id: 3, type: 'W' as LoadCaseType, name: 'Wind' }, { id: 4, type: 'E' as LoadCaseType, name: 'Earthquake' }];
      model.combinations = s.combinations
        ? s.combinations.map(c => ({ ...c, factors: c.factors.map(f => ({ ...f })) }))
        : [];
      model.plates = s.plates ? new Map(s.plates.map(([k, v]) => [k, { ...v }] as [number, Plate])) : new Map();
      model.quads = s.quads ? new Map(s.quads.map(([k, v]) => [k, { ...v }] as [number, Quad])) : new Map();
      model.constraints = (s as any).constraints
        ? ((s as any).constraints as any[])
            .map(migrateConstraint)
            .filter((c): c is Constraint3D => c !== null)
        : [];
      model.connectors = (s as any).connectors
        ? new Map((s as any).connectors.map(([k, v]: [number, ConnectorElement]) => [k, { ...v }] as [number, ConnectorElement]))
        : new Map();
      nextId.node = s.nextId.node;
      nextId.material = s.nextId.material;
      nextId.section = s.nextId.section;
      nextId.element = s.nextId.element;
      nextId.support = s.nextId.support;
      nextId.load = s.nextId.load;
      nextId.loadCase = s.nextId.loadCase ?? 3;
      nextId.combination = s.nextId.combination ?? 1;
      nextId.plate = s.nextId.plate ?? 1;
      nextId.quad = s.nextId.quad ?? 1;
      nextId.connector = (s.nextId as any).connector ?? 1;
      // `?? []` guards: a hand-edited/older/partial `.ded` may carry a
      // `provenance` object without `assumptions`/`layerMappings`. restore()
      // runs after the model is already mutated and is not wrapped in a
      // rollback, so an unguarded `[...undefined]` / `.map` would throw mid-load
      // and leave a half-loaded model instead of degrading gracefully.
      model.provenance = s.provenance
        ? {
            ...s.provenance,
            assumptions: [...(s.provenance.assumptions ?? [])],
            layerMappings: (s.provenance.layerMappings ?? []).map((m) => ({ ...m })),
          }
        : undefined;
      // No legacy mode: a model loaded without convention metadata is evaluated
      // under the corrected convention (the only one). The "old model" note is
      // surfaced at the .ded boundary (file.ts), not here.
      model.localAxisConvention = s.localAxisConvention ?? 'zUpStrongAxis';
      // Migration is deliberate, not a fallback: a project with no settings is stamped
      // CIRSOC 201-2005, the edition its stored results were actually checked against.
      model.codeSettings = migrateCodeSettings(s.codeSettings).settings;
      model.detailing = migrateDetailingStore(s.detailing).store;
      // `migrateRegulations` was written, unit-tested and never called from anywhere in
      // production. Calling it here is what makes a stored regulation stack survive a
      // save/open, an undo and a tab switch, and what upgrades a v1 (CIRSOC-specific)
      // payload instead of misreading it.
      //
      // An ABSENT stack is left absent rather than materialised into the default. That is
      // not a detail: `snapshot()`/`restore()` has to be idempotent, because Cancel on a
      // CAD draft is implemented as "restore the snapshot taken before Apply" and is
      // asserted to undo EXACTLY. Materialising defaults here made a cancelled draft differ
      // from its own starting point by a whole regulation stack. Absent already means
      // "derive the defaults" everywhere that reads it, so nothing is lost by respecting it.
      //
      // Its `rescuedAggregateMm` is deliberately dropped: the v1 aggregate size is already
      // recovered by `migrateCodeSettings` above, which reads the same
      // `concrete.maxAggregateSizeMm` field into its own home on `codeSettings`. Taking it
      // twice would not place it anywhere new. Its `notices` are dropped for the same
      // reason `migrateCodeSettings`'s are — migration notes are surfaced at the .ded
      // boundary in file.ts, not from inside a restore that undo/redo also drives.
      model.regulations = s.regulations === undefined
        ? undefined
        : migrateRegulations(s.regulations).stored;
      // The revision vector is restored as stored. It is NOT reset to `emptyRevisions()`:
      // the whole point of a stamp is that it is compared against the vector the project
      // actually carries, so zeroing it on open would make every stored certificate look
      // freshly current.
      model.revisions = s.revisions ? { ...s.revisions } : undefined;
      /*
       * The joint designs, restored as stored — and this line is the whole of I-07.
       *
       * Loading another model REPLACES the field instead of merging into it, so a second model
       * in the same session cannot inherit the first one's joints: a snapshot without the field
       * lands as `undefined`, which the store reads as no joints at all. That is why nothing has
       * to remember to call `reset()`; replacing the project IS the reset.
       *
       * The stored joints are not filtered here. They are matched against the live nodes and
       * elements on every read — see `reconcileJointDesigns` — because a node deleted after the
       * project opened has to make its joint obsolete too, and a load-time pass would have
       * already run.
       */
      model.jointDesigns = s.jointDesigns
        ? cloneStoredJointDesigns(s.jointDesigns)
        : undefined;
      // Footings and the ground they bear on. `migrateFootings` drops a footing whose
      // stored node reference is not a number rather than repairing it — a footing
      // attached to nothing has no reaction, and inventing a node moves someone's
      // foundation. An absent geotechnical set becomes EMPTY, never a seeded stratum.
      model.footings = migrateFootings(s.footings, { cover: DEFAULT_COVER }).footings;
      model.geotechnical = migrateGeotechnical(s.geotechnical).geotechnical;
      // An absent field is a project saved before mat preferences existed, and it loads at the
      // 16/16/AUTO values the invisible constant was already applying to it. `undefined` is
      // therefore NOT preserved here: there is no "no preference" state for a mat whose
      // diameter every footing check in the project already depends on.
      model.footingMatPreferences =
        migrateFootingMatPreferences(s.footingMatPreferences).preferences;
      nextId.footing = s.nextId.footing
        ?? (Math.max(0, ...model.footings.keys()) + 1);
      nextId.soilProfile = s.nextId.soilProfile
        ?? (Math.max(0, ...(model.geotechnical?.profiles ?? []).map((p) => p.id)) + 1);
    },

    /** Explicit user action: clear the CAD-draft "unreviewed" tag. */
    markProvenanceReviewed(): void {
      if (!model.provenance) return;
      if (!_undoBatching) _pushUndo?.();
      model.provenance = { ...model.provenance, status: 'reviewed' as ModelProvenance['status'] };
    },

    addNode(x: number, y: number, z?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.node++;
      const node: Node = { id, x, y };
      if (z !== undefined && z !== 0) node.z = z;
      model.nodes.set(id, node);
      if (!_bulkMutating) model.nodes = new Map(model.nodes);
      if (!_undoBatching) {
        if (uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro') {
          uiStore.useNative3DPresentation();
        }
      }
      return id;
    },

    updateNodeZ(id: number, z: number): void {
      const node = model.nodes.get(id);
      if (node) {
        if (!_undoBatching) _pushUndo?.();
        model.nodes.set(id, { ...node, z });
        model.nodes = new Map(model.nodes);
      }
    },

    addElement(nodeI: number, nodeJ: number, type: 'frame' | 'truss' = 'frame'): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.element++;
      model.elements.set(id, {
        id,
        type,
        nodeI,
        nodeJ,
        materialId: 1,
        sectionId: 1,
        releaseI: { ...NO_RELEASE },
        releaseJ: { ...NO_RELEASE },
      });
      if (!_bulkMutating) model.elements = new Map(model.elements);
      return id;
    },

    addSupport(nodeId: number, type: SupportType, springs?: { kx?: number; ky?: number; kz?: number; krx?: number; kry?: number; krz?: number }, opts?: { angle?: number; isGlobal?: boolean; dx?: number; dy?: number; dz?: number; drx?: number; dry?: number; drz?: number; dofRestraints?: { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean }; dofFrame?: 'global' | 'local'; dofLocalElementId?: number }): number {
      if (!_undoBatching) _pushUndo?.();
      // Remove existing support on this node (only one support per node allowed)
      for (const [existingId, existingSup] of model.supports) {
        if (existingSup.nodeId === nodeId) {
          model.supports.delete(existingId);
          break;
        }
      }
      const id = nextId.support++;
      const sup: Support = { id, nodeId, type: normalize2DSupportType(type) };
      if (springs) {
        if (springs.kx !== undefined) sup.kx = springs.kx;
        if (springs.ky !== undefined) sup.ky = springs.ky;
        if (springs.kz !== undefined) sup.kz = springs.kz;
        if (springs.krx !== undefined) sup.krx = springs.krx;
        if (springs.kry !== undefined) sup.kry = springs.kry;
        if (springs.krz !== undefined) sup.krz = springs.krz;
      }
      if (opts?.angle !== undefined && opts.angle !== 0) sup.angle = opts.angle;
      if (opts?.isGlobal !== undefined) sup.isGlobal = opts.isGlobal;
      // Prescribed displacements
      if (opts?.dx !== undefined && opts.dx !== 0) sup.dx = opts.dx;
      const supportDz = opts?.dz ?? opts?.dy;
      if (supportDz !== undefined && supportDz !== 0) sup.dz = supportDz;
      if (opts?.drx !== undefined && opts.drx !== 0) sup.drx = opts.drx;
      const supportDry = opts?.dry ?? opts?.drz;
      if (supportDry !== undefined && supportDry !== 0) sup.dry = supportDry;
      // Per-DOF 3D configuration
      if (opts?.dofRestraints) sup.dofRestraints = opts.dofRestraints;
      if (opts?.dofFrame) sup.dofFrame = opts.dofFrame;
      if (opts?.dofLocalElementId !== undefined) sup.dofLocalElementId = opts.dofLocalElementId;
      model.supports.set(id, sup);
      if (!_bulkMutating) model.supports = new Map(model.supports);
      return id;
    },

    addNodalLoad(nodeId: number, fx: number, fz: number, my: number = 0, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: NodalLoad = { id, nodeId, fx, fz, my };
      if (caseId !== undefined) data.caseId = caseId;
      const entry = { type: 'nodal' as const, data };
      if (_bulkLoadBuffer) _bulkLoadBuffer.push(entry);
      else model.loads = [...model.loads, entry];
      return id;
    },

    addDistributedLoad(elementId: number, qI: number, qJ?: number, angle?: number, isGlobal?: boolean, caseId?: number, a?: number, b?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: DistributedLoad = { id, elementId, qI, qJ: qJ ?? qI };
      if (angle !== undefined && angle !== 0) data.angle = angle;
      if (isGlobal) data.isGlobal = true;
      if (caseId !== undefined) data.caseId = caseId;
      if (a !== undefined && a > 0) data.a = a;
      if (b !== undefined) data.b = b;
      const entry = { type: 'distributed' as const, data };
      if (_bulkLoadBuffer) _bulkLoadBuffer.push(entry);
      else model.loads = [...model.loads, entry];
      return id;
    },

    addPointLoadOnElement(elementId: number, a: number, p: number, opts?: { px?: number; my?: number; mz?: number; angle?: number; isGlobal?: boolean; caseId?: number }): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: PointLoadOnElement = { id, elementId, a, p };
      if (opts?.px !== undefined && opts.px !== 0) data.px = opts.px;
      const pointMy = opts?.my ?? opts?.mz;
      if (pointMy !== undefined && pointMy !== 0) data.my = pointMy;
      if (opts?.angle !== undefined && opts.angle !== 0) data.angle = opts.angle;
      if (opts?.isGlobal) data.isGlobal = true;
      if (opts?.caseId !== undefined) data.caseId = opts.caseId;
      const entry = { type: 'pointOnElement' as const, data };
      if (_bulkLoadBuffer) _bulkLoadBuffer.push(entry);
      else model.loads = [...model.loads, entry];
      return id;
    },

    addThermalLoad(elementId: number, dtUniform: number, dtGradient: number = 0, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: ThermalLoad = { id, elementId, dtUniform, dtGradient };
      if (caseId !== undefined) data.caseId = caseId;
      const entry = { type: 'thermal' as const, data };
      if (_bulkLoadBuffer) _bulkLoadBuffer.push(entry);
      else model.loads = [...model.loads, entry];
      return id;
    },

    // ─── 3D Load CRUD ─────────────────────────────────────────────

    addNodalLoad3D(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: NodalLoad3D = { id, nodeId, fx, fy, fz, mx, my, mz };
      if (caseId !== undefined) data.caseId = caseId;
      const entry = { type: 'nodal3d' as const, data };
      if (_bulkLoadBuffer) _bulkLoadBuffer.push(entry);
      else model.loads = [...model.loads, entry];
      return id;
    },

    addDistributedLoad3D(elementId: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: DistributedLoad3D = { id, elementId, qYI, qYJ, qZI, qZJ };
      if (a !== undefined && a > 0) data.a = a;
      if (b !== undefined) data.b = b;
      if (caseId !== undefined) data.caseId = caseId;
      const entry = { type: 'distributed3d' as const, data };
      if (_bulkLoadBuffer) _bulkLoadBuffer.push(entry);
      else model.loads = [...model.loads, entry];
      return id;
    },

    addPointLoadOnElement3D(elementId: number, a: number, py: number, pz: number, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: PointLoadOnElement3D = { id, elementId, a, py, pz };
      if (caseId !== undefined) data.caseId = caseId;
      const entry = { type: 'pointOnElement3d' as const, data };
      if (_bulkLoadBuffer) _bulkLoadBuffer.push(entry);
      else model.loads = [...model.loads, entry];
      return id;
    },

    addSurfaceLoad3D(quadId: number, q: number, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: SurfaceLoad3D = { id, quadId, q };
      if (caseId !== undefined) data.caseId = caseId;
      const entry = { type: 'surface3d' as const, data };
      if (_bulkLoadBuffer) _bulkLoadBuffer.push(entry);
      else model.loads = [...model.loads, entry];
      return id;
    },

    addThermalLoadQuad3D(quadId: number, dtUniform: number, dtGradient: number = 0, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: ThermalLoadQuad3D = { id, quadId, dtUniform, dtGradient };
      if (caseId !== undefined) data.caseId = caseId;
      const entry = { type: 'thermalQuad3d' as const, data };
      if (_bulkLoadBuffer) _bulkLoadBuffer.push(entry);
      else model.loads = [...model.loads, entry];
      return id;
    },

    removeNode(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.nodes.delete(id);
      model.nodes = new Map(model.nodes);
      for (const [elemId, elem] of model.elements) {
        if (elem.nodeI === id || elem.nodeJ === id) {
          model.elements.delete(elemId);
        }
      }
      model.elements = new Map(model.elements);
      for (const [supId, sup] of model.supports) {
        if (sup.nodeId === id) {
          model.supports.delete(supId);
        }
      }
      model.supports = new Map(model.supports);
      const keepLoad = (l: Load) =>
        !((l.type === 'nodal' || l.type === 'nodal3d') && l.data.nodeId === id);
      model.loads = model.loads.filter(keepLoad);
      if (_bulkLoadBuffer) _bulkLoadBuffer = _bulkLoadBuffer.filter(keepLoad);
      // Cascade to connectors/constraints: a dangling node reference is worse
      // than a missing entity — the engine silently skips it (zero stiffness)
      // while the connectivity preflight keeps crediting it as an edge.
      let connectorsChanged = false;
      for (const [connId, conn] of model.connectors) {
        if (conn.nodeI === id || conn.nodeJ === id) {
          model.connectors.delete(connId);
          connectorsChanged = true;
        }
      }
      if (connectorsChanged) model.connectors = new Map(model.connectors);
      // A footing exists to carry ONE node's reaction. Delete the node and the footing has
      // no load, no punching perimeter and no position — it is not a footing any more, and
      // keeping it would leave a dimensioned foundation in the schedule and on the plan
      // under a column that is gone.
      let footingsChanged = false;
      for (const [fid, f] of model.footings) {
        if (f.nodeId !== id) continue;
        model.footings.delete(fid);
        footingsChanged = true;
      }
      if (footingsChanged) model.footings = new Map(model.footings);
      const pruneConstraints = (arr: Constraint3D[]) => arr
        .map((c): Constraint3D | null => {
          if (c.type === 'diaphragm') {
            if (c.masterNode === id) return null;
            const slaves = c.slaveNodes.filter(n => n !== id);
            if (slaves.length === 0) return null;
            return slaves.length === c.slaveNodes.length ? c : { ...c, slaveNodes: slaves };
          }
          if (c.type === 'linearMPC') {
            // Removing one term changes the equation's meaning — drop it whole.
            return c.terms.some(t => t.nodeId === id) ? null : c;
          }
          // rigidLink / equalDOF / eccentricConnection: master + single slave
          return (c.masterNode === id || c.slaveNode === id) ? null : c;
        })
        .filter((c): c is Constraint3D => c !== null);
      model.constraints = pruneConstraints(model.constraints);
      // Inside bulkMutate the commit phase overwrites model.constraints with
      // the buffer — prune the buffer too or dangling constraints resurrect.
      if (_bulkConstraintBuffer) _bulkConstraintBuffer = pruneConstraints(_bulkConstraintBuffer);
    },

    removeElement(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.elements.delete(id);
      model.elements = new Map(model.elements);
      model.loads = model.loads.filter(l =>
        !((l.type === 'distributed' || l.type === 'pointOnElement' || l.type === 'thermal'
          || l.type === 'distributed3d' || l.type === 'pointOnElement3d') &&
          (l.data as any).elementId === id)
      );
      // A footing SURVIVES the loss of its column: its node, its dimensions and its soil
      // are all still there, and its bearing and thickness are still checkable. What it
      // loses is the punching perimeter and the dowel geometry, so the reference is cleared
      // and the footing reports those as unsupported rather than holding a dangling id that
      // would later resolve to whatever element reuses the number.
      let columnCleared = false;
      const fm = new Map(model.footings);
      for (const [fid, f] of fm) {
        if (f.columnElementId !== id) continue;
        const { columnElementId: _dropped, ...rest } = f;
        fm.set(fid, { ...rest, revision: f.revision + 1 });
        columnCleared = true;
      }
      if (columnCleared) model.footings = fm;
    },

    /**
     * Delete a selection given as EXPLICIT per-kind id lists. Frame elements,
     * plates and quads have independent id spaces (each counts from 1), so a
     * deletion driven by a single conflated id set can reinterpret a node-
     * cascade-deleted frame id as a same-numbered shell and wrongly delete it.
     * Taking explicit kinds makes that impossible: a shell is removed only if
     * it was selected AS a shell. Nodes are removed first (cascading to their
     * frame elements/supports/nodal loads); a shell is NEVER removed by a node
     * deletion.
     */
    deleteEntities(sel: { nodes?: number[]; elements?: number[]; plates?: number[]; quads?: number[] }): void {
      const run = () => {
        for (const nid of sel.nodes ?? []) this.removeNode(nid);
        for (const eid of sel.elements ?? []) if (model.elements.has(eid)) this.removeElement(eid);
        for (const pid of sel.plates ?? []) if (model.plates.has(pid)) this.removePlate(pid);
        for (const qid of sel.quads ?? []) if (model.quads.has(qid)) this.removeQuad(qid);
      };
      if (_undoBatching) { run(); return; }
      this.batch(run); // batch() pushes a single undo step
    },

    addPlate(nodes: [number, number, number], materialId: number, thickness: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.plate++;
      model.plates.set(id, { id, nodes, materialId, thickness });
      if (!_bulkMutating) model.plates = new Map(model.plates);
      return id;
    },

    removePlate(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.plates.delete(id);
      model.plates = new Map(model.plates);
    },

    updatePlate(id: number, data: Partial<{ materialId: number; thickness: number }>): void {
      if (!_undoBatching) _pushUndo?.();
      const plate = model.plates.get(id);
      if (!plate) return;
      if (data.materialId !== undefined) plate.materialId = data.materialId;
      if (data.thickness !== undefined) plate.thickness = data.thickness;
      model.plates = new Map(model.plates);
    },

    addQuad(nodes: [number, number, number, number], materialId: number, thickness: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.quad++;
      model.quads.set(id, { id, nodes, materialId, thickness });
      if (!_bulkMutating) model.quads = new Map(model.quads);
      return id;
    },

    removeQuad(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.quads.delete(id);
      model.quads = new Map(model.quads);
      // Cascade to surface/thermal loads on this quad — otherwise the load
      // dangles (still in the loads table, .ded and URL share) and is silently
      // dropped at solve time (convertSurfaceLoad: `if (!quad) return out`).
      const keepLoad = (l: Load) =>
        !((l.type === 'surface3d' || l.type === 'thermalQuad3d') && l.data.quadId === id);
      model.loads = model.loads.filter(keepLoad);
      if (_bulkLoadBuffer) _bulkLoadBuffer = _bulkLoadBuffer.filter(keepLoad);
    },

    updateQuad(id: number, data: Partial<{ materialId: number; thickness: number }>): void {
      if (!_undoBatching) _pushUndo?.();
      const quad = model.quads.get(id);
      if (!quad) return;
      if (data.materialId !== undefined) quad.materialId = data.materialId;
      if (data.thickness !== undefined) quad.thickness = data.thickness;
      model.quads = new Map(model.quads);
    },

    /** Set/clear a shell's analytical mid-surface offset. `kind` selects the
     *  plate or quad map; pass `undefined` to clear. */
    setShellOffset(kind: 'plate' | 'quad', id: number, offset: import('../model/element-3d-metadata').ShellOffset | undefined): void {
      if (!_undoBatching) _pushUndo?.();
      const map = kind === 'plate' ? model.plates : model.quads;
      const shell = map.get(id);
      if (!shell) return;
      if (offset) shell.offset = offset; else delete shell.offset;
      if (kind === 'plate') model.plates = new Map(model.plates);
      else model.quads = new Map(model.quads);
    },

    addConstraint(c: Constraint3D): void {
      if (!_undoBatching) _pushUndo?.();
      if (_bulkConstraintBuffer) _bulkConstraintBuffer.push({ ...c });
      else model.constraints = [...model.constraints, { ...c }];
    },

    removeConstraint(index: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.constraints = model.constraints.filter((_, i) => i !== index);
    },

    clearConstraints(): void {
      if (!_undoBatching) _pushUndo?.();
      model.constraints = [];
    },

    // ─── Connector CRUD (joint/spring/bearing primitives) ───
    // Map reassignment on every mutation per Svelte 5 reactivity guidance
    // (see web/CLAUDE.md "Reactivity with Maps").
    addConnector(data: Omit<ConnectorElement, 'id'>): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.connector++;
      const m = new Map(model.connectors);
      m.set(id, { id, ...data });
      model.connectors = m;
      return id;
    },

    updateConnector(id: number, data: Partial<Omit<ConnectorElement, 'id'>>): void {
      if (!_undoBatching) _pushUndo?.();
      const cur = model.connectors.get(id);
      if (!cur) return;
      const m = new Map(model.connectors);
      m.set(id, { ...cur, ...data, id });
      model.connectors = m;
    },

    removeConnector(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      const m = new Map(model.connectors);
      m.delete(id);
      model.connectors = m;
    },

    clearConnectors(): void {
      if (!_undoBatching) _pushUndo?.();
      model.connectors = new Map();
    },

    // ─── Footing CRUD ───────────────────────────────────────
    //
    // Every mutation below uses `_pushUndoFoundation`, NOT `_pushUndo`. That is the same
    // primitive a reinforcement edit uses, and for the same reason: it records an undo
    // entry WITHOUT bumping `modelVersion` or firing `_onMutation`, so the stored analysis
    // results survive.
    //
    // This is a correctness requirement, not an optimisation. A footing is not part of the
    // analytical model — it CARRIES a support reaction, it does not change the stiffness
    // that produced one. Routing these through `_pushUndo` cleared the solve on every edit,
    // so by the time the design command ran there was no reaction left to design for, and
    // every footing reported "no reaction" no matter how carefully it had been dimensioned.
    // Found by the Playwright journey, which is the only place the ordering shows up.
    //
    // What footing and geotechnical edits DO invalidate — foundation design, detailing,
    // coordination, certificates and documents — is handled downstream by the per-footing
    // `revision` and by the detailing store's own invalidation, not by discarding the solve.
    // Map reassignment on every mutation per web/CLAUDE.md "Reactivity with Maps".
    //
    // Every mutation bumps the footing's own `revision`. That is what lets invalidation be
    // TARGETED: editing Z7's thickness must retire Z7's design and leave Z1..Z6 alone, and
    // a single project-wide counter cannot express that.

    /**
     * Create a footing on a node.
     *
     * Its plan dimensions start at ZERO and its soil is whatever the project has set as
     * default — possibly none. Both are deliberate: a new footing is INVALID until
     * dimensioned and founded, and says so through `validateFooting`, rather than arriving
     * at a plausible 1,50 m × 1,50 m that would pass a bearing check nobody performed.
     */
    addFooting(nodeId: number, name?: string): number {
      if (!_undoBatching) _pushUndoFoundation?.();
      const id = nextId.footing++;
      const f = newFooting(id, nodeId, name ?? `Z${id}`, {
        cover: DEFAULT_COVER,
        // The underside sits at the supported node unless the engineer moves it. The node
        // is where the column lands, so this is the only non-arbitrary starting point.
        foundingElevation: model.nodes.get(nodeId)?.z ?? 0,
        soilProfileId: model.geotechnical?.defaultProfileId ?? null,
      });
      const m = new Map(model.footings);
      m.set(id, f);
      model.footings = m;
      _onFoundationChange?.();
      return id;
    },

    updateFooting(id: number, data: Partial<Omit<Footing, 'id' | 'revision'>>): void {
      if (!_undoBatching) _pushUndoFoundation?.();
      const cur = model.footings.get(id);
      if (!cur) return;
      const m = new Map(model.footings);
      m.set(id, { ...cur, ...data, id, revision: cur.revision + 1 });
      model.footings = m;
      _onFoundationChange?.();
    },

    removeFooting(id: number): void {
      if (!_undoBatching) _pushUndoFoundation?.();
      const m = new Map(model.footings);
      m.delete(id);
      model.footings = m;
      _onFoundationChange?.();
    },

    clearFootings(): void {
      if (!_undoBatching) _pushUndoFoundation?.();
      model.footings = new Map();
      _onFoundationChange?.();
    },

    /** Footings founded on a given node — how the design pass finds its reaction. */
    footingsOnNode(nodeId: number): Footing[] {
      return [...model.footings.values()].filter((f) => f.nodeId === nodeId);
    },

    /**
     * The project's bottom-mat preferences, never undefined.
     *
     * Resolved here rather than at each of the several call sites, so nothing has to decide
     * again what an absent field means. A project that has never stated one reads as
     * 16/16/AUTO, which is what its footings were already designed to.
     */
    footingMatPreferences(): FootingMatPreferences {
      return model.footingMatPreferences ?? defaultFootingMatPreferences();
    },

    /**
     * Edit the bottom-mat preferences.
     *
     * Goes through the FOUNDATION channel, exactly like a footing edit and for the same two
     * reasons. It must be undoable, and it must NOT clear the structural analysis: the mat
     * diameter changes the effective depth a footing is designed at, it does not change the
     * stiffness that produced the reaction, and discarding the solve here would leave every
     * footing reporting "no reaction" the next time the design ran.
     *
     * It DOES fire `_onFoundationChange`, because a different mat is a different design: the
     * flexural depth, the required steel, the bar count and the spacing all move, so the
     * footing detailing and every document built from it are superseded.
     */
    setFootingMatPreferences(next: Partial<FootingMatPreferences>): void {
      const current = model.footingMatPreferences ?? defaultFootingMatPreferences();
      const merged: FootingMatPreferences = { ...current, ...next };
      // No history entry and no supersession for a write that changes nothing — a document
      // retired by a no-op edit teaches the user to ignore supersession.
      if (JSON.stringify(merged) === JSON.stringify(current)) return;
      if (!_undoBatching) _pushUndoFoundation?.();
      model.footingMatPreferences = merged;
      _onFoundationChange?.();
    },

    // ─── Geotechnical CRUD ──────────────────────────────────
    //
    // The ground is a PROJECT entity, not a footing field, so it is edited here and
    // referenced by id. The Design tab may summarise it and link to this editor; it must
    // not hold a second copy.

    /**
     * Add a stratum, with its resistance UNSTATED.
     *
     * Naming a stratum is not the same as knowing its capacity, and seeding a number would
     * put an invented value behind a name the engineer chose — which reads as theirs.
     */
    addSoilProfile(name?: string): number {
      if (!_undoBatching) _pushUndoFoundation?.();
      const id = nextId.soilProfile++;
      const geo = model.geotechnical ?? emptyGeotechnical();
      const profile = newSoilProfile(id, name ?? `Suelo ${id}`);
      model.geotechnical = {
        ...geo,
        profiles: [...geo.profiles, profile],
        // The first stratum entered becomes the default, so the next footing created has
        // somewhere to bear without a second decision.
        defaultProfileId: geo.defaultProfileId ?? id,
      };
      _onFoundationChange?.();
      return id;
    },

    updateSoilProfile(id: number, data: Partial<Omit<SoilProfile, 'id'>>): void {
      if (!_undoBatching) _pushUndoFoundation?.();
      const geo = model.geotechnical;
      if (!geo) return;
      model.geotechnical = {
        ...geo,
        profiles: geo.profiles.map((p) => (p.id === id ? { ...p, ...data, id } : p)),
      };
      _onFoundationChange?.();
    },

    /**
     * Delete a stratum.
     *
     * Footings founded on it are NOT deleted and are NOT silently re-pointed at another
     * stratum: their `soilProfileId` becomes null, which makes them fail the bearing gate
     * visibly. Re-pointing them would move a foundation onto ground the engineer never
     * chose for it.
     */
    removeSoilProfile(id: number): void {
      if (!_undoBatching) _pushUndoFoundation?.();
      const geo = model.geotechnical;
      if (!geo) return;
      const profiles = geo.profiles.filter((p) => p.id !== id);
      model.geotechnical = {
        ...geo,
        profiles,
        defaultProfileId: geo.defaultProfileId === id
          ? (profiles[0]?.id ?? null)
          : geo.defaultProfileId,
      };
      let orphaned = false;
      const m = new Map(model.footings);
      for (const [fid, f] of m) {
        if (f.soilProfileId !== id) continue;
        m.set(fid, { ...f, soilProfileId: null, revision: f.revision + 1 });
        orphaned = true;
      }
      if (orphaned) model.footings = m;
      _onFoundationChange?.();
    },

    setDefaultSoilProfile(id: number | null): void {
      if (!_undoBatching) _pushUndoFoundation?.();
      const geo = model.geotechnical ?? emptyGeotechnical();
      model.geotechnical = { ...geo, defaultProfileId: id };
      // Which stratum a NEW footing will reference changes nothing about a footing that
      // already exists, so no document is retired here. The hook is deliberately not fired:
      // retiring a document on a change that cannot alter any result would train the user to
      // ignore supersession.
    },

    removeLoad(loadId: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.loads = model.loads.filter(l => l.data.id !== loadId);
    },

    removeSupport(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.supports.delete(id);
      model.supports = new Map(model.supports);
    },

    updateSupport(id: number, data: Partial<{ nodeId: number; type: SupportType; kx: number; ky: number; kz: number; dx: number; dy: number; drz: number; angle: number; isGlobal: boolean; dz: number; drx: number; dry: number; krx: number; kry: number; krz: number; dofRestraints: { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean }; dofFrame: 'global' | 'local'; dofLocalElementId: number }>): void {
      if (!_undoBatching) _pushUndo?.();
      const sup = model.supports.get(id);
      if (!sup) return;
      // If changing nodeId, remove any existing support on the target node
      if (data.nodeId !== undefined && data.nodeId !== sup.nodeId) {
        for (const [existingId, existingSup] of model.supports) {
          if (existingSup.nodeId === data.nodeId && existingId !== id) {
            model.supports.delete(existingId);
            break;
          }
        }
      }
      // Replace entire object to guarantee Svelte 5 reactivity
      model.supports.set(id, {
        id: sup.id,
        nodeId: data.nodeId ?? sup.nodeId,
        type: data.type ? normalize2DSupportType(data.type) : sup.type,
        kx: data.kx ?? sup.kx,
        ky: data.ky ?? sup.ky,
        kz: data.kz ?? sup.kz,
        dx: data.dx ?? sup.dx,
        dz: data.dz ?? data.dy ?? sup.dz ?? sup.dy,
        dry: data.dry ?? data.drz ?? sup.dry ?? sup.drz,
        angle: 'angle' in data ? data.angle : sup.angle,
        isGlobal: 'isGlobal' in data ? data.isGlobal : sup.isGlobal,
        // 3D fields
        drx: data.drx ?? sup.drx,
        krx: data.krx ?? sup.krx,
        kry: data.kry ?? sup.kry,
        krz: data.krz ?? sup.krz,
        // Per-DOF 3D configuration
        dofRestraints: data.dofRestraints ?? sup.dofRestraints,
        dofFrame: data.dofFrame ?? sup.dofFrame,
        dofLocalElementId: data.dofLocalElementId ?? sup.dofLocalElementId,
        // Preserve inclined support fields
        normalX: sup.normalX,
        normalY: sup.normalY,
        normalZ: sup.normalZ,
        isInclined: sup.isInclined,
      });
      if (!_bulkMutating) model.supports = new Map(model.supports);
    },

    updateLoad(loadId: number, data: Record<string, number | boolean | undefined>): void {
      if (!_undoBatching) _pushUndo?.();
      const load = model.loads.find(l => l.data.id === loadId);
      if (!load) return;
      // Handle caseId for all load types
      if (data.caseId !== undefined) {
        (load.data as any).caseId = data.caseId as number | undefined;
      }
      if (load.type === 'nodal') {
        const d = load.data as NodalLoad;
        if (data.fx !== undefined) d.fx = data.fx as number;
        if (data.fz !== undefined) d.fz = data.fz as number;
        if (data.my !== undefined) d.my = data.my as number;
      } else if (load.type === 'distributed') {
        const d = load.data as DistributedLoad;
        if (data.qI !== undefined) d.qI = data.qI as number;
        if (data.qJ !== undefined) d.qJ = data.qJ as number;
        if (data.angle !== undefined) d.angle = data.angle as number;
        if (data.isGlobal !== undefined) d.isGlobal = data.isGlobal as boolean;
        if (data.a !== undefined) {
          const aVal = Math.max(0, data.a as number);
          d.a = aVal > 0 ? aVal : undefined;
        }
        if (data.b !== undefined) {
          const bVal = data.b as number;
          const L = this.getElementLength(d.elementId);
          d.b = (bVal < L - 1e-10) ? Math.max(d.a ?? 0, bVal) : undefined;
        }
      } else if (load.type === 'pointOnElement') {
        const d = load.data as PointLoadOnElement;
        if (data.a !== undefined) d.a = data.a as number;
        if (data.p !== undefined) d.p = data.p as number;
        if (data.px !== undefined) d.px = (data.px as number) || undefined;
        if (data.my !== undefined) d.my = (data.my as number) || undefined;
        if (data.angle !== undefined) d.angle = data.angle as number;
        if (data.isGlobal !== undefined) d.isGlobal = data.isGlobal as boolean;
      } else if (load.type === 'thermal') {
        const d = load.data as ThermalLoad;
        if (data.dtUniform !== undefined) d.dtUniform = data.dtUniform as number;
        if (data.dtGradient !== undefined) d.dtGradient = data.dtGradient as number;
      } else if (load.type === 'nodal3d') {
        const d = load.data as NodalLoad3D;
        if (data.fx !== undefined) d.fx = data.fx as number;
        if (data.fy !== undefined) d.fy = data.fy as number;
        if (data.fz !== undefined) d.fz = data.fz as number;
        if (data.mx !== undefined) d.mx = data.mx as number;
        if (data.my !== undefined) d.my = data.my as number;
        if (data.mz !== undefined) d.mz = data.mz as number;
      } else if (load.type === 'distributed3d') {
        const d = load.data as DistributedLoad3D;
        if (data.qYI !== undefined) d.qYI = data.qYI as number;
        if (data.qYJ !== undefined) d.qYJ = data.qYJ as number;
        if (data.qZI !== undefined) d.qZI = data.qZI as number;
        if (data.qZJ !== undefined) d.qZJ = data.qZJ as number;
        if (data.a !== undefined) {
          const aVal = Math.max(0, data.a as number);
          d.a = aVal > 0 ? aVal : undefined;
        }
        if (data.b !== undefined) {
          const bVal = data.b as number;
          const L = this.getElementLength(d.elementId);
          d.b = (bVal < L - 1e-10) ? Math.max(d.a ?? 0, bVal) : undefined;
        }
      } else if (load.type === 'pointOnElement3d') {
        const d = load.data as PointLoadOnElement3D;
        if (data.a !== undefined) d.a = data.a as number;
        if (data.py !== undefined) d.py = data.py as number;
        if (data.pz !== undefined) d.pz = data.pz as number;
      } else if (load.type === 'surface3d') {
        const d = load.data as SurfaceLoad3D;
        if (data.q !== undefined) d.q = data.q as number;
      } else if (load.type === 'thermalQuad3d') {
        const d = load.data as ThermalLoadQuad3D;
        if (data.dtUniform !== undefined) d.dtUniform = data.dtUniform as number;
        if (data.dtGradient !== undefined) d.dtGradient = data.dtGradient as number;
      }
      // Reassign array to trigger Svelte 5 reactivity after in-place mutation
      model.loads = [...model.loads];
    },

    clear(): void {
      if (!_undoBatching) _pushUndo?.();
      model.name = t('tabBar.newStructure');
      model.nodes = new Map();
      model.elements = new Map();
      model.supports = new Map();
      model.loads = [];
      model.plates = new Map();
      model.quads = new Map();
      model.constraints = [];
      model.connectors = new Map();
      model.footings = new Map();
      // A new project has no strata. Carrying the previous project's soil over would be
      // founding this building on someone else's borehole.
      model.geotechnical = emptyGeotechnical();
      // Same reasoning one line up, applied to the mat: a new project starts from the stated
      // default and not from the diameter the previous project's engineer chose.
      model.footingMatPreferences = defaultFootingMatPreferences();
      // A new model is a new project: it adopts the edition in force, not whatever the
      // previously open project happened to be designed to.
      model.codeSettings = defaultCodeSettings();
      model.detailing = emptyDetailingStore();
      // A new project has no designed joints. Same reasoning as the soil two blocks up: keeping
      // them would attach the previous project's bolts to this one's node ids.
      model.jointDesigns = undefined;
      // Reset materials/sections to defaults
      model.materials = new Map([[1, { ...defaultMaterial }]]);
      // Resolve the default profile's canonical state too. `clear()` runs on
      // every new model and before every example load, so leaving it
      // unresolved is what made a freshly loaded example report its section as
      // amorphous even after the engine was up.
      model.sections = new Map([[1, resolveDefaultSection(defaultSection)]]);
      model.loadCases = [
        { id: 1, type: 'D', name: 'Dead Load' },
        { id: 2, type: 'L', name: 'Live Load' },
        { id: 3, type: 'W', name: 'Wind' },
        { id: 4, type: 'E', name: 'Earthquake' },
      ];
      model.combinations = [
        { id: 1, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
        { id: 2, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] },
        { id: 3, name: '1.2D + L + 1.6W', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.6 }] },
        { id: 4, name: '1.2D + L + E', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 4, factor: 1.0 }] },
      ];
      nextId.node = 1;
      nextId.material = 2;
      nextId.section = 2;
      nextId.element = 1;
      nextId.support = 1;
      nextId.load = 1;
      nextId.loadCase = 5;
      nextId.combination = 5;
      nextId.plate = 1;
      nextId.quad = 1;
      nextId.connector = 1;
      nextId.footing = 1;
      nextId.soilProfile = 1;
      model.provenance = undefined;
      lastKinematicResult = null;
      uiStore.useNative3DPresentation();
      // Whatever a 3D→2D switch was holding for restore belongs to the model
      // that just ceased to exist; keeping it would let a later "restore 3D"
      // overwrite the NEXT model. (File open is covered in file.ts; undo/redo
      // deliberately is not — see switch-2d.ts.)
      resetSwitchBackup();
    },

    /** Replace model geometry data in-place (for simplified 2D model swap). No undo. */
    replaceModelData(nodes: Map<number, any>, elements: Map<number, any>, supports: Map<number, any>, loads: any[]): void {
      model.nodes = nodes;
      model.elements = elements;
      model.supports = supports;
      model.loads = loads;
    },

    updateNode(id: number, x: number, y: number, z?: number): void {
      const node = model.nodes.get(id);
      if (node) {
        modelVersion++;
        _onMutation?.();
        model.nodes.set(id, { id: node.id, x, y, z: z !== undefined ? z : node.z });
        model.nodes = new Map(model.nodes);
        // Clamp distributed load a/b when element length changes
        for (const elem of model.elements.values()) {
          if (elem.nodeI === id || elem.nodeJ === id) {
            const ni = model.nodes.get(elem.nodeI);
            const nj = model.nodes.get(elem.nodeJ);
            if (!ni || !nj) continue;
            const dz = (nj.z ?? 0) - (ni.z ?? 0);
            const newL = Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2 + dz * dz);
            for (const load of model.loads) {
              if (load.type === 'distributed' && (load.data as DistributedLoad).elementId === elem.id) {
                const d = load.data as DistributedLoad;
                if (d.a !== undefined && d.a > newL) d.a = newL;
                if (d.b !== undefined && d.b > newL) d.b = newL;
                // If a >= b after clamping, load has zero length (won't act)
              }
              if (load.type === 'pointOnElement' && (load.data as PointLoadOnElement).elementId === elem.id) {
                const d = load.data as PointLoadOnElement;
                if (d.a > newL) d.a = newL;
              }
            }
          }
        }
      }
    },

    subdivideElement(elementId: number, n: number): void {
      if (n < 2 || n > 20) return;
      const elem = model.elements.get(elementId);
      if (!elem) return;
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!ni || !nj) return;

      if (!_undoBatching) _pushUndo?.();
      _undoBatching = true;

      const dx = (nj.x - ni.x) / n;
      const dy = (nj.y - ni.y) / n;
      const dz = ((nj.z ?? 0) - (ni.z ?? 0)) / n;
      const hasZ = ni.z !== undefined || nj.z !== undefined;

      // Create intermediate nodes
      const nodeIds: number[] = [elem.nodeI];
      for (let i = 1; i < n; i++) {
        const id = nextId.node++;
        model.nodes.set(id, {
          id, x: ni.x + dx * i, y: ni.y + dy * i,
          ...(hasZ ? { z: (ni.z ?? 0) + dz * i } : {}),
        });
        nodeIds.push(id);
      }
      nodeIds.push(elem.nodeJ);

      // Collect distributed loads on this element (they get replicated on each sub-element)
      const distLoads = model.loads.filter(
        l => l.type === 'distributed' && (l.data as DistributedLoad).elementId === elementId
      );

      // Remove loads on original element (they will be replicated)
      model.loads = model.loads.filter(l =>
        !((l.type === 'distributed' || l.type === 'pointOnElement') &&
          (l.data as any).elementId === elementId)
      );

      // 3D properties to inherit on new sub-elements
      const inherited3D = pickElement3DMetadata(elem);

      // Preserve original element as first segment. Releases at the original
      // I-end stay; the J-end release moves to the last sub-element.
      const origReleaseJ: Release = { ...(elem.releaseJ ?? NO_RELEASE) };
      elem.nodeJ = nodeIds[1];
      elem.releaseJ = { ...NO_RELEASE };

      // Build ordered list of all segment element IDs (original first, then new)
      const segmentElemIds: number[] = [elementId];

      // Create new sub-elements for segments 2..n
      for (let i = 1; i < n; i++) {
        const id = nextId.element++;
        model.elements.set(id, {
          id,
          type: elem.type,
          nodeI: nodeIds[i],
          nodeJ: nodeIds[i + 1],
          materialId: elem.materialId,
          sectionId: elem.sectionId,
          releaseI: { ...NO_RELEASE },
          releaseJ: i === n - 1 ? origReleaseJ : { ...NO_RELEASE },
          ...inherited3D,
        });
        segmentElemIds.push(id);
      }

      // Replicate distributed loads on each sub-element (interpolate for trapezoidal)
      const newSubLoads: typeof model.loads = [];
      for (const dl of distLoads) {
        const d = dl.data as DistributedLoad;
        for (let i = 0; i < segmentElemIds.length; i++) {
          const tI = i / n;
          const tJ = (i + 1) / n;
          const subQI = d.qI + (d.qJ - d.qI) * tI;
          const subQJ = d.qI + (d.qJ - d.qI) * tJ;
          const lid = nextId.load++;
          newSubLoads.push({
            type: 'distributed',
            data: { id: lid, elementId: segmentElemIds[i], qI: subQI, qJ: subQJ } as DistributedLoad,
          });
        }
      }
      model.loads = [...model.loads, ...newSubLoads];

      model.nodes = new Map(model.nodes);
      model.elements = new Map(model.elements);
      _undoBatching = false;
    },

    /** Toggle a single per-axis release on a single element-end. The canonical release API. */
    toggleRelease(elementId: number, end: ReleaseEnd, axis: ReleaseAxis): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elementId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      const target: Release = { ...(end === 'i' ? plain.releaseI : plain.releaseJ) };
      target[axis] = !target[axis];
      if (end === 'i') plain.releaseI = target;
      else plain.releaseJ = target;
      model.elements.set(elementId, plain);
      if (!_bulkMutating) model.elements = new Map(model.elements);
    },

    /** Legacy fixture-loader wrapper. Toggles the bending-around-Mz release (the "hinge" in 2D). */
    toggleHinge(elementId: number, end: 'start' | 'end'): void {
      this.toggleRelease(elementId, end === 'start' ? 'i' : 'j', 'mz');
    },

    /** Set (or clear, when `slide === undefined`) the 2D sliding-joint release on
     *  one element-end. `axis` is ignored when clearing. Explicit model data — the
     *  solver expands it ephemerally (sliding-joints.ts); save/load/undo persist it. */
    setSlide(elementId: number, end: ReleaseEnd, slide: SlideKind | undefined, axis: SlideAxisMode = 'global'): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elementId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      const target: Release = { ...(end === 'i' ? plain.releaseI : plain.releaseJ) };
      if (slide === undefined) {
        delete target.slide;
        delete target.slideAxis;
      } else {
        target.slide = slide;
        target.slideAxis = axis;
      }
      if (end === 'i') plain.releaseI = target;
      else plain.releaseJ = target;
      model.elements.set(elementId, plain);
      if (!_bulkMutating) model.elements = new Map(model.elements);
    },

    /** Set (or clear, when `dof === null`) the Basic 3D internal-joint release mask
     *  on one element-end. `dof` is the 6-bool global mask [dx,dy,dz,θx,θy,θz]; an
     *  all-false mask clears the joint. Explicit model data — expanded at solve
     *  time (expand-joints-3d.ts); save/load/undo preserve it. */
    setElementJoint(elementId: number, end: ReleaseEnd, dof: boolean[] | null): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elementId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      const released = dof != null && dof.some(Boolean);
      if (!released) {
        if (end === 'i') delete plain.jointI; else delete plain.jointJ;
      } else {
        const mask = [0, 1, 2, 3, 4, 5].map(i => dof![i] === true) as Joint3D['dof'];
        if (end === 'i') plain.jointI = { dof: mask }; else plain.jointJ = { dof: mask };
      }
      model.elements.set(elementId, plain);
      if (!_bulkMutating) model.elements = new Map(model.elements);
    },

    /** True if any element carries a Basic 3D internal joint (released DOF). */
    hasJoint3D(): boolean {
      for (const e of model.elements.values()) {
        if (jointHasRelease(e.jointI) || jointHasRelease(e.jointJ)) return true;
      }
      return false;
    },

    /** Get all elements connected to a node, annotated with which end touches the node */
    getElementsAtNode(nodeId: number): Array<{ element: Element; end: 'start' | 'end' }> {
      const result: Array<{ element: Element; end: 'start' | 'end' }> = [];
      for (const elem of model.elements.values()) {
        if (elem.nodeI === nodeId) result.push({ element: elem, end: 'start' });
        if (elem.nodeJ === nodeId) result.push({ element: elem, end: 'end' });
      }
      return result;
    },

    /** Get release state of all element-ends connected to a node. `hasHinge` reflects the Mz release (2D-style hinge). */
    getReleasesAtNode(nodeId: number): Array<{ elementId: number; end: ReleaseEnd; release: Release; hasHinge: boolean }> {
      const result: Array<{ elementId: number; end: ReleaseEnd; release: Release; hasHinge: boolean }> = [];
      for (const elem of model.elements.values()) {
        if (elem.nodeI === nodeId) {
          const r = elem.releaseI ?? NO_RELEASE;
          result.push({ elementId: elem.id, end: 'i', release: r, hasHinge: r.mz === true });
        }
        if (elem.nodeJ === nodeId) {
          const r = elem.releaseJ ?? NO_RELEASE;
          result.push({ elementId: elem.id, end: 'j', release: r, hasHinge: r.mz === true });
        }
      }
      return result;
    },

    /** Legacy alias. Returns hinge (Mz-release) state of all element-ends connected to a node. */
    getHingesAtNode(nodeId: number): Array<{ elementId: number; end: 'start' | 'end'; hasHinge: boolean }> {
      return this.getReleasesAtNode(nodeId).map(r => ({
        elementId: r.elementId,
        end: r.end === 'i' ? 'start' : 'end' as 'start' | 'end',
        hasHinge: r.hasHinge,
      }));
    },

    /** True if any element carries a 2D sliding joint (translational release).
     *  UI-facing guard: advanced analyses that don't expand slider constraints
     *  use this to block runs that would otherwise be silently too stiff. */
    hasSlidingJoints(): boolean {
      for (const e of model.elements.values()) {
        if (e.releaseI?.slide != null || e.releaseJ?.slide != null) return true;
      }
      return false;
    },

    /** Split an element at parametric position t ∈ (0,1), creating a new node and two sub-elements.
     *  Redistributes loads (distributed, point, thermal) to the sub-elements.
     *  Preserves releaseI on elemA and releaseJ on elemB from the original element. */
    splitElementAtPoint(elementId: number, t: number): { nodeId: number; elemA: number; elemB: number } | null {
      if (t <= 0.01 || t >= 0.99) return null;
      const elem = model.elements.get(elementId);
      if (!elem) return null;
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!ni || !nj) return null;

      if (!_undoBatching) _pushUndo?.();
      _undoBatching = true;

      // Compute new node position
      const px = ni.x + t * (nj.x - ni.x);
      const py = ni.y + t * (nj.y - ni.y);
      const hasZ = ni.z !== undefined || nj.z !== undefined;
      const pz = (ni.z ?? 0) + t * ((nj.z ?? 0) - (ni.z ?? 0));

      // Check if a node already exists at this position (within tolerance)
      let newNodeId: number | null = null;
      for (const node of model.nodes.values()) {
        if (Math.abs(node.x - px) < 0.01 && Math.abs(node.y - py) < 0.01 && Math.abs((node.z ?? 0) - pz) < 0.01) {
          newNodeId = node.id;
          break;
        }
      }
      if (newNodeId === null) {
        newNodeId = nextId.node++;
        model.nodes.set(newNodeId, { id: newNodeId, x: px, y: py, ...(hasZ ? { z: pz } : {}) });
      }

      // Compute element length for load redistribution
      const dz = (nj.z ?? 0) - (ni.z ?? 0);
      const L = Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2 + dz * dz);
      const LA = L * t;

      // Collect loads on this element
      const distLoads = model.loads.filter(
        l => l.type === 'distributed' && (l.data as DistributedLoad).elementId === elementId
      );
      const pointLoads = model.loads.filter(
        l => l.type === 'pointOnElement' && (l.data as PointLoadOnElement).elementId === elementId
      );
      const thermalLoads = model.loads.filter(
        l => l.type === 'thermal' && (l.data as ThermalLoad).elementId === elementId
      );

      // Read original per-axis release state explicitly
      const origReleaseI: Release = { ...(elem.releaseI ?? NO_RELEASE) };
      const origReleaseJ: Release = { ...(elem.releaseJ ?? NO_RELEASE) };
      const origType = elem.type;
      const origMatId = elem.materialId;
      const origSecId = elem.sectionId;
      const inherited3D = pickElement3DMetadata(elem);

      // Remove original element and its loads
      model.elements.delete(elementId);
      model.loads = model.loads.filter(l => {
        if (l.type === 'distributed' || l.type === 'pointOnElement' || l.type === 'thermal') {
          return (l.data as any).elementId !== elementId;
        }
        return true;
      });

      // Create two new sub-elements
      const elemAId = nextId.element++;
      model.elements.set(elemAId, {
        id: elemAId,
        type: origType,
        nodeI: elem.nodeI,
        nodeJ: newNodeId,
        materialId: origMatId,
        sectionId: origSecId,
        releaseI: origReleaseI,
        releaseJ: { ...NO_RELEASE },
        ...inherited3D,
      });

      const elemBId = nextId.element++;
      model.elements.set(elemBId, {
        id: elemBId,
        type: origType,
        nodeI: newNodeId,
        nodeJ: elem.nodeJ,
        materialId: origMatId,
        sectionId: origSecId,
        releaseI: { ...NO_RELEASE },
        releaseJ: origReleaseJ,
        ...inherited3D,
      });

      // Redistribute distributed loads (interpolate for trapezoidal, handle partial a/b)
      for (const dl of distLoads) {
        const d = dl.data as DistributedLoad;
        const loadA = d.a ?? 0;
        const loadB = d.b ?? L;
        const loadSpan = loadB - loadA;
        const copyMeta = (target: DistributedLoad) => {
          if (d.angle !== undefined) target.angle = d.angle;
          if (d.isGlobal !== undefined) target.isGlobal = d.isGlobal;
          if (d.caseId !== undefined) target.caseId = d.caseId;
        };

        if (loadB <= LA + 1e-10) {
          // Entire load falls on elemA
          const lidA = nextId.load++;
          const dataA: DistributedLoad = { id: lidA, elementId: elemAId, qI: d.qI, qJ: d.qJ };
          if (loadA > 1e-10) dataA.a = loadA;
          if (loadB < LA - 1e-10) dataA.b = loadB;
          copyMeta(dataA);
          model.loads = [...model.loads, { type: 'distributed', data: dataA }];
        } else if (loadA >= LA - 1e-10) {
          // Entire load falls on elemB
          const lidB = nextId.load++;
          const newA = loadA - LA;
          const newB = loadB - LA;
          const LB = L - LA;
          const dataB: DistributedLoad = { id: lidB, elementId: elemBId, qI: d.qI, qJ: d.qJ };
          if (newA > 1e-10) dataB.a = newA;
          if (newB < LB - 1e-10) dataB.b = newB;
          copyMeta(dataB);
          model.loads = [...model.loads, { type: 'distributed', data: dataB }];
        } else {
          // Load crosses the split point — split into two loads
          const tSplit = (LA - loadA) / loadSpan; // normalized position within load span
          const qMid = d.qI + (d.qJ - d.qI) * tSplit;
          // Load on elemA: from loadA to LA
          const lidA = nextId.load++;
          const dataA: DistributedLoad = { id: lidA, elementId: elemAId, qI: d.qI, qJ: qMid };
          if (loadA > 1e-10) dataA.a = loadA;
          // b = LA which is the full length of elemA, so no need to set b
          copyMeta(dataA);
          // Load on elemB: from 0 to (loadB - LA)
          const lidB = nextId.load++;
          const newB = loadB - LA;
          const LB = L - LA;
          const dataB: DistributedLoad = { id: lidB, elementId: elemBId, qI: qMid, qJ: d.qJ };
          if (newB < LB - 1e-10) dataB.b = newB;
          copyMeta(dataB);
          model.loads = [...model.loads, { type: 'distributed', data: dataA }, { type: 'distributed', data: dataB }];
        }
      }

      // Redistribute point loads on element
      for (const pl of pointLoads) {
        const d = pl.data as PointLoadOnElement;
        const lid = nextId.load++;
        if (d.a < LA - 1e-6) {
          // Point load is on elemA (distance from nodeI unchanged)
          const data: PointLoadOnElement = { id: lid, elementId: elemAId, a: d.a, p: d.p };
          if (d.angle !== undefined) data.angle = d.angle;
          if (d.isGlobal !== undefined) data.isGlobal = d.isGlobal;
          if (d.caseId !== undefined) data.caseId = d.caseId;
          if (d.px !== undefined) data.px = d.px;
          if (d.my !== undefined) data.my = d.my;
          model.loads = [...model.loads, { type: 'pointOnElement', data }];
        } else {
          // Point load is on elemB (adjust distance: a' = a - LA)
          const data: PointLoadOnElement = { id: lid, elementId: elemBId, a: d.a - LA, p: d.p };
          if (d.angle !== undefined) data.angle = d.angle;
          if (d.isGlobal !== undefined) data.isGlobal = d.isGlobal;
          if (d.caseId !== undefined) data.caseId = d.caseId;
          if (d.px !== undefined) data.px = d.px;
          if (d.my !== undefined) data.my = d.my;
          model.loads = [...model.loads, { type: 'pointOnElement', data }];
        }
      }

      // Replicate thermal loads on both sub-elements
      for (const tl of thermalLoads) {
        const d = tl.data as ThermalLoad;
        const lidA = nextId.load++;
        const dataA: ThermalLoad = { id: lidA, elementId: elemAId, dtUniform: d.dtUniform, dtGradient: d.dtGradient };
        if (d.caseId !== undefined) dataA.caseId = d.caseId;
        const lidB = nextId.load++;
        const dataB: ThermalLoad = { id: lidB, elementId: elemBId, dtUniform: d.dtUniform, dtGradient: d.dtGradient };
        if (d.caseId !== undefined) dataB.caseId = d.caseId;
        model.loads = [...model.loads, { type: 'thermal', data: dataA }, { type: 'thermal', data: dataB }];
      }

      model.nodes = new Map(model.nodes);
      model.elements = new Map(model.elements);
      _undoBatching = false;

      return { nodeId: newNodeId, elemA: elemAId, elemB: elemBId };
    },

    /** Mirror selected nodes about an axis through their centroid */
    mirrorNodes(nodeIds: Set<number>, axis: 'x' | 'y'): void {
      if (nodeIds.size === 0) return;
      _pushUndo?.();
      // Compute centroid
      let cx = 0, cy = 0;
      for (const id of nodeIds) {
        const n = model.nodes.get(id);
        if (n) { cx += n.x; cy += n.y; }
      }
      cx /= nodeIds.size;
      cy /= nodeIds.size;
      // Mirror
      for (const id of nodeIds) {
        const n = model.nodes.get(id);
        if (!n) continue;
        if (axis === 'x') {
          model.nodes.set(id, { id: n.id, x: 2 * cx - n.x, y: n.y, ...(n.z !== undefined ? { z: n.z } : {}) });
        } else {
          model.nodes.set(id, { id: n.id, x: n.x, y: 2 * cy - n.y, ...(n.z !== undefined ? { z: n.z } : {}) });
        }
      }
      model.nodes = new Map(model.nodes);
    },

    /** Rotate selected nodes by angle (degrees) around their centroid */
    rotateNodes(nodeIds: Set<number>, angleDeg: number): void {
      if (nodeIds.size === 0) return;
      _pushUndo?.();
      let cx = 0, cy = 0;
      for (const id of nodeIds) {
        const n = model.nodes.get(id);
        if (n) { cx += n.x; cy += n.y; }
      }
      cx /= nodeIds.size;
      cy /= nodeIds.size;
      const rad = angleDeg * Math.PI / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      for (const id of nodeIds) {
        const n = model.nodes.get(id);
        if (!n) continue;
        const dx = n.x - cx;
        const dy = n.y - cy;
        model.nodes.set(id, { id: n.id, x: cx + dx * cosA - dy * sinA, y: cy + dx * sinA + dy * cosA, ...(n.z !== undefined ? { z: n.z } : {}) });
      }
      model.nodes = new Map(model.nodes);
    },

    solve(includeSelfWeight = false, drawPlane: DrawPlane = 'xy'): AnalysisResults | string | null {
      const mapped = remapModelForPlane(drawPlane);
      if (typeof mapped === 'string') return mapped;
      return validateAndSolve2D(mapped, includeSelfWeight, (k) => { lastKinematicResult = k; });
    },

    /** Async 2D solve via the worker pool (UI stays responsive). Same result
     *  shape and string-error semantics as solve(). */
    async solveAsync(includeSelfWeight = false, drawPlane: DrawPlane = 'xy'): Promise<AnalysisResults | string | null> {
      const mapped = remapModelForPlane(drawPlane);
      if (typeof mapped === 'string') return mapped;
      return validateAndSolve2DAsync(mapped, includeSelfWeight, (k) => { lastKinematicResult = k; });
    },

    /** Build a SolverInput from the current model state (no validation). Returns null if model is empty. */
    buildSolverInput(includeSelfWeight = false, drawPlane: DrawPlane = 'xy'): SolverInput | null {
      const mapped = remapModelForPlane(drawPlane);
      if (typeof mapped === 'string') return null;
      return buildSolverInput2D(mapped, includeSelfWeight);
    },

    // ─── Load Case Colors ───
    getLoadCaseColor(caseId: number): string {
      const TYPE_COLORS: Record<string, string> = {
        'D': '#ff4444', 'L': '#4ea8de', 'W': '#4ecdc4', 'E': '#e9c46a',
        'S': '#b0bec5', 'T': '#ff8a65', 'Lr': '#7986cb', 'R': '#4db6ac', 'H': '#9575cd',
      };
      const ROTATING_COLORS = ['#a855f7', '#f97316', '#22d3ee', '#84cc16', '#f43f5e'];
      const lc = model.loadCases.find(c => c.id === caseId);
      if (!lc) return '#ff4444';
      if (lc.type && TYPE_COLORS[lc.type]) return TYPE_COLORS[lc.type];
      // Fallback: check name for backward compat with old models
      if (TYPE_COLORS[lc.name]) return TYPE_COLORS[lc.name];
      // For custom cases, assign rotating colors based on position
      const idx = model.loadCases.filter(c => !(c.type && TYPE_COLORS[c.type]) && !TYPE_COLORS[c.name]).indexOf(lc);
      return ROTATING_COLORS[idx % ROTATING_COLORS.length];
    },

    getLoadCaseName(caseId: number): string {
      const lc = model.loadCases.find(c => c.id === caseId);
      if (!lc) return '?';
      return lc.type || lc.name || '?';
    },

    // ─── Load Case / Combination CRUD ───
    addLoadCase(name: string, type: LoadCaseType = ''): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.loadCase++;
      model.loadCases.push({ id, type, name });
      return id;
    },

    removeLoadCase(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.loadCases = model.loadCases.filter(c => c.id !== id);
      // Remove loads that belong to this case
      model.loads = model.loads.filter(l => (l.data.caseId ?? 1) !== id);
      // Remove from combinations
      for (const combo of model.combinations) {
        combo.factors = combo.factors.filter(f => f.caseId !== id);
      }
    },

    updateLoadCase(id: number, name: string): void {
      if (!_undoBatching) _pushUndo?.();
      const lc = model.loadCases.find(c => c.id === id);
      if (lc) lc.name = name;
    },

    updateLoadCaseType(id: number, type: LoadCaseType): void {
      if (!_undoBatching) _pushUndo?.();
      const lc = model.loadCases.find(c => c.id === id);
      if (lc) lc.type = type;
    },

    addCombination(name: string, factors: Array<{ caseId: number; factor: number }>): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.combination++;
      model.combinations.push({ id, name, factors: [...factors] });
      return id;
    },

    removeCombination(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.combinations = model.combinations.filter(c => c.id !== id);
    },

    updateCombination(id: number, data: Partial<{ name: string; factors: Array<{ caseId: number; factor: number }> }>): void {
      if (!_undoBatching) _pushUndo?.();
      const combo = model.combinations.find(c => c.id === id);
      if (!combo) return;
      if (data.name !== undefined) combo.name = data.name;
      if (data.factors !== undefined) combo.factors = [...data.factors];
    },

    updateLoadCaseId(loadId: number, caseId: number): void {
      if (!_undoBatching) _pushUndo?.();
      const load = model.loads.find(l => l.data.id === loadId);
      if (load) (load.data as any).caseId = caseId;
    },

    /** Solve all load cases and combine. Returns per-case + per-combo + envelope results. */
    solveCombinations(includeSelfWeight = false, drawPlane: DrawPlane = 'xy'): { perCase: Map<number, AnalysisResults>; perCombo: Map<number, AnalysisResults>; envelope: FullEnvelope } | string | null {
      const mapped = remapModelForPlane(drawPlane);
      if (typeof mapped === 'string') return mapped;
      return solveCombinations2D(mapped, model.loadCases, model.combinations, includeSelfWeight);
    },

    // ─── 3D Analysis ──────────────────────────────────────────────

    /** Build a SolverInput3D from the current model state. Returns null if model is empty. */
    buildSolverInput3D(includeSelfWeight = false, leftHand = false, opts: { expandMemberOffsets?: boolean } = {}): SolverInput3D | null {
      return buildSolverInput3DFn(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections,
          plates: model.plates, quads: model.quads,
          constraints: model.constraints, connectors: model.connectors },
        includeSelfWeight, leftHand, opts,
      );
    },

    /** Solve the current model using the 3D solver. Returns results or error string.
     *  Shell elements (plates/quads) are only included when isPro=true to keep Basic 3D clean. */
    solve3D(includeSelfWeight = false, leftHand = false, isPro = false): AnalysisResults3D | string | null {
      // Sliding joints are a Basic 2D feature; the 3D solve path does not expand
      // them, so it would silently treat slider ends as rigid. Block instead.
      if (this.hasSlidingJoints()) return t('advanced.sliding3dUnsupported');
      return validateAndSolve3D(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections,
          plates: isPro ? model.plates : undefined,
          quads: isPro ? model.quads : undefined,
          constraints: isPro ? model.constraints : undefined,
          connectors: isPro ? model.connectors : undefined },
        includeSelfWeight, leftHand,
      );
    },

    /** Async 3D solve via the worker pool (UI stays responsive). Same result
     *  shape and string-error semantics as solve3D(). */
    async solve3DAsync(includeSelfWeight = false, leftHand = false, isPro = false): Promise<AnalysisResults3D | string | null> {
      if (this.hasSlidingJoints()) return t('advanced.sliding3dUnsupported');
      return validateAndSolve3DAsync(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections,
          plates: isPro ? model.plates : undefined,
          quads: isPro ? model.quads : undefined,
          constraints: isPro ? model.constraints : undefined,
          connectors: isPro ? model.connectors : undefined },
        includeSelfWeight, leftHand,
      );
    },

    /** Solve load combinations for 3D analysis (mirrors 2D solveCombinations).
     *  Shell elements are only included when isPro=true. */
    solveCombinations3D(includeSelfWeight = false, leftHand = false, isPro = false): { perCase: Map<number, AnalysisResults3D>; perCombo: Map<number, AnalysisResults3D>; envelope: FullEnvelope3D } | string | null {
      if (this.hasSlidingJoints()) return t('advanced.sliding3dUnsupported');
      return solveCombinations3DFn(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections,
          plates: isPro ? model.plates : undefined,
          quads: isPro ? model.quads : undefined,
          constraints: isPro ? model.constraints : undefined,
          connectors: isPro ? model.connectors : undefined },
        model.loadCases, model.combinations, includeSelfWeight, leftHand,
      );
    },

    /** Async parallel version of solveCombinations3D — uses Web Workers for parallel solving. */
    async solveCombinations3DParallel(includeSelfWeight = false, leftHand = false, isPro = false): Promise<{ perCase: Map<number, AnalysisResults3D>; perCombo: Map<number, AnalysisResults3D>; envelope: FullEnvelope3D } | string | null> {
      if (this.hasSlidingJoints()) return t('advanced.sliding3dUnsupported');
      return solveCombinations3DParallelFn(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections,
          plates: isPro ? model.plates : undefined,
          quads: isPro ? model.quads : undefined,
          constraints: isPro ? model.constraints : undefined,
          connectors: isPro ? model.connectors : undefined },
        model.loadCases, model.combinations, includeSelfWeight, leftHand,
      );
    },

    /** Compute influence line: move unit load P=1 (downward) across elements */
    computeInfluenceLine(
      quantity: InfluenceQuantity,
      targetNodeId?: number,
      targetElementId?: number,
      targetPosition: number = 0.5,
      nPointsPerElement: number = 20,
    ): InfluenceLineResult | string {
      return computeInfluenceLineFn(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections },
        quantity, targetNodeId, targetElementId, targetPosition, nPointsPerElement,
      );
    },

    // ─── Example Structures ───

    /**
     * The `FixtureLoader` surface, built once.
     *
     * Extracted from `loadExample` so a generated model can be replayed through exactly the
     * same path — see `store/generator-apply.ts`. Two copies of this binding list would
     * drift the first time a loader gained a method, and the generated model would silently
     * lose whatever the second copy forgot.
     */
    fixtureApi() {
      return {
        addNode: this.addNode.bind(this),
        addElement: this.addElement.bind(this),
        addSupport: this.addSupport.bind(this),
        updateSupport: this.updateSupport.bind(this),
        addMaterial: this.addMaterial.bind(this),
        addSection: this.addSection.bind(this),
        updateElementMaterial: this.updateElementMaterial.bind(this),
        updateElementSection: this.updateElementSection.bind(this),
        addDistributedLoad: this.addDistributedLoad.bind(this),
        addNodalLoad: this.addNodalLoad.bind(this),
        addPointLoadOnElement: this.addPointLoadOnElement.bind(this),
        addThermalLoad: this.addThermalLoad.bind(this),
        toggleHinge: this.toggleHinge.bind(this),
        toggleRelease: this.toggleRelease.bind(this),
        addDistributedLoad3D: this.addDistributedLoad3D.bind(this),
        addNodalLoad3D: this.addNodalLoad3D.bind(this),
        addSurfaceLoad3D: this.addSurfaceLoad3D.bind(this),
        addPlate: this.addPlate.bind(this),
        addQuad: this.addQuad.bind(this),
        addConstraint: this.addConstraint.bind(this),
        model,
        nextId,
      };
    },

    async loadExample(name: string): Promise<void> {
      const loader = getFixture(name);
      if (!loader) return;

      if (!_undoBatching) _pushUndo?.();
      _undoBatching = true;
      this.clear();

      const json = await loader();
      const api = this.fixtureApi();

      this.bulkMutate(() => {
        loadFixture(json as any, api as any);
      });

      // Settle canonical state once the whole model is in place. Sections the
      // fixture added are already resolved (addSection resolves per add, and
      // the refresh skips those), so this repairs only sections that loaded
      // before the engine was ready — without it those would keep reporting
      // no known geometry for the rest of the session.
      this.refreshCanonicalSections();

      if (is2DFixture(name) && (uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro')) {
        uiStore.useUpright2DIn3DPresentation();
      } else {
        uiStore.useNative3DPresentation();
      }

      // Switch to plain 3D mode only when the current app mode is the basic app.
      // PRO and EDU use 3D fixtures too, but loading them should not downgrade the app.
      if (is3DFixture(name)) {
        if (uiStore.analysisMode !== 'pro' && uiStore.analysisMode !== 'edu') {
          uiStore.analysisMode = '3d';
        }
      }

      _undoBatching = false;
    },

    // ─── Material CRUD ───
    // NOTE: All material/section methods reassign the entire Map to guarantee
    // Svelte 5 reactivity. SvelteMap proxy .set()/.delete() don't reliably
    // trigger template re-renders; property assignment on $state always does.
    addMaterial(data: Omit<Material, 'id'>): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.material++;
      if (_bulkMutating) {
        model.materials.set(id, { id, ...data });
      } else {
        const m = new Map(model.materials);
        m.set(id, { id, ...data });
        model.materials = m;
      }
      return id;
    },

    updateMaterial(id: number, data: Partial<Omit<Material, 'id'>>): void {
      if (!_undoBatching) _pushUndo?.();
      const mat = model.materials.get(id);
      if (!mat) return;
      const m = new Map(model.materials);
      m.set(id, { ...mat, ...data, id });
      model.materials = m;
      this.bumpModelVersion();
    },

    removeMaterial(id: number): boolean {
      for (const elem of model.elements.values()) {
        if (elem.materialId === id) return false;
      }
      if (!_undoBatching) _pushUndo?.();
      const m = new Map(model.materials);
      m.delete(id);
      model.materials = m;
      return true;
    },

    // ─── Section CRUD ───
    addSection(data: Omit<Section, 'id'>): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.section++;
      // Resolve canonical state at creation, the same way `updateSection`
      // does on edit. Without this a freshly added section carries no
      // canonical state at all, and every consumer that asks whether it has
      // known geometry — the detailed stress panel above all — correctly
      // concludes it does not, which reads to the user as "amorphous section"
      // for a perfectly ordinary catalogue profile.
      const created: Section = resolveOnCreate({ id, ...data });
      if (_bulkMutating) {
        model.sections.set(id, created);
      } else {
        const m = new Map(model.sections);
        m.set(id, created);
        model.sections = m;
      }
      return id;
    },

    /**
     * Re-resolve canonical state for every section.
     *
     * The engine initialises asynchronously, so at app start — and for a
     * model loaded before the WASM module is ready — `resolveSectionState`
     * can only report properties-only. Nothing would ever revisit that
     * decision, leaving otherwise fine catalogue profiles permanently without
     * geometry. This is the hook that runs once the engine is up.
     *
     * Idempotent: re-resolving an already-resolved section reproduces the
     * same digest, so calling it more than once is harmless. It deliberately
     * does NOT bump `modelVersion` or fire the mutation hook — deriving
     * geometry is not a model edit and must not invalidate existing results.
     */
    refreshCanonicalSections(): void {
      const updated = refreshCanonicalSectionsImpl(model.sections);
      if (updated) model.sections = updated;
    },

    updateSection(id: number, data: Partial<Omit<Section, 'id'>>): void {
      if (!_undoBatching) _pushUndo?.();
      const sec = model.sections.get(id);
      if (!sec) return;

      // Derived properties of a geometry-backed section are OUTPUTS of its
      // polygons. Letting them be set independently is how geometry and
      // properties came to contradict each other in the first place, so the
      // guard lives here rather than in one table component: no call site can
      // bypass it. Geometry and rotation stay editable, and changing either
      // regenerates the derived values atomically below.
      let patch = data;
      if (sec.canonical?.kind === 'geometry-backed') {
        const { a: _a, iy: _iy, iz: _iz, j: _j, ...rest } = data;
        patch = rest;
      }
      const updated: Section = { ...sec, ...patch, id };
      // Auto-calculate A, Iy, Iz, J from b×h ONLY for manual edits (no shape
      // specified) on sections WITHOUT canonical geometry: on a geometry-backed
      // section the derived values are outputs of the polygons, and writing
      // rectangle-formula numbers over them is how a catalogue IPE ends up
      // displaying a rectangle's area in the table.
      if (data.shape === undefined && sec.canonical?.kind !== 'geometry-backed') {
        const b = data.b ?? sec.b;
        const h = data.h ?? sec.h;
        if (b !== undefined && h !== undefined && b > 0 && h > 0 && (data.b !== undefined || data.h !== undefined)) {
          updated.a = b * h;
          updated.iy = (b * h * h * h) / 12;  // about Y-axis (horizontal) — h³ term
          // Also update iz and j for rectangular sections
          const shape = updated.shape ?? 'rect';
          if (shape === 'rect' || shape === 'generic' || !shape) {
            updated.iz = (h * b * b * b) / 12;  // about Z-axis (vertical) — b³ term
            const long = Math.max(b, h), short = Math.min(b, h);
            const r = short / long;
            updated.j = (1 / 3) * long * short ** 3 * (1 - 0.63 * r + 0.052 * r ** 5);
          }
        }
      }
      // Geometry changed, so the derived state must be regenerated in the same
      // step. Doing it here keeps geometry and properties atomically
      // consistent: there is no window in which a section carries new
      // dimensions and stale canonical values.
      //
      // The exception is a patch that cannot change the resolution: for a
      // geometry-backed section a/iy/iz/j were stripped above, so an empty
      // patch means the edit touched only derived scalars — and re-resolving
      // would run a Saint-Venant mesh-and-solve the table's inline edit could
      // never need.
      const withCanonical =
        Object.keys(patch).length === 0 && sec.canonical ? updated : resolveOnUpdate(updated);
      // Mirror the resolved values back into the declared scalars. Declared
      // values are the designed fallback — engine down, feature-flag rollback,
      // readers that cannot see canonical state — and with the auto-calc guard
      // above nothing else keeps them current on a geometry-backed section.
      const st = withCanonical.canonical;
      if (st?.kind === 'geometry-backed') {
        withCanonical.a = st.a;
        withCanonical.iy = st.iy;
        withCanonical.iz = st.iz;
        if (st.j != null) withCanonical.j = st.j;
      }

      const m = new Map(model.sections);
      m.set(id, withCanonical);
      model.sections = m;
      this.bumpModelVersion();
    },

    removeSection(id: number): boolean {
      for (const elem of model.elements.values()) {
        if (elem.sectionId === id) return false;
      }
      if (!_undoBatching) _pushUndo?.();
      const m = new Map(model.sections);
      m.delete(id);
      model.sections = m;
      return true;
    },

    // ─── Element property updates ───
    updateElementMaterial(elemId: number, materialId: number): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elemId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      plain.materialId = materialId;
      model.elements.set(elemId, plain);
      if (!_bulkMutating) {
        model.elements = new Map(model.elements);
        this.bumpModelVersion();
      }
    },

    updateElementSection(elemId: number, sectionId: number): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elemId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      plain.sectionId = sectionId;
      model.elements.set(elemId, plain);
      if (!_bulkMutating) {
        model.elements = new Map(model.elements);
        this.bumpModelVersion();
      }
    },

    updateElementLocalY(elemId: number, lx: number | undefined, ly: number | undefined, lz: number | undefined): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elemId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      plain.localYx = lx;
      plain.localYy = ly;
      plain.localYz = lz;
      model.elements.set(elemId, plain);
      model.elements = new Map(model.elements);
    },

    rotateElementLocalAxes(elemId: number, angleDelta: number): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elemId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      plain.rollAngle = ((plain.rollAngle ?? 0) + angleDelta) % 360;
      model.elements.set(elemId, plain);
      model.elements = new Map(model.elements);
    },

    /** Set (or clear, when offset is null) the analytical member offset on one element. */
    setElementOffset(elemId: number, offset: MemberOffset | null): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elemId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      if (offset && (offset.i || offset.j)) plain.offset = offset; else delete plain.offset;
      model.elements.set(elemId, plain);
      model.elements = new Map(model.elements);
    },

    /** Batch-apply (or clear) the same offset to many elements in one undo step. */
    setElementsOffset(elemIds: Iterable<number>, offset: MemberOffset | null): void {
      _pushUndo?.();
      for (const id of elemIds) {
        const elem = model.elements.get(id);
        if (!elem) continue;
        const plain = $state.snapshot(elem) as Element;
        if (offset && (offset.i || offset.j)) plain.offset = { frame: offset.frame, ...(offset.i ? { i: { ...offset.i } } : {}), ...(offset.j ? { j: { ...offset.j } } : {}) }; else delete plain.offset;
        model.elements.set(id, plain);
      }
      model.elements = new Map(model.elements);
    },

    // Get node by ID
    getNode(id: number): Node | undefined {
      return model.nodes.get(id);
    },

    // Get element length
    getElementLength(elemId: number): number {
      const elem = model.elements.get(elemId);
      if (!elem) return 0;
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!ni || !nj) return 0;
      const dz = (nj.z ?? 0) - (ni.z ?? 0);
      return Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2 + dz ** 2);
    },

    /** Get angle (radians) of element connected to node. If multiple, returns average.
     *  Angle is measured from positive X axis. 0 = horizontal right, PI/2 = up. */
    getElementAngleAtNode(nodeId: number): number {
      let sumAngle = 0;
      let count = 0;
      for (const elem of model.elements.values()) {
        if (elem.nodeI === nodeId || elem.nodeJ === nodeId) {
          const ni = model.nodes.get(elem.nodeI);
          const nj = model.nodes.get(elem.nodeJ);
          if (!ni || !nj) continue;
          // Angle from the node's perspective (pointing away from the node)
          let angle: number;
          if (elem.nodeI === nodeId) {
            angle = Math.atan2(nj.y - ni.y, nj.x - ni.x);
          } else {
            angle = Math.atan2(ni.y - nj.y, ni.x - nj.x);
          }
          sumAngle += angle;
          count++;
        }
      }
      return count > 0 ? sumAngle / count : 0;
    },
  };
}

export const modelStore = createModelStore();
