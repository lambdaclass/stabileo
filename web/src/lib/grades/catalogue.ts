/**
 * The grade catalogue, as a source something else can consume.
 *
 * ── Why this exists, given that `structural-grades.ts` is already good ──
 *
 * It is more than good — it separates the product standard from the design code, records the
 * thickness bands and the standard they came from, and marks which values were read from the
 * governing standard and which were carried from general knowledge of the alloy. None of that
 * is re-derived here and none of it is duplicated.
 *
 * What it does not have is a QUERY SEAM. Every surface that wants grades reaches into the
 * tables and rebuilds the same handful of operations: filter by family, filter by region,
 * filter by design code, search text, resolve an id. Basic's material picker does exactly that
 * inline. PRO needs the same operations plus more axes, and a second inline implementation of
 * the same filters is how two pickers come to disagree about which grades exist.
 *
 * So this is the same shape `lib/profiles/catalogue.ts` gives the profile tables: query in,
 * entries out, behind an interface a different catalogue could implement. The two are
 * deliberately parallel — a project library of grades and a project library of sections are the
 * same kind of future need — and a reader who knows one can read the other.
 *
 * ── The identifier ────────────────────────────────────────────────
 *
 * `GradeId` is `StructuralGrade.id`, unchanged. It is what `Material.gradeId` stores, what a
 * saved `.ded` carries, and what `gradeById` and `catalogueGradeFamily` look up. Minting a
 * second identifier for a grade would mean two ways to name one steel.
 *
 * ── What this module will not do ──────────────────────────────────
 *
 * It does not pick a band. `strengthAtThickness` exists in the data module and takes a
 * thickness; a picker has no member in hand, so it discloses the bands rather than resolving
 * them. Choosing by thickness is a decision about which thickness governs a member, and that
 * belongs to a design pass that does not exist for metal in this app.
 *
 * It also states nothing about verification. Selecting a grade configures the model. There is
 * no metallic design authority here, so a selection is not a check and the panel says so.
 *
 * Pure: no store, no runes, no i18n. Note KEYS, never prose.
 */

import {
  ALL_GRADES, BASIC_REGIONS, MATERIAL_DESIGN_CODES,
  codesForFamily, gradeById, gradesForCode, isUnusualPairing,
  type DesignCode, type GradeFamily, type GradeRegion, type StructuralGrade, type ThicknessBand,
} from '../data/structural-grades';

/** `StructuralGrade.id` — what the model stores. */
export type GradeId = string;

/** The families a metal grade can belong to, in the order a picker lists them. */
export const GRADE_FAMILIES: readonly GradeFamily[] = [
  'hot-rolled', 'cold-formed', 'stainless', 'aluminium',
];

/**
 * One catalogue row, with the units in the field names.
 *
 * Same reasoning as `ProfileEntry`: the tables mix MPa, kN/m³ and mm, and naming the unit is
 * the cheapest way to stop a density being read as a stress.
 */
export interface GradeEntry {
  id: GradeId;
  /** How it is written on a drawing: `F-24`, `S355`, `A992`. */
  designation: string;
  /** The PRODUCT standard that fixes the values below. Never a design code. */
  productStandard: string;
  region: GradeRegion;
  family: GradeFamily;
  /** Young's modulus, MPa. */
  eMPa: number;
  nu: number;
  /** Weight density, kN/m³. */
  rhoKNM3: number;
  /** Yield or 0.2 % proof strength, MPa — the value for the FIRST thickness band. */
  fyMPa: number;
  /** Ultimate tensile strength, MPa. */
  fuMPa: number;
  /** Thickness dependence where it is tabulated. Null when the source quotes one value. */
  bands: readonly ThicknessBand[] | null;
  /**
   * Which standard tabulates those bands — and it is never `productStandard`.
   *
   * Carried separately for the reason the data module gives at length: every band in the
   * catalogue is a DESIGN code's table, and a band shown beside the product standard implies
   * the product standard published it.
   */
  bandStandard: string | null;
  /** Whether the values were read from the governing standard or carried from general knowledge. */
  verification: 'standard' | 'typical' | null;
  /** Free prose from the source, in the source's language. Absent for most rows. */
  note?: string;
}

export interface GradeQuery {
  /** Matched against designation, product standard and note, case-insensitively. */
  text?: string;
  /** Empty or absent means every family. */
  families?: readonly GradeFamily[];
  /** Empty or absent means every region. */
  regions?: readonly GradeRegion[];
  /**
   * A design code id from `MATERIAL_DESIGN_CODES` — keeps the grades that code's own tables
   * are written around. Requires a family, because a code covers exactly one.
   */
  designCodeId?: string;
  /**
   * Basic ships four regions; PRO ships every one. Defaults to PRO here, which is the opposite
   * of `gradesForMode`'s default and is deliberate: this source exists for the PRO surface, and
   * a caller that wants the Basic subset says so.
   */
  basicRegionsOnly?: boolean;
}

