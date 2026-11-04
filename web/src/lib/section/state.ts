/**
 * state.ts — solver-ready canonical section state.
 *
 * # Why this layer exists
 *
 * `buildSolverInput2D/3D` is synchronous and runs on every solve. Canonical
 * geometry lives in Rust behind a WASM call. Calling into WASM from inside
 * solver preparation would either make that path async — rippling through
 * every caller — or risk publishing whatever the call happened to return.
 *
 * So resolution happens at the *edges*: when a section is created, chosen from
 * the catalogue, edited, migrated or loaded. The validated result is stored on
 * the section atomically, and `buildSolverInput` only ever reads it.
 *
 * The stored state is a cache with an integrity field: `digest` identifies the
 * exact geometry it was derived from, so a consumer can prove the numbers it
 * is using and the outline it is drawing describe the same section.
 *
 * # Torsion
 *
 * `J` is deliberately NOT taken from the polygon engine. That engine computes
 * `J` by Routh's approximation, which is exact for a circle or ellipse and
 * materially wrong otherwise — measured, 56.9 % low on a rectangle and 37.0 %
 * high on an I-section. Feeding it into 3D global stiffness would be worse
 * than the declared value it replaced. Every `J` therefore carries provenance,
 * and a non-circular section keeps its authoritative or legacy value until
 * Checkpoint 2C computes a validated Saint-Venant constant.
 */

import type { Section } from '../store/model.svelte';
import { ALL_PROFILES } from '../data/steel-profiles';
import { resolveCanonicalSection, catalogueOutline, type PropertiesOnlyReason } from './canonical';
import { analyzeDrawn } from './drawn-properties';
import type { CanonicalGeometry } from '../engine/wasm-solver';
import { isSolverReady, hasCanonicalGeometryExport, analyzeSectionTorsion, analyzeSectionShear, analyzeSectionPlastic } from '../engine/wasm-solver';
import { canonicalSections } from '../features';
import { CANONICAL_STATE_VERSION } from './version';

/** Where a torsional constant came from. Never inferred, never fabricated. */
export type TorsionProvenance =
  /** Closed-form exact for this shape: circle and CHS only. */
  | 'exactAnalytical'
  /** Published catalogue value carried on the profile. */
  | 'catalogue'
  /** Value declared in a saved file or by the user. */
  | 'legacy'
  /** Computed by the arbitrary-section warping solver. Reserved for 2C. */
  | 'saintVenant'
  /** No trustworthy value exists. 3D torsional stiffness must not proceed. */
  | 'unavailable';

/** Canonical state cached on a section for synchronous solver reads. */
export interface CanonicalSectionState {
  kind: 'geometry-backed';
  /** Schema version of the canonical geometry this was derived from. */
  version: number;
  digest: string;
  /** The geometry itself, so the drawing consumes exactly these polygons. */
  geometry: CanonicalGeometry;
  /** Derived properties. Outputs of the geometry, never independently edited. */
  a: number;
  yc: number;
  zc: number;
  iy: number;
  iz: number;
  iyz: number;
  i1: number;
  i2: number;
  thetaP: number;
  /** Torsional constant and where it came from. `null` means unavailable. */
  j: number | null;
  jProvenance: TorsionProvenance;
  /**
   * Shear centre, centroid-relative, in the section's own (unrotated) frame: `[y, z]`, y across
   * the width, z up the depth — the frame `iy` and `iz` are in. Solved on the section's mesh in
   * the same pass as `j`. `undefined`: that pass has not run; `null`: it found none (a composite
   * section, or the solve failed). See `sectionWarping`.
   */
  shearCentre?: [number, number] | null;
  /**
   * Warping constant Cw, m⁶, about the shear centre, from the same pass. Zero for a closed
   * section (the engine declines one, and a closed cell's Cw is negligible), `null` when
   * unknown.
   */
  cw?: number | null;
  /** Several materials: transformed properties, and no homogeneous stress field. */
  composite?: true;
}

