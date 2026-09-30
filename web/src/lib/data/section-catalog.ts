/**
 * section-catalog.ts — how the profile catalogue is organised for picking.
 *
 * # The distinction this file exists to keep straight
 *
 * A **design code** (CIRSOC 301, Eurocode 3, AISC 360) does not define
 * profiles. It defines how you verify a member. The *dimensions* come from a
 * separate **dimensional standard** (DIN 1025-1, EN 10365, IRAM-IAS U 500-42,
 * ASTM A6). One design code references several dimensional standards, and one
 * dimensional standard is referenced by several design codes.
 *
 * Collapsing the two — labelling a family "CIRSOC" — is what makes a catalogue
 * impossible to extend later, because the day you add a second code you
 * discover the families were never owned by the first one. So families here
 * carry the dimensional standard their numbers actually came from, which is
 * checkable, and design codes are a separate index built on top.
 *
 * # What the standards below are, and what backs them
 *
 * Every dimensional standard named here was verified numerically, not asserted:
 * the canonical outline is built from it and integrated, and the result must
 * reproduce the published area and inertias. See
 * `engine/src/section/catalogue.rs` and the header of `steel-profiles.ts`.
 */

import type { ProfileFamily } from './steel-profiles';

export type SectionMaterial = 'hot-rolled-steel' | 'cold-formed-steel';
export type SectionSeries = 'i-beam' | 'channel' | 'angle' | 'tee' | 'hollow';

/** How faithfully the app can draw and analyse a family's real outline. */
export type GeometryFidelity =
  /** Exact outline: fillets, tapers and all, verified against published data. */
  | 'exact'
  /**
   * The outline is the right SHAPE, but it does not reproduce the published
   * area and inertias, because the source table is itself inconsistent: it
   * marks its dimensions "nominal" and derives the area from nominal mass.
   * The section is fully analysable; the deviation is measured per profile and
   * shown, never hidden.
   */
  | 'nominalDimensions'
  /** Properties are right; the outline is not available, so no detailed stress. */
  | 'propertiesOnly';

export interface FamilyClassification {
  family: ProfileFamily;
  /** The dimensional standard the numbers come from. Not a design code. */
  standard: string;
  /** Body that publishes that standard, for grouping in the picker. */
  standardsBody: 'DIN' | 'CEN' | 'IRAM-IAS' | 'ASTM/AISC';
  country: string;
  material: SectionMaterial;
  series: SectionSeries;
  fidelity: GeometryFidelity;
}

/**
 * The eight families currently shipped.
 *
 * `standard` used to read "Euronorm" for all eight, which was a placeholder.
 * These are the specific standards each family's dimensions and fillets were
 * validated against this cycle.
 */
