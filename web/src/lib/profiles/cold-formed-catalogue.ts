/**
 * The cold-formed C/Z catalogue: a lookup with no table behind it, and a series that ships empty.
 *
 * ══ Two questions, and only one of them needs data ══
 *
 * «Does `C 100x50x15x2.0` resolve?» and «which cold-formed sections can I buy?» look like one
 * question and are not. The first is answered by parsing, because a cold-formed designation IS
 * its own specification (see `cold-formed.ts`). The second needs a sourced list of what mills
 * actually roll — a commercial fact this repository does not have.
 *
 * So this module answers the first unconditionally and the second honestly:
 *
 *   · `byId()` resolves ANY valid designation, with no catalogue consulted. A saved project
 *     opens, an id round-trips, and a section drawn last year still draws — none of it
 *     contingent on a table arriving.
 *   · `list()` returns the SOURCED series, which is currently empty, and `seriesStatus()` says
 *     why in a form a UI can show. **No rows are invented to make a picker look populated.**
 *
 * ══ Why the series is injected ══
 *
 * `createColdFormedSource(series)` takes the series as a parameter, the same seam
 * `GradeFamilyLookup` uses for grade families. Three things follow, and the third is the reason:
 *
 *   1. the shipped source is built on `NO_SOURCED_SERIES` and is therefore honest by
 *      construction — there is no row list in this file to drift;
 *   2. a project's own section library, or a mill's catalogue, plugs in without this module
 *      learning about either;
 *   3. **the filters are exercised for real.** Query logic tested only against an empty series
 *      is untested query logic that reports success. `cold-formed-resolution.test.ts` injects a
 *      series and drives every filter through it, so the day a sourced list lands, the picker
 *      already works and this file does not change.
 */

import {
  coldFormedGeometry, formatColdFormedDesignation, parseColdFormedDesignation,
  type ColdFormedShape, type ColdFormedSpec,
} from './cold-formed';

/**
 * The family ids these sections carry in `Section.profileFamily`.
 *
 * `CFC`/`CFZ` rather than `C`/`Z`, because `C` is already taken — by the American HOT-ROLLED
 * channel series in `iram-c.ts` (IRAM-IAS U 500-509-4). Those are a different product governed
 * by a different code, and a shared id would silently merge them in every family filter and
 * every saved model. The `CF` prefix is this module's own; nothing normative names it.
 */
export const COLD_FORMED_FAMILIES = { C: 'CFC', Z: 'CFZ' } as const;
export type ColdFormedFamily = (typeof COLD_FORMED_FAMILIES)[ColdFormedShape];

/**
 * A resolved cold-formed section, in the units the rest of the app stores.
 *
 * Deliberately NOT `ProfileEntry`. That type is built for a tabulated family: it carries
 * `standard`, `standardsBody`, `fidelity` and `massKgPerM` as facts read off a published table,
 * and `GeometryFidelity`'s three values (`exact`, `nominalDimensions`, `propertiesOnly`) all
 * presuppose that a table exists to be faithful to. There is no value meaning "the outline is
 * exact and the properties are derived from it", which is what a cold-formed section is — so
 * filing one under `exact` («verified against published data») would be a claim about data that
 * does not exist.
 *
 * Kept structurally close to `ProfileEntry` so a future unification is a rename and not a
 * redesign. What that unification needs is written down in the limits handoff, not guessed here.
 */
export interface ColdFormedEntry {
  /** The designation, which is both the display name and the stored id. */
  id: string;
  family: ColdFormedFamily;
  shape: ColdFormedShape;
  spec: ColdFormedSpec;
  heightMm: number;
  widthMm: number;
  thicknessMm: number;
  /** Derived from the geometry, never read from a table. Areas cm², inertias cm⁴. */
  areaCm2: number;
  iyCm4: number;
  izCm4: number;
  /** Zero for a C, nonzero for a Z. The app has nowhere to store it — see the limits handoff. */
  ixyCm4: number;
  jCm4: number;
  massKgPerM: number;
  /**
   * Degrees from the geometric axes to the nearer principal axis. Zero for a C.
   *
   * On the entry rather than left in the geometry module because a picker showing a Z has to be
   * able to say that its axes are rotated. A number a UI cannot reach is a number a UI will not
   * mention.
   */
  principalAngleDeg: number;
}