export interface PropertiesOnlyState {
  kind: 'properties-only';
  reason: PropertiesOnlyReason;
  /** Declared values that keep the section globally solvable. */
  a: number;
  iy?: number;
  iz: number;
  j?: number;
  jProvenance: TorsionProvenance;
}

export type SectionState = CanonicalSectionState | PropertiesOnlyState;

/**
 * True when the resolved geometry is a circle or a circular tube.
 *
 * Read from the geometry's own provenance rather than from the section's name
 * or fields, so a renamed profile and a catalogue one are judged identically
 * and a section without local dimensions is still recognised.
 */
function isCircularFamily(source: Record<string, unknown> | undefined): boolean {
  const shape = source?.shape;
  return shape === 'chs' || shape === 'circle';
}

/**
 * A circle's or circular tube's area and second moments in closed form, from its radii.
 *
 * The engine polygonises the boundary, and a chord-sided disc is short of the disc: measured 0.07 %
 * on A and 0.14 % on I and J at the engine's density. Small, but it put a J labelled exact 0.14 %
 * under πd⁴/32. The polygon's vertices lie on the true circles, so the radii are read off them and
 * the shape's own formulas used. Null when the outline is not one ring of a solid and at most one
 * void, which leaves the polygon's numbers.
 */
function exactCircular(geometry: CanonicalGeometry, yc: number, zc: number): { a: number; iy: number; iz: number; iyz: number; i1: number; i2: number } | null {
  const solids = geometry.polygons.filter((q) => !q.isVoid);
  const voids = geometry.polygons.filter((q) => q.isVoid);
  if (solids.length !== 1 || voids.length > 1) return null;
  const radius = (vs: Array<[number, number]>) => vs.reduce((m, v) => Math.max(m, Math.hypot(v[0] - yc, v[1] - zc)), 0);
  const ro = radius(solids[0]!.vertices);
  const ri = voids[0] ? radius(voids[0].vertices) : 0;
  if (!(ro > ri) || !Number.isFinite(ro)) return null;
  const i = (Math.PI * (ro ** 4 - ri ** 4)) / 4;
  return { a: Math.PI * (ro ** 2 - ri ** 2), iy: i, iz: i, iyz: 0, i1: i, i2: i };
}

/**
 * Torsional constant plus provenance, honouring the Routh prohibition.
 *
 * The ONLY geometry-derived case is the circular family, where the torsional
 * constant equals the polar second moment exactly: `J = Iy + Iz`. That
 * identity holds for circles and circular tubes and for nothing else, which is
 * precisely why no other shape may derive `J` from its polygons — the engine's
 * `J` there is Routh's approximation, measured 56.9 % low on a rectangle.
 */
function resolveTorsion(
  sec: Section,
  circular: { iy: number; iz: number } | null,
  geometry: CanonicalGeometry | null,
  digest?: string,
): { j: number | null; jProvenance: TorsionProvenance } {
  if (circular) {
    const j = circular.iy + circular.iz;
    if (Number.isFinite(j) && j > 0) return { j, jProvenance: 'exactAnalytical' };
  }
  if (sec.j != null && Number.isFinite(sec.j) && sec.j > 0) {
    // Preserve whatever the section already carried. A tabulated value is
    // NORMATIVE — it is the number a designer reconciles against — so it wins
    // over a computed one even though Saint-Venant is more fundamental.
    return { j: sec.j, jProvenance: sec.name ? 'catalogue' : 'legacy' };
  }
  if (geometry) {
    // Saint-Venant, solved on the section's own mesh. This is what retires the
    // `Iz * 0.001` placeholder for every shape without a published constant:
    // an open profile's J is dominated by its thinnest plate and no closed
    // form covers arbitrary outlines. Verified against the CIRSOC tables to
    // within a few percent, where Routh's approximation was 37-57 % out.
    //
    // Closed sections are handled too: the hole constants come from Bredt's
    // circulation condition, so a tube is not silently treated as if it were
    // slit — which would understate its J by more than a hundredfold.
    //
    // Solved once per geometry digest and cached: the solve depends only on
    // the geometry, but re-resolutions for reasons that leave the geometry
    // untouched (a rename, a refresh pass) used to pay the mesh-and-solve
    // every time.
    try {
      let j: number | null | undefined = digest ? torsionJCache.get(digest) : undefined;
      if (j === undefined) {
        const r = analyzeSectionTorsion({ geometry });
        j = Number.isFinite(r.j) && r.j > 0 ? r.j : null;
        if (digest) {
          if (torsionJCache.size >= TORSION_CACHE_LIMIT) {
            // Map iterates in insertion order, so the first key is the oldest.
            torsionJCache.delete(torsionJCache.keys().next().value!);
          }
          torsionJCache.set(digest, j);
        }
      }
      if (j != null) return { j, jProvenance: 'saintVenant' };
    } catch {
      // Multiply-connected, degenerate mesh, or engine not ready — all mean
      // "no trustworthy constant", which is what `unavailable` says. Not
      // cached: a throw can be transient (engine still warming up), and the
      // next resolve must be free to retry.
    }
  }
  return { j: null, jProvenance: 'unavailable' };
}