export const FAMILY_CLASSIFICATION: Record<ProfileFamily, FamilyClassification> = {
  IPE: { family: 'IPE', standard: 'EN 10365', standardsBody: 'CEN', country: 'EU', material: 'hot-rolled-steel', series: 'i-beam', fidelity: 'exact' },
  HEA: { family: 'HEA', standard: 'EN 10365', standardsBody: 'CEN', country: 'EU', material: 'hot-rolled-steel', series: 'i-beam', fidelity: 'exact' },
  HEB: { family: 'HEB', standard: 'EN 10365', standardsBody: 'CEN', country: 'EU', material: 'hot-rolled-steel', series: 'i-beam', fidelity: 'exact' },
  W:   { family: 'W',   standard: 'IRAM-IAS U 500-215-6', standardsBody: 'IRAM-IAS', country: 'AR', material: 'hot-rolled-steel', series: 'i-beam', fidelity: 'nominalDimensions' },
  HP:  { family: 'HP',  standard: 'IRAM-IAS U 500-215-7', standardsBody: 'IRAM-IAS', country: 'AR', material: 'hot-rolled-steel', series: 'i-beam', fidelity: 'nominalDimensions' },
  M:   { family: 'M',   standard: 'IRAM-IAS U 500-215-8', standardsBody: 'IRAM-IAS', country: 'AR', material: 'hot-rolled-steel', series: 'i-beam', fidelity: 'nominalDimensions' },
  IPN: { family: 'IPN', standard: 'DIN 1025-1', standardsBody: 'DIN', country: 'DE', material: 'hot-rolled-steel', series: 'i-beam', fidelity: 'exact' },
  UPN: { family: 'UPN', standard: 'DIN 1026-1', standardsBody: 'DIN', country: 'DE', material: 'hot-rolled-steel', series: 'channel', fidelity: 'exact' },
  C:   { family: 'C',   standard: 'IRAM-IAS U 500-509-4', standardsBody: 'IRAM-IAS', country: 'AR', material: 'hot-rolled-steel', series: 'channel', fidelity: 'nominalDimensions' },
  T:   { family: 'T',   standard: 'IRAM-IAS U 500-561', standardsBody: 'IRAM-IAS', country: 'AR', material: 'hot-rolled-steel', series: 'tee', fidelity: 'exact' },
  MC:  { family: 'MC',  standard: 'IRAM-IAS U 500-509-4', standardsBody: 'IRAM-IAS', country: 'AR', material: 'hot-rolled-steel', series: 'channel', fidelity: 'propertiesOnly' },
  L:   { family: 'L',   standard: 'EN 10056-1', standardsBody: 'CEN', country: 'EU', material: 'hot-rolled-steel', series: 'angle', fidelity: 'exact' },
  CHS: { family: 'CHS', standard: 'IRAM-IAS U 500-218', standardsBody: 'IRAM-IAS', country: 'AR', material: 'cold-formed-steel', series: 'hollow', fidelity: 'exact' },
  RHS: { family: 'RHS', standard: 'IRAM-IAS U 500-218', standardsBody: 'IRAM-IAS', country: 'AR', material: 'cold-formed-steel', series: 'hollow', fidelity: 'exact' },
  SHS: { family: 'SHS', standard: 'IRAM-IAS U 500-218', standardsBody: 'IRAM-IAS', country: 'AR', material: 'cold-formed-steel', series: 'hollow', fidelity: 'exact' },
};

// ─── Design codes ──────────────────────────────────────────────────

export interface DesignCode {
  id: string;
  /** Short label for the picker. */
  label: string;
  region: string;
  /**
   * Families whose dimensional standard this code's practice actually uses.
   *
   * A family appears here only when the shipped dimensions are the ones that
   * code's practice specifies — never merely because the shape is plausible.
   */
  families: ProfileFamily[];
  /**
   * Families the code's practice uses that are NOT shipped yet, so the picker
   * can say what is missing instead of implying the list is complete.
   * Dictionary keys, like `note`: the picker shows them in the active language.
   */
  missingFamilies?: string[];
  note?: string;
}

/**
 * CIRSOC 301 is the Argentine steel design code. It is a *verification* code —
 * it adopts AISC's method — and takes its profiles from whatever is
 * commercially normalised locally. The IPN and UPN series below are the DIN
 * 1025 "normal" sections that Argentine tables carry, so those two families are
 * genuinely usable under it. The wide-flange (W), American channel (C),
 * unequal-leg angle and cold-formed C/Z series that local practice also uses
 * are not shipped, and are listed as missing rather than approximated by a
 * European family of similar shape.
 */
