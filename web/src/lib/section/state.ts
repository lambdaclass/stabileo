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
import { isSolverReady, hasCanonicalGeometryExport, analyzeSectionTorsion } from '../engine/wasm-solver';
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
    source: 'declared',
  };
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