/**
 * Shear centre and warping constant of a geometry, solved on its own mesh.
 *
 * What the 3D geometric stiffness needs besides `J` (#439): the shear-centre offset gives a
 * channel, tee or angle its flexural-torsional coupling, and `Cw` the warping term of the
 * torsional buckling load (GJ + π²ECw/L²)/r0². Both come from the engine's section solvers —
 * the shear solve places the shear centre, the warping solve (about that pole) gives `Cw` — so
 * a catalogue, parametric or drawn outline is treated alike, fillets included. Closed-form
 * values (`warping.ts`, `section-constants.ts`) are thin-wall theory and, for a rolled channel,
 * some 15 % high on `Cw`, which is the unconservative side here.
 *
 * Offsets below 1e-4·√A are the mesh's round-off on a symmetric section and are set to zero:
 * a doubly symmetric section must not carry a 1e-12 m offset, which the co-rotational solver
 * refuses outright. A closed section has no `Cw` from the engine; it is negligible and reported
 * as 0. A composite (several materials) section has neither: its shear centre is modulus
 * weighted, which these solvers are not.
 */
export function sectionWarping(
  geometry: CanonicalGeometry,
  area: number,
  digest?: string,
): { shearCentre: [number, number]; cw: number } | null {
  const key = digest ? `warp:${digest}` : undefined;
  const hit = key ? warpingCache.get(key) : undefined;
  if (hit !== undefined) return hit && { shearCentre: [...hit.shearCentre] as [number, number], cw: hit.cw };
  let out: { shearCentre: [number, number]; cw: number } | null = null;
  // Separate pieces (a battened pair, two loose plates) have no single shear centre the
  // member's twist can be taken about.
  if (geometry.polygons.filter((q) => !q.isVoid).length !== 1) return null;
  try {
    const sc = analyzeSectionShear({ geometry }).shearCentre;
    const tol = 1e-4 * Math.sqrt(Math.max(area, 0));
    const snap = (v: number) => (Math.abs(v) < tol ? 0 : v);
    let cw = 0;
    try {
      const w = analyzeSectionPlastic({ geometry }).cw;
      cw = w != null && Number.isFinite(w) && w > 0 ? w : 0;
    } catch { cw = 0; }
    if (Number.isFinite(sc[0]) && Number.isFinite(sc[1])) out = { shearCentre: [snap(sc[0]), snap(sc[1])], cw };
  } catch {
    // No shear solve (engine not ready, degenerate mesh): not cached, the next resolve retries.
    return null;
  }
  if (key) {
    if (warpingCache.size >= TORSION_CACHE_LIMIT) warpingCache.delete(warpingCache.keys().next().value!);
    warpingCache.set(key, out);
  }
  return out;
}

