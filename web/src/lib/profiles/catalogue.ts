/**
 * The profile catalogue, as a source something else can consume.
 *
 * ── Why this layer exists ──────────────────────────────────────────
 *
 * `lib/data/steel-profiles.ts` is a set of tables and a couple of helpers. Every surface that
 * wanted profiles reached into it directly and rebuilt the same three things by hand: a
 * flattened list, a family grouping, and a substring search. The generator's picker did it
 * with a `<select>` carrying 100+ `<option>`s across 15 `<optgroup>`s, which is the control
 * this module exists to replace.
 *
 * A general PRO section picker is coming, and it must not be a second implementation of the
 * same three things. So the shape here is a SOURCE — query in, entries out — and the UI holds
 * a `ProfileSource`, not the tables. When the general picker lands it either uses this source
 * or supplies its own, and the generator does not change either way.
 *
 * ── The identifier ────────────────────────────────────────────────
 *
 * `ProfileId` is the catalogue NAME, unchanged. That is not laziness: `ProfileSpec.profileName`
 * already stores it, `resolveProfile` and `findProfile` already look up by it, and it is what
 * lands in a saved `.ded`. Minting a new id here would mean either migrating every stored
 * model or keeping two identifiers for one thing. The name is the id, and the id is stable.
 *
 * What is NOT allowed is a display string standing in for it. `"IPE 200 · 22.4 kg/m"` is a
 * label; the moment a label is stored, changing the label breaks the file.
 *
 * ── What this module does not do ──────────────────────────────────
 *
 * It does not resolve geometry, compose built-up sections or decide arrangements. Those live
 * in `generators/profile-resolve.ts` and `generators/built-up-section.ts` and stay there: this
 * is a catalogue, not an engine.
 */

import {
  ALL_PROFILES, PROFILE_FAMILIES, FAMILY_LIST, familyToShape,
  type ProfileFamily, type SectionShape, type SteelProfile,
} from '../data/steel-profiles';
import {
  FAMILY_CLASSIFICATION, DESIGN_CODES, familiesForCode,
  type FamilyClassification, type SectionSeries, type GeometryFidelity,
} from '../data/section-catalog';

/** The catalogue name. What the model stores, and what `resolveProfile` looks up. */
export type ProfileId = string;

/**
 * The standards axis is NOT defined here.
 *
 * An earlier version of this module carried its own `FAMILY_STANDARD` map with three values —
 * `euronorm`, `iram`, `mixed`. `section-catalog.ts` already had the real thing and had already
 * outgrown it: the specific dimensional standard per family (`EN 10365`, `DIN 1025-1`,
 * `IRAM-IAS U 500-215-6`), the body that publishes it, the country, hot-rolled against
 * cold-formed, the series, and how faithfully the app can draw the outline. Its own comment
 * records that `standard` "used to read 'Euronorm' for all eight, which was a placeholder" —
 * which is precisely the axis this module had reinvented.
 *
 * So the classification is read from there and nothing about it is duplicated. Two maps of the
 * same fact drift, and the one with real published standards in it is not the one to lose.
 *
 * ── One inherited imprecision, stated rather than smoothed ─────────
 *
 * `FAMILY_CLASSIFICATION.L` names `EN 10056-1`, while `PROFILE_FAMILIES.L` is
 * `[...L, ...IRAM_L]` — two tables merged, with nothing on the rows saying which is which. The
 * classification is therefore right about most of that family and optimistic about the rest.
 * Reported here because a selector that quietly disagreed with the catalogue it reads would be
 * worse than one that inherits a known gap, and fixing it means splitting the array, which is
 * the catalogue's job and not this module's.
 */

/**
 * One catalogue row, with its units in the field names.
 *
 * The raw table mixes mm and cm² and cm⁴ silently — `a` is cm², `h` is mm — and every reader
 * has to remember which. Naming the unit is the cheapest way to stop a `1e-4` appearing in a
 * component.
 */
export interface ProfileEntry {
  id: ProfileId;
  name: string;
  family: ProfileFamily;
  /** The dimensional standard the numbers come from, e.g. `EN 10365`. Not a design code. */
  standard: string;
  /** Who publishes it, which is the axis worth grouping and filtering on. */
  standardsBody: FamilyClassification['standardsBody'];
  /** Shape family — the grouping main's own picker uses. */
  series: SectionSeries;
  /** How faithfully the outline can be drawn and analysed. */
  fidelity: GeometryFidelity;
  shape: SectionShape;
  heightMm: number;
  widthMm: number;
  areaCm2: number;
  iyCm4: number;
  izCm4: number;
  massKgPerM: number;
  /** Wall or web thickness, when the table publishes one. */
  thicknessMm: number | null;
}