export interface GradeSource {
  list(query?: GradeQuery): GradeEntry[];
  byId(id: GradeId): GradeEntry | null;
  families(): readonly GradeFamily[];
  regions(): readonly GradeRegion[];
  /** Design codes written for a family, or every code when no family is given. */
  designCodes(family?: GradeFamily): readonly DesignCode[];
}

function toEntry(g: StructuralGrade): GradeEntry {
  return {
    id: g.id,
    designation: g.designation,
    productStandard: g.productStandard,
    region: g.region,
    family: g.family,
    eMPa: g.e,
    nu: g.nu,
    rhoKNM3: g.rho,
    fyMPa: g.fy,
    fuMPa: g.fu,
    bands: g.byThickness ?? null,
    bandStandard: g.bandStandard ?? null,
    verification: g.verification ?? null,
    ...(g.note ? { note: g.note } : {}),
  };
}

const ENTRIES: GradeEntry[] = ALL_GRADES.map(toEntry);
const BY_ID = new Map<GradeId, GradeEntry>(ENTRIES.map((e) => [e.id, e]));

/** Every region the catalogue actually has grades for, in picker order. */
export function populatedRegions(): GradeRegion[] {
  const order: GradeRegion[] = ['AR', 'EU', 'US', 'BR', 'AU', 'IN', 'ZA'];
  const present = new Set(ENTRIES.map((e) => e.region));
  return order.filter((r) => present.has(r));
}