const warpingCache = new Map<string, { shearCentre: [number, number]; cw: number } | null>();

/** A cached J is one number; 32 entries is nothing. */
const TORSION_CACHE_LIMIT = 32;
const torsionJCache = new Map<string, number | null>();

/**
 * Resolve a section to solver-ready state.
 *
 * Call this whenever a section is created, edited, chosen from the catalogue,
 * migrated or loaded — never from inside solver preparation.
 *
 * When the engine is not initialised this returns properties-only rather than
 * throwing or publishing unverified numbers: an un-analysed section is exactly
 * a section whose geometry is unknown.
 */
export interface ResolveOptions {
  /**
   * Solve Saint-Venant torsion when no published constant exists.
   *
   * Off by default, and that default is a performance decision with teeth:
   * torsion meshes the section and solves a linear system, which costs
   * milliseconds. That is nothing for the handful of sections in a model, and
   * unacceptable for the seven hundred in the catalogue picker, which resolves
   * every profile just to draw a thumbnail. Callers that own model sections
   * pass `true`; callers that browse pass nothing.
   */
  torsion?: boolean;
}

export function resolveSectionState(sec: Section, opts: ResolveOptions = {}): SectionState {
  // Three independent reasons to stay properties-only, in order of precedence:
  //
  // 1. The feature flag is off (field rollback without a redeploy).
  // 2. The solver is not ready (tests, SSR, or a cold start).
  // 3. The WASM build predates the section engine (no export to call).
  //
  // In every case the section keeps its declared A/I/J and the solver path is
  // unaffected — only detailed stress and drawing are gated.
  if (!canonicalSections() || !isSolverReady() || !hasCanonicalGeometryExport()) {
    const torsion = resolveTorsion(sec, null, null);
    return {
      kind: 'properties-only',
      reason: { kind: 'noGeometry' },
      a: sec.a,
      iy: sec.iy,
      iz: sec.iz,
      j: sec.j,
      jProvenance: torsion.jProvenance,
    };
  }

  const resolved = resolveCanonicalSection(sec);
  if (resolved.state === 'properties-only') {
    const torsion = resolveTorsion(sec, null, null);
    return {
      kind: 'properties-only',
      reason: resolved.reason,
      a: resolved.declared.a,
      iy: resolved.declared.iy,
      iz: resolved.declared.iz,
      j: resolved.declared.j,
      jProvenance: torsion.jProvenance,
    };
  }

  const circle = isCircularFamily(resolved.geometry.source)
    ? exactCircular(resolved.geometry, resolved.properties.yc, resolved.properties.zc)
    : null;
  const p = circle ? { ...resolved.properties, ...circle } : resolved.properties;
  const torsion = sec.drawn
    ? drawnTorsion(sec, opts.torsion === true, resolved.digest)
    : resolveTorsion(
      sec,
      isCircularFamily(resolved.geometry.source) ? { iy: p.iy, iz: p.iz } : null,
      opts.torsion ? resolved.geometry : null,
      resolved.digest,
    );
  // Shear centre and Cw, with the torsion pass (they cost a mesh solve each). A circle or tube
  // is doubly symmetric and closed; a composite section has no homogeneous shear centre.
  const warping = !opts.torsion
    ? undefined
    : circle || isCircularFamily(resolved.geometry.source)
      ? { shearCentre: [0, 0] as [number, number], cw: 0 }
      : resolved.composite
        ? null
        : sectionWarping(resolved.geometry, p.a, resolved.digest);
  return {
    kind: 'geometry-backed',
    // The persisted-state version, not the geometry wire version: this is what
    // `migration.ts` checks when deciding whether it can interpret a file.
    version: CANONICAL_STATE_VERSION,
    digest: resolved.digest,
    geometry: resolved.geometry,
    a: p.a,
    yc: p.yc,
    zc: p.zc,
    iy: p.iy,
    iz: p.iz,
    iyz: p.iyz,
    i1: p.i1,
    i2: p.i2,
    thetaP: p.thetaP,
    ...torsion,
    ...(warping === undefined ? {} : { shearCentre: warping?.shearCentre ?? null, cw: warping?.cw ?? null }),
    ...(resolved.composite ? { composite: true as const } : {}),
  };
}

