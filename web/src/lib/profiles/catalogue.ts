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
import { IRAM_L } from '../data/iram-angles';

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
 * ── The one family with two provenances ───────────────────────────
 *
 * `FAMILY_CLASSIFICATION.L` names `EN 10056-1`. `PROFILE_FAMILIES.L` is `[...L, ...IRAM_L]` —
 * the European equal-leg angles plus the Argentine series tabulated for CIRSOC 301-EL. So the
 * family declaration is right about part of that family and optimistic about the rest, and PR21
 * recorded that as an inherited gap it would not close.
 *
 * It is closed here, and the way it is closed is the point. The provenance is NOT guessed from
 * a row: it is read from WHICH SOURCE ARRAY the row came from, which is a fact the tables
 * carry and the merged array loses. `IRAM_L` is imported and its ids are the ones that get the
 * IRAM standard; everything else in the family keeps the European one. Move a profile between
 * those two files and the answer here moves with it, because nothing is transcribed.
 *
 * Two things that follow, and both are deliberate:
 *
 *   · the FAMILY is reported as carrying more than one standard — `mixed` — rather than one of
 *     them being chosen to stand for both. A picker that prints `EN 10056-1` over a group
 *     holding fourteen IRAM angles is stating something false about eleven of them.
 *   · `section-catalog.ts` is not edited. It is a shared file — Basic's own section picker
 *     reads `FAMILY_CLASSIFICATION` — so the single-standard declaration there is reported for
 *     coordination instead of changed under another branch's feet. Nothing here disagrees with
 *     it: the family standard is still what it says, and what is added is the per-row detail
 *     the merged array had thrown away.
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
  /**
   * The dimensional standard THIS PROFILE's numbers come from, e.g. `EN 10365`. Not a design
   * code, and not necessarily the one its family declares — see the header on the angles.
   */
  standard: string;
  /** Who publishes that standard, which is the axis worth grouping and filtering on. */
  standardsBody: FamilyClassification['standardsBody'];
  /**
   * True when this profile's own standard is not the one its family declares.
   *
   * Present so a row can be marked without the reader having to compare two strings, and so a
   * test can assert that the marked set is exactly the merged-in one.
   */
  standardDiffersFromFamily: boolean;
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
  /**
   * Every dimensional standard the family's rows come from.
   *
   * On the interface rather than left to the UI to work out, because a source backed by a
   * project's own library has the same question to answer and the same right to answer it
   * differently. A single-standard source returns one entry and the header reads as before.
   */
  standards(family: ProfileFamily): readonly string[];
}

/**
 * The profiles whose provenance the merged family array threw away.
 *
 * Keyed by id, which is the catalogue name — the same identifier the model stores — so this
 * is a lookup and not a pattern match on a label. Built from `IRAM_L` itself: the membership
 * test is "this row is in that file", never "this name looks Argentine".
 *
 * `IRAM-IAS U 500-558` is the standard `iram-angles.ts` names in its own header, and the
 * country and body follow from it. Fidelity is NOT overridden: how faithfully an angle can be
 * drawn is a property of having both fillet radii, which both subsets have, and the family
 * declaration is right about it.
 */
const MERGED_IN: ReadonlyMap<ProfileId, Pick<FamilyClassification, 'standard' | 'standardsBody' | 'country'>> =
  new Map(IRAM_L.map((p) => [p.name, {
    standard: 'IRAM-IAS U 500-558',
    standardsBody: 'IRAM-IAS' as const,
    country: 'AR',
  }]));

/** Standards present in a family, in first-appearance order. One entry for all but the angles. */
const STANDARDS_BY_FAMILY: ReadonlyMap<ProfileFamily, readonly string[]> = (() => {
  const out = new Map<ProfileFamily, string[]>();
  for (const p of ALL_PROFILES) {
    const std = MERGED_IN.get(p.name)?.standard ?? FAMILY_CLASSIFICATION[p.family].standard;
    const list = out.get(p.family);
    if (!list) out.set(p.family, [std]);
    else if (!list.includes(std)) list.push(std);
  }
  return out;
})();

/**
 * Every dimensional standard a family's rows actually come from.
 *
 * More than one means the group header must say so rather than print the first. Derived from
 * the rows, so a family that stops being mixed stops being reported as mixed.
 */
export function standardsInFamily(family: ProfileFamily): readonly string[] {
  return STANDARDS_BY_FAMILY.get(family) ?? [FAMILY_CLASSIFICATION[family].standard];
}

/** True when a family's rows do not share one dimensional standard. */
export function familyHasMixedStandards(family: ProfileFamily): boolean {
  return standardsInFamily(family).length > 1;
}

function toEntry(p: SteelProfile): ProfileEntry {
  const declared = FAMILY_CLASSIFICATION[p.family];
  const own = MERGED_IN.get(p.name);
  return {
    id: p.name,
    name: p.name,
    family: p.family,
    standard: own?.standard ?? declared.standard,
    standardsBody: own?.standardsBody ?? declared.standardsBody,
    standardDiffersFromFamily: own !== undefined,
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
  standards: (family) => standardsInFamily(family),
};

/** Every family the catalogue actually has rows for. */
export function populatedFamilies(): ProfileFamily[] {
  return FAMILY_LIST.filter((f) => (PROFILE_FAMILIES[f]?.length ?? 0) > 0);
}