export const DESIGN_CODES: DesignCode[] = [
  {
    id: 'cirsoc-301',
    label: 'CIRSOC 301',
    region: 'AR',
    families: ['IPN', 'UPN', 'W', 'HP', 'M', 'C', 'MC', 'L', 'T', 'CHS', 'RHS', 'SHS'],
    missingFamilies: ['cat.missingFamily.unequalAngles', 'cat.missingFamily.coldFormedCZ'],
    note: 'cat.note.cirsoc',
  },
  /*
   * The hollow families are listed here even though the shipped tubes are the
   * IRAM ones, and the note says so.
   *
   * The note was already written — it explains that these are IRAM-IAS tubes
   * and that EN 10219-2 leaves the corner radius as a range — but the families
   * were not in the list, so a user working to Eurocode 3 saw no tube at all
   * and read an explanation of something they could not select. A European
   * frame without a hollow section is not a small gap.
   *
   * Listing them with the caveat is the honest option: the outside dimensions
   * of the metric series are common to both standards, the corner radius is
   * what differs, and the note says which is which. Silently relabelling them
   * EN 10210/10219 would be the dishonest one.
   */
  {
    id: 'eurocode-3',
    label: 'Eurocode 3',
    region: 'EU',
    families: ['IPE', 'HEA', 'HEB', 'IPN', 'UPN', 'L', 'CHS', 'RHS', 'SHS'],
    note: 'cat.note.eurocodeTubes',
  },
  /*
   * AISC was missing entirely, which is odd given that the W, HP, M, C and MC
   * series shipped here ARE the American ones — the catalogue carried the
   * shapes without naming the code they belong to, so a user working to AISC
   * had no filter and no confirmation that these were their sections.
   *
   * The dimensional standard is ASTM A6/A6M; NBR 15980 is equivalent to it, so
   * the same families serve Brazilian practice without duplicating a profile.
   */
  {
    id: 'aisc-360',
    label: 'AISC 360',
    region: 'US',
    families: ['W', 'HP', 'M', 'C', 'MC', 'L', 'T', 'CHS', 'RHS', 'SHS'],
    note: 'cat.note.aisc',
  },
  {
    id: 'nbr-8800',
    label: 'NBR 8800',
    region: 'BR',
    families: ['W', 'HP', 'M', 'C', 'MC', 'L', 'CHS', 'RHS', 'SHS'],
    note: 'cat.note.nbr',
  },
];

/** Every family the app ships, in picker order. */
/**
 * Every family the app ships, in picker order.
 *
 * IPN leads the I-series because it leads in practice here: it is the section
 * Argentine mills roll as standard and the one CIRSOC's own tables are built
 * around, so it is what a local user reaches for first. The rest follow by
 * series — European, American, then the rolled channels and angles.
 */
export const ALL_FAMILIES: ProfileFamily[] = ['IPN', 'IPE', 'HEA', 'HEB', 'W', 'HP', 'M', 'UPN', 'C', 'MC', 'L', 'T', 'CHS', 'RHS', 'SHS'];

/** Design code by id. */
export function designCode(id: string): DesignCode | undefined {
  return DESIGN_CODES.find((c) => c.id === id);
}

/**
 * Families to offer for a code, or all of them when no code is selected.
 *
 * An unknown id returns everything rather than nothing: a picker that silently
 * empties itself is worse than one that over-offers.
 */
export function familiesForCode(codeId: string | null): ProfileFamily[] {
  if (!codeId) return ALL_FAMILIES;
  const code = designCode(codeId);
  return code ? code.families : ALL_FAMILIES;
}

/** All families belonging to a material class (for grouped pickers). */
export function familiesByMaterial(material: SectionMaterial): ProfileFamily[] {
  return (Object.values(FAMILY_CLASSIFICATION) as FamilyClassification[])
    .filter((c) => c.material === material)
    .map((c) => c.family);
}

/** Classification for a family, or undefined if not registered. */
export function classifyFamily(family: ProfileFamily): FamilyClassification | undefined {
  return FAMILY_CLASSIFICATION[family];
}

/** Families grouped by series, preserving picker order, for a set of families. */
export function groupBySeries(families: ProfileFamily[]): Array<{ series: SectionSeries; families: ProfileFamily[] }> {
  const order: SectionSeries[] = ['i-beam', 'channel', 'angle', 'tee', 'hollow'];
  return order
    .map((series) => ({
      series,
      families: families.filter((f) => FAMILY_CLASSIFICATION[f]?.series === series),
    }))
    .filter((g) => g.families.length > 0);
}