/**
 * A drawn section's torsion constant: Saint-Venant on each connected piece, summed.
 *
 * Never the stored `j` when this drawing has been solved: that answer, a failure included, is
 * the drawing's. Without the torsion pass (a browsing caller) and no solve on record, the stored
 * value stands in, marked as computed, because the only writers of `j` on a drawn section are this
 * analysis and the store mirroring it — which writes none when the analysis found none.
 */
function drawnTorsion(sec: Section, solve: boolean, digest: string): { j: number | null; jProvenance: TorsionProvenance } {
  // The ratios of the parts' materials belong in the key: the geometry digest has none, so a
  // material's E or ν edited after the section was drawn kept the J of the old ratios.
  const key = `drawn:${digest}:${sec.drawn!.parts.map((p) => (p.ratio ? `${p.ratio.e},${p.ratio.g}` : '1')).join(';')}`;
  let j = torsionJCache.get(key);
  if (!solve && j === undefined) {
    return sec.j != null && sec.j > 0 ? { j: sec.j, jProvenance: 'saintVenant' } : { j: null, jProvenance: 'unavailable' };
  }
  if (j === undefined) {
    try {
      j = analyzeDrawn(sec.drawn!, catalogueOutline).properties?.j ?? null;
    } catch {
      return { j: null, jProvenance: 'unavailable' };
    }
    if (torsionJCache.size >= TORSION_CACHE_LIMIT) torsionJCache.delete(torsionJCache.keys().next().value!);
    torsionJCache.set(key, j);
  }
  return j != null ? { j, jProvenance: 'saintVenant' } : { j: null, jProvenance: 'unavailable' };
}

/**
 * Properties the global solver should use, read synchronously.
 *
 * Geometry-backed sections report their canonical values; properties-only
 * sections report what they declared. Nothing here falls back from one to the
 * other — a stale or absent canonical state means the declared values are
 * used, and the caller can see which by the `source` field.
 */
export function solverProperties(sec: Section): {
  a: number;
  /** Second moment about the section's horizontal axis. */
  iy: number;
  /** Second moment about the section's vertical axis. */
  iz: number;
  iyz: number;
  j: number | null;
  jProvenance: TorsionProvenance;
  /**
   * Shear centre `[y, z]` from the centroid, m, in the frame of `iy`/`iz`; `null` when the
   * section is known to be mono- or asymmetric and nothing placed it (see `shearCentreOf`).
   */
  shearCentre: [number, number] | null;
  /** Warping constant, m⁶; `null` when unknown. */
  cw: number | null;
  source: 'canonical' | 'declared';
  digest?: string;
} {
  const st = sec.canonical;
  if (st && st.kind === 'geometry-backed') {
    return {
      a: st.a,
      iy: st.iy,
      iz: st.iz,
      iyz: st.iyz,
      j: st.j,
      jProvenance: st.jProvenance,
      shearCentre: st.shearCentre !== undefined ? st.shearCentre : shearCentreOf(sec),
      cw: st.cw !== undefined ? st.cw : declaredCw(sec),
      source: 'canonical',
      digest: st.digest,
    };
  }
  const torsion = resolveTorsion(sec, null, null);
  return {
    a: sec.a,
    iy: sec.iy ?? sec.iz,
    iz: sec.iz,
    iyz: 0,
    j: torsion.j,
    jProvenance: torsion.jProvenance,
    shearCentre: shearCentreOf(sec),
    cw: declaredCw(sec),
    source: 'declared',
  };
}

/** Shapes whose shear centre is the centroid: two axes of symmetry, or point symmetry (Z). */
const CENTRED_SHAPES = new Set(['I', 'H', 'RHS', 'CHS', 'rect', 'Z']);
/** Shapes with one axis of symmetry or none: their shear centre is off the centroid. */
const OFFSET_SHAPES = new Set(['T', 'U', 'C', 'L', 'invL']);