/**
 * Every quantity on an entry is derived, so its provenance is one word for the whole row.
 *
 * Named as a constant rather than written into each entry because there is nothing to
 * distinguish: unlike a tabulated family, where one column can be published and the next
 * inverted from it, here the geometry is the only input and everything follows from it.
 * `derivedFromGeometry` is the same basis vocabulary `profiles/properties.ts` uses.
 */
export const COLD_FORMED_BASIS = 'derivedFromGeometry' as const;

/**
 * The sourced dimension series — **empty, deliberately**.
 *
 * What would go here is the list of (depth, flange, lip, thickness) combinations a mill rolls.
 * It is not in this repository, it is not in any standard shipped under `docs/codes/`, and it is
 * not being reconstructed from memory: a series list that looks plausible and is not sourced is
 * worse than an empty one, because a user cannot tell it apart from a real catalogue.
 *
 * The type is the whole interface a sourced series has to satisfy, so supplying one later is a
 * data commit and not a design change.
 */
export const NO_SOURCED_SERIES: readonly ColdFormedSpec[] = Object.freeze([]);

/** Why `list()` came back empty, so a picker can say something true instead of showing nothing. */
export type ColdFormedSeriesStatus =
  | { available: false; reason: 'noSourcedSeries' }
  | { available: true; count: number };

export interface ColdFormedQuery {
  /** Matched against the designation, case- and space-insensitively. */
  text?: string;
  /** Empty or absent means both shapes. */
  shapes?: readonly ColdFormedShape[];
  /** Depth bounds in mm, inclusive. Either end may be omitted. */
  heightMinMm?: number;
  heightMaxMm?: number;
  /** Sheet thickness bounds in mm, inclusive — the axis a cold-formed section is chosen on. */
  thicknessMinMm?: number;
  thicknessMaxMm?: number;
}