export interface ProfileQuery {
  /** Matched against the name, case- and space-insensitively. */
  text?: string;
  /** Empty or absent means every family. */
  families?: readonly ProfileFamily[];
  /** Empty or absent means every publishing body. */
  standardsBodies?: readonly FamilyClassification['standardsBody'][];
  /** A design code id from `DESIGN_CODES` — keeps only the families that code's practice uses. */
  designCode?: string;
}

export interface ProfileGroup {
  key: string;
  entries: ProfileEntry[];
}

/**
 * The seam the future general picker plugs into.
 *
 * Deliberately four small methods rather than one `getEverything()`: a source backed by a
 * project's own section library, or by a server, can implement these without materialising a
 * full catalogue on every keystroke.
 */
export interface ProfileSource {
  list(query?: ProfileQuery): ProfileEntry[];
  byId(id: ProfileId): ProfileEntry | null;
  families(): readonly ProfileFamily[];
  classify(family: ProfileFamily): FamilyClassification;
  designCodes(): readonly { id: string; label: string }[];
}

function toEntry(p: SteelProfile): ProfileEntry {
  return {
    id: p.name,
    name: p.name,
    family: p.family,
    standard: FAMILY_CLASSIFICATION[p.family].standard,
    standardsBody: FAMILY_CLASSIFICATION[p.family].standardsBody,
    series: FAMILY_CLASSIFICATION[p.family].series,
    fidelity: FAMILY_CLASSIFICATION[p.family].fidelity,
    shape: familyToShape(p.family),
    heightMm: p.h,
    widthMm: p.b,
    areaCm2: p.a,
    iyCm4: p.iy,
    izCm4: p.iz,
    massKgPerM: p.weight,
    thicknessMm: p.t ?? p.tw ?? null,
  };
}

/** Fold spaces and case away, so `hea200`, `HEA 200` and `hea 200` are one query. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

const ENTRIES: ProfileEntry[] = ALL_PROFILES.map(toEntry);
const BY_ID = new Map<ProfileId, ProfileEntry>(ENTRIES.map((e) => [e.id, e]));

export function queryProfiles(query: ProfileQuery = {}): ProfileEntry[] {
  const text = query.text ? norm(query.text) : '';
  const families = query.families?.length ? new Set(query.families) : null;
  const bodies = query.standardsBodies?.length ? new Set(query.standardsBodies) : null;
  // Delegated, not reimplemented: `familiesForCode` is where "this code's practice actually
  // uses these dimensions" is decided, and it refuses a family whose shape merely looks right.
  const byCode = query.designCode ? new Set(familiesForCode(query.designCode)) : null;

  return ENTRIES.filter((e) => {
    if (families && !families.has(e.family)) return false;
    if (bodies && !bodies.has(e.standardsBody)) return false;
    if (byCode && !byCode.has(e.family)) return false;
    if (text && !norm(e.name).includes(text)) return false;
    return true;
  });
}

/**
 * Group in the catalogue's own family order, not alphabetically.
 *
 * `FAMILY_LIST` is ordered the way an engineer scans a handbook — the I-sections together,
 * then the channels, then the angles, then the tubes. Sorting the groups by name would put
 * CHS first and IPE eighth, which is tidy and useless.
 */
export function groupByFamily(entries: readonly ProfileEntry[]): ProfileGroup[] {
  const byFamily = new Map<ProfileFamily, ProfileEntry[]>();
  for (const e of entries) {
    const bucket = byFamily.get(e.family);
    if (bucket) bucket.push(e); else byFamily.set(e.family, [e]);
  }
  return FAMILY_LIST
    .filter((f) => byFamily.has(f))
    .map((f) => ({ key: f, entries: byFamily.get(f)! }));
}

/** The catalogue this app ships, as a source. */
export const steelProfileSource: ProfileSource = {
  list: (query) => queryProfiles(query),
  byId: (id) => BY_ID.get(id) ?? null,
  families: () => FAMILY_LIST,
  classify: (family) => FAMILY_CLASSIFICATION[family],
  designCodes: () => DESIGN_CODES.map((c) => ({ id: c.id, label: c.label })),
};

/** Every family the catalogue actually has rows for. */
export function populatedFamilies(): ProfileFamily[] {
  return FAMILY_LIST.filter((f) => (PROFILE_FAMILIES[f]?.length ?? 0) > 0);
}