export function queryGrades(query: GradeQuery = {}): GradeEntry[] {
  const text = query.text?.trim().toLowerCase() ?? '';
  const families = query.families?.length ? new Set(query.families) : null;
  const regions = query.regions?.length ? new Set(query.regions) : null;

  /*
   * The code filter is delegated, not reimplemented.
   *
   * `gradesForCode` is where "this code's tables are written around these regions' grades"
   * lives, including its own decision to return the whole family rather than nothing when a
   * code matches no grade — an empty picker looks broken. Recomputing that rule here would be
   * a second answer to the same question.
   *
   * It needs a family because a design code covers exactly one, so the filter applies only
   * when the query has narrowed to one family. With several families selected the code control
   * has no single meaning and is ignored rather than guessed at.
   */
  let allowedByCode: Set<GradeId> | null = null;
  if (query.designCodeId && families && families.size === 1) {
    const code = MATERIAL_DESIGN_CODES.find((c) => c.id === query.designCodeId);
    const family = [...families][0];
    if (code && code.families.includes(family)) {
      allowedByCode = new Set(gradesForCode(code, family).map((g) => g.id));
    }
  }

  return ENTRIES.filter((e) => {
    if (families && !families.has(e.family)) return false;
    if (regions && !regions.has(e.region)) return false;
    if (query.basicRegionsOnly && !BASIC_REGIONS.includes(e.region)) return false;
    if (allowedByCode && !allowedByCode.has(e.id)) return false;
    if (text) {
      const hay = `${e.designation} ${e.productStandard} ${e.note ?? ''}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

export interface GradeGroup {
  /** The family, which is what a group of grades is grouped by. */
  key: GradeFamily;
  entries: GradeEntry[];
}

/**
 * Group by family, in `GRADE_FAMILIES` order.
 *
 * Hot-rolled first because it is what a structural drawing specifies most of the time, then
 * cold-formed, then the two the app cannot check at all. Alphabetical would put aluminium
 * first, which is tidy and misleading about what this tool is for.
 */
export function groupByFamily(entries: readonly GradeEntry[]): GradeGroup[] {
  const byFamily = new Map<GradeFamily, GradeEntry[]>();
  for (const e of entries) {
    const bucket = byFamily.get(e.family);
    if (bucket) bucket.push(e); else byFamily.set(e.family, [e]);
  }
  return GRADE_FAMILIES
    .filter((f) => byFamily.has(f))
    .map((f) => ({ key: f, entries: byFamily.get(f)! }));
}

/** The catalogue this app ships, as a source. */
export const structuralGradeSource: GradeSource = {
  list: (query) => queryGrades(query),
  byId: (id) => BY_ID.get(id) ?? null,
  families: () => GRADE_FAMILIES,
  regions: () => populatedRegions(),
  designCodes: (family) => (family ? codesForFamily(family) : MATERIAL_DESIGN_CODES),
};

// ─── What the PRO card shows, and on whose authority ─────────────────

/** Where a grade's number came from. Parallel to `PropertyBasis` in the profile catalogue. */
export const GRADE_BASES = [
  'productStandard', 'designCode', 'derived', 'typicalValue', 'unavailable',
] as const;

export type GradeBasis = (typeof GRADE_BASES)[number];

const _gradeBasesExhaustive: readonly GradeBasis[] = GRADE_BASES;
void _gradeBasesExhaustive;

export interface GradeQuantity {
  value: number | null;
  unit: 'MPa' | 'GPa' | 'kN/m3' | '-';
  basis: GradeBasis;
  /** i18n key. Required when the basis is `unavailable` or needs qualifying. */
  noteKey?: string;
}

/** The rows a grade card lists, in order. */
export const GRADE_PROPERTY_ORDER = ['fy', 'fu', 'e', 'g', 'nu', 'rho'] as const;

export type GradePropertyKey = (typeof GRADE_PROPERTY_ORDER)[number];

export interface GradePropertyRow {
  key: GradePropertyKey;
  labelKey: string;
  quantity: GradeQuantity;
}

/**
 * A grade's properties, each with the authority behind it.
 *
 * Four different authorities appear on one card, and the distinction is the point:
 *
 *   · `productStandard` — E, nu, rho, and the headline fy and fu, from the standard the mill
 *     certifies against.
 *   · `typicalValue` — the same field on a grade whose `verification` is `typical`: an ordinary
 *     value for the alloy, not one read from the governing table. The data module marks 45 of
 *     68 grades this way and says why; a card that hid the mark would be presenting them all
 *     as equally settled.
 *   · `derived` — the shear modulus, `G = E / 2(1 + nu)`. Exact isotropic elasticity on two
 *     published numbers, and worth showing because a metal check uses it directly.
 *   · `unavailable` — nothing here today, and the case is kept because a grade with an
 *     unpublished `fu` was left out of the tables rather than filled in with a plausible
 *     number, and the day one is added with a gap this is where it surfaces.
 */
export function gradePropertyRows(e: GradeEntry): GradePropertyRow[] {
  // The verification mark applies to the STRENGTHS. E, nu and rho are the alloy's elastic
  // constants, fixed by the standard the grade is published under — the data module's own
  // header is explicit that those differ by code and follow the standard, so they are not
  // what "carried from general knowledge" refers to.
  const strengthBasis: GradeBasis = e.verification === 'typical' ? 'typicalValue' : 'productStandard';
  const g = e.eMPa / (2 * (1 + e.nu));

  const rows: Record<GradePropertyKey, GradeQuantity> = {
    fy: { value: e.fyMPa, unit: 'MPa', basis: strengthBasis, noteKey: e.bands ? 'steel.grades.note.firstBand' : undefined },
    fu: { value: e.fuMPa, unit: 'MPa', basis: strengthBasis },
    e: { value: e.eMPa, unit: 'MPa', basis: 'productStandard' },
    g: { value: g, unit: 'MPa', basis: 'derived', noteKey: 'steel.grades.note.shearModulusDerived' },
    nu: { value: e.nu, unit: '-', basis: 'productStandard' },
    rho: { value: e.rhoKNM3, unit: 'kN/m3', basis: 'productStandard' },
  };

  return GRADE_PROPERTY_ORDER.map((key) => ({
    key,
    labelKey: `steel.grades.label.${key}`,
    quantity: rows[key],
  }));
}

/** How a chosen grade sits against what is actually rolled in that section family. */
export type PairingVerdict =
  /** Recorded as ordinary practice somewhere. */
  | 'ordinary'
  /** Departs from every practice on record for that family. */
  | 'unusual'
  /** Nothing is recorded either way. Silence is not a claim. */
  | 'notRecorded';

export interface Pairing {
  verdict: PairingVerdict;
  /** i18n key saying what the verdict means for this pair. */
  noteKey: string;
}

/**
 * Whether a section family is rolled in this grade.
 *
 * Delegated to `isUnusualPairing`, which holds the whole rule — including the part that took
 * two passes to get right, that a region not offering a family at all is different from a
 * region offering it and recording nothing. Its three-valued answer is turned into a named
 * verdict so a component never has to interpret `null`.
 *
 * This is a note about cost and lead time, never about correctness: nothing stops an engineer
 * specifying an IPN in A992, and the app does not block it.
 */
export function pairing(profileFamily: string, gradeId: GradeId | undefined): Pairing {
  const unusual = isUnusualPairing(profileFamily, gradeId);
  if (unusual === true) return { verdict: 'unusual', noteKey: 'steel.grades.pairing.unusual' };
  if (unusual === false) return { verdict: 'ordinary', noteKey: 'steel.grades.pairing.ordinary' };
  return { verdict: 'notRecorded', noteKey: 'steel.grades.pairing.notRecorded' };
}

/**
 * The bands as a table a card can render, plus the standard that published them.
 *
 * Null when the source quotes a single value, which is not the same as "thickness has no
 * effect" — the data module says so explicitly, and the card repeats it rather than leaving the
 * absence to speak.
 */
export function bandTable(e: GradeEntry): { rows: readonly ThicknessBand[]; standard: string } | null {
  if (!e.bands || e.bands.length === 0) return null;
  return {
    rows: e.bands,
    // Enforced non-null by a test in the data module's own suite, so a band without its source
    // cannot be added. Falling back to the product standard would be exactly the false
    // attribution `bandStandard` exists to prevent, so this reports the absence instead.
    standard: e.bandStandard ?? '',
  };
}

/** Convenience for the panel: the grade behind an id, as the data module sees it. */
export function rawGrade(id: GradeId): StructuralGrade | undefined {
  return gradeById(id);
}