export interface ColdFormedSource {
  /** The sourced series, filtered. Empty whenever nothing is sourced. */
  list(query?: ColdFormedQuery): ColdFormedEntry[];
  /**
   * Resolve a designation. Independent of the series: a stored id must open whether or not the
   * section it names is in anyone's current catalogue.
   */
  byId(id: string): ColdFormedEntry | null;
  /** Resolve a spec directly, for a caller that already parsed or built one. */
  bySpec(spec: ColdFormedSpec): ColdFormedEntry | null;
  /** Whether there is a series at all, and why not. */
  seriesStatus(): ColdFormedSeriesStatus;
  families(): readonly ColdFormedFamily[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** mm⁴ → cm⁴ and mm² → cm², the units the catalogue's other families are tabulated in. */
const MM4_TO_CM4 = 1e-4;
const MM2_TO_CM2 = 1e-2;

/** Build an entry from a spec, or null if the spec cannot be bent. */
function entryOf(spec: ColdFormedSpec): ColdFormedEntry | null {
  const g = coldFormedGeometry(spec);
  if (!g) return null;
  return {
    id: formatColdFormedDesignation(spec),
    family: COLD_FORMED_FAMILIES[spec.shape],
    shape: spec.shape,
    spec,
    heightMm: spec.hMm,
    widthMm: spec.bMm,
    thicknessMm: spec.tMm,
    areaCm2: g.areaMm2 * MM2_TO_CM2,
    iyCm4: g.iyMm4 * MM4_TO_CM4,
    izCm4: g.izMm4 * MM4_TO_CM4,
    ixyCm4: g.ixyMm4 * MM4_TO_CM4,
    jCm4: g.jMm4 * MM4_TO_CM4,
    massKgPerM: g.massKgPerM,
    principalAngleDeg: g.principalAngleDeg,
  };
}

function matches(e: ColdFormedEntry, q: ColdFormedQuery): boolean {
  if (q.text && !norm(e.id).includes(norm(q.text))) return false;
  if (q.shapes?.length && !q.shapes.includes(e.shape)) return false;
  if (q.heightMinMm != null && e.heightMm < q.heightMinMm) return false;
  if (q.heightMaxMm != null && e.heightMm > q.heightMaxMm) return false;
  if (q.thicknessMinMm != null && e.thicknessMm < q.thicknessMinMm) return false;
  if (q.thicknessMaxMm != null && e.thicknessMm > q.thicknessMaxMm) return false;
  return true;
}

/**
 * A source over a given series.
 *
 * Invalid specs in the series are dropped at construction rather than at query time, so a bad
 * row cannot make a filter behave differently from one call to the next.
 */
export function createColdFormedSource(series: readonly ColdFormedSpec[]): ColdFormedSource {
  const entries = series.map(entryOf).filter((e): e is ColdFormedEntry => e !== null);
  // Deepest first, then by thickness — the order a person scans a purlin table in.
  entries.sort((a, b) => a.heightMm - b.heightMm || a.thicknessMm - b.thicknessMm
    || a.id.localeCompare(b.id));

  return {
    list(query) {
      return query ? entries.filter((e) => matches(e, query)) : [...entries];
    },
    byId(id) {
      const spec = parseColdFormedDesignation(id);
      return spec ? entryOf(spec) : null;
    },
    bySpec(spec) {
      return entryOf(spec);
    },
    seriesStatus() {
      return entries.length === 0
        ? { available: false, reason: 'noSourcedSeries' }
        : { available: true, count: entries.length };
    },
    families() {
      return [COLD_FORMED_FAMILIES.C, COLD_FORMED_FAMILIES.Z];
    },
  };
}

/** The shipped source. Resolves any designation; lists nothing, because nothing is sourced. */
export const coldFormedSource: ColdFormedSource = createColdFormedSource(NO_SOURCED_SERIES);

// ───────────────────────── the model boundary ─────────────────────────

/**
 * The fields a `Section` needs to carry a cold-formed profile. **SI units** — metres, m², m⁴.
 *
 * Field meanings follow the lipped channel the app already stores, because a Z is the same five
 * plates in a different arrangement: `t` is the lip LENGTH and `tl` the sheet thickness, while
 * `tw` and `tf` are that same thickness. Mirroring `'C'` exactly is what lets `createSectionShape`
 * draw a Z from the fields it already reads.
 *
 * ── What is deliberately NOT written ──
 *
 * No `built`. That field records a `SECTION_SHAPES` template id and the parameters typed into it,
 * and there is no cold-formed template — writing `shapeType: 'C-custom'` would be the same
 * species of lie as a fabricated `composition`. None is needed either: the designation in `name`
 * IS the parameter record, which is the point of a parametric family.
 *
 * No `composition`. `profileName` is documented as an exact catalogue name and this section has
 * no catalogue part.
 *
 * No `ixy`. There is nowhere to put it, which for a Z is a real limitation and not an omission —
 * see `docs/handoffs/m2-cold-formed-limits.md`.
 */
export interface ColdFormedSectionFields {
  name: string;
  shape: 'C' | 'Z';
  a: number;
  iy: number;
  iz: number;
  j: number;
  b: number;
  h: number;
  tw: number;
  tf: number;
  /** Lip LENGTH, matching the `'C'` convention. */
  t: number;
  /** Sheet thickness. */
  tl: number;
  profileFamily: ColdFormedFamily;
}

const MM_TO_M = 1e-3;
const CM2_TO_M2 = 1e-4;
const CM4_TO_M4 = 1e-8;

/** Convert an entry into the section fields the store holds. */
export function coldFormedSectionFields(e: ColdFormedEntry): ColdFormedSectionFields {
  const { hMm, bMm, cMm, tMm } = e.spec;
  return {
    name: e.id,
    shape: e.shape,
    a: e.areaCm2 * CM2_TO_M2,
    iy: e.iyCm4 * CM4_TO_M4,
    iz: e.izCm4 * CM4_TO_M4,
    j: e.jCm4 * CM4_TO_M4,
    b: bMm * MM_TO_M,
    h: hMm * MM_TO_M,
    tw: tMm * MM_TO_M,
    tf: tMm * MM_TO_M,
    t: cMm * MM_TO_M,
    tl: tMm * MM_TO_M,
    profileFamily: e.family,
  };
}

/**
 * Whether a stored section is a cold-formed profile.
 *
 * Answered from the NAME, because in a parametric family the name is the specification — so
 * recognising one costs a parse and no lookup, and keeps working for a model saved before any
 * series was sourced. The family id is accepted as a second route for a section whose name a
 * user has since edited.
 *
 * This is what lets `steel-inventory.ts` say WHY a cold-formed member cannot be verified without
 * that module learning anything about cold-formed geometry.
 */
export function isColdFormedSection(sec: { name?: string; profileFamily?: string } | undefined | null): boolean {
  if (!sec) return false;
  if (sec.profileFamily === COLD_FORMED_FAMILIES.C || sec.profileFamily === COLD_FORMED_FAMILIES.Z) return true;
  return sec.name != null && parseColdFormedDesignation(sec.name) !== null;
}