/**
 * The shear centre of a section with no solved geometry, from its shape alone.
 *
 * At the centroid for a doubly or point symmetric shape. Unknown (`null`) for a tee, channel or
 * angle: placing it would need the outline, and taking the centroid would drop the
 * flexural-torsional coupling that governs those sections — the analyses that need it refuse
 * instead (`torsionGaps3D`). A section stated by its properties only, with no shape, is taken as
 * symmetric: that is all its A, Iy, Iz and J describe, and the engine has always read it so.
 */
function shearCentreOf(sec: Section): [number, number] | null {
  if (sec.shape && OFFSET_SHAPES.has(sec.shape)) return null;
  if (!sec.shape || sec.shape === 'generic' || CENTRED_SHAPES.has(sec.shape)) return [0, 0];
  return null;
}

/**
 * Cw of a section with no solved geometry: an I or H from its weak-axis inertia and flange
 * spacing, `Iz·(h − tf)²/4`, which is exact for a doubly symmetric I (AISC Design Guide 9,
 * eq. 3.5); zero for a tube; unknown otherwise. Unknown only leaves the warping term out of the
 * torsional buckling load, which is the conservative side.
 */
function declaredCw(sec: Section): number | null {
  if ((sec.shape === 'I' || sec.shape === 'H') && sec.h && sec.tf && sec.h > 2 * sec.tf && sec.iz > 0) {
    return (sec.iz * (sec.h - sec.tf) ** 2) / 4;
  }
  if (sec.shape === 'RHS' || sec.shape === 'CHS') return 0;
  return null;
}

/** Deep clone of canonical state, so tabs and copies never share arrays. */
export function cloneSectionState(st: SectionState | undefined): SectionState | undefined {
  if (!st) return undefined;
  if (st.kind === 'properties-only') return { ...st, reason: { ...st.reason } };
  return {
    ...st,
    geometry: {
      ...st.geometry,
      source: { ...st.geometry.source },
      polygons: st.geometry.polygons.map((p) => ({
        ...p,
        vertices: p.vertices.map((v) => [v[0], v[1]] as [number, number]),
      })),
    },
  };
}

/**
 * How far a geometry-backed section's derived properties sit from the values
 * its catalogue row publishes.
 *
 * For nine of the ten families this is table rounding and nothing else. For W
 * it is real and worth showing: those tables mark their dimensions "nominal"
 * and derive the tabulated area from nominal mass, so dimensions and
 * properties are mutually inconsistent in the SOURCE and no outline can
 * satisfy both. Rather than pick one silently, the app analyses the geometry —
 * which keeps the drawing, the stress field and the numbers consistent with
 * each other — and reports the gap against the table so a user reconciling
 * against CIRSOC sees it instead of discovering it.
 *
 * Returns `null` when there is nothing to compare or the gap is negligible.
 */
export function propertyDeviation(
  sec: Section,
): { a: number; iy: number; iz: number; worst: number } | null {
  const st = sec.canonical;
  if (!st || st.kind !== 'geometry-backed' || !sec.name) return null;
  const p = ALL_PROFILES.find((x) => x.name.trim().toUpperCase() === sec.name.trim().toUpperCase());
  if (!p) return null;

  // Catalogue units are cm² and cm⁴; canonical state is SI.
  const rel = (got: number, want: number) => (want === 0 ? 0 : (got - want) / want);
  const a = rel(st.a * 1e4, p.a);
  const iy = rel(st.iy * 1e8, p.iy);
  const iz = rel(st.iz * 1e8, p.iz);
  const worst = Math.max(Math.abs(a), Math.abs(iy), Math.abs(iz));
  // Below one percent is the rounding of a three-significant-figure table, not
  // a discrepancy worth putting in front of anyone.
  return worst < 0.01 ? null : { a, iy, iz, worst };
}
