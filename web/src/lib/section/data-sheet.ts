/**
 * The full data sheet for a chosen section — identity, provenance, properties, limitations.
 *
 * ── What this composes, and what it refuses to compute ──────────────
 *
 * Almost every number here already exists somewhere. `profiles/properties.ts` produces the
 * thirteen quantities with a `PropertyBasis` on each — tabulated, derived from the table,
 * derived from the geometry, or unavailable — and `data/section-catalog.ts` produces the
 * taxonomy: dimensional standard, publishing body, country, hot-rolled against cold-formed,
 * series, and how faithfully the outline can be drawn.
 *
 * So this module **composes and does not calculate**. It exists because the brief asks for one
 * sheet covering designation, family, standard, provenance, area, mass, centroids, Iy/Iz,
 * radii, moduli, torsion, dimensions, thicknesses, constructive parameters and limitations —
 * and those live in four modules that have never been put beside each other. Adding a
 * fourteenth quantity belongs in `properties.ts`, not here.
 *
 * The one thing it adds is the **centroid**, and only when the caller supplies canonical
 * geometry. A centroid cannot be derived from `h` and `b` for a channel or an angle, and
 * guessing `h/2` for one would be wrong in exactly the cases where it matters — which are the
 * cases M2 already warns about for a different reason.
 *
 * ── Why the cold-formed block is its own thing ──────────────────────
 *
 * The brief asks for a section of cold-formed data that is empty, with an explanation, for
 * anything that is not one. That is not a formatting nicety: a cold-formed C or Z carries
 * facts a rolled profile has no analogue for — the sheet thickness the whole section is folded
 * from, the lip, and for a zed a product of inertia and a principal-axis rotation that the
 * rest of this app has nowhere to store. Folding those into the general rows would make eleven
 * of thirteen sections show blanks and say nothing about why.
 */

import type { ProfileEntry } from '../profiles/catalogue';
import { profileProperties, propertyRows, type PropertyRow, type Quantity } from '../profiles/properties';
import { classifyFamily, type FamilyClassification } from '../data/section-catalog';
import type { ColdFormedEntry } from '../profiles/cold-formed-catalogue';
import { COLD_FORMED_BASIS } from '../profiles/cold-formed-catalogue';

/** Who the section is. Every field is recorded, none is parsed back out of the name. */
export interface SectionIdentity {
  /** The designation, e.g. `IPE 200`. */
  designation: string;
  family: string;
  /** Dimensional standard — `EN 10365`, `DIN 1025-1`. NOT a design code. */
  standard: string;
  standardsBody: FamilyClassification['standardsBody'] | null;
  country: string | null;
  /** Hot-rolled or cold-formed, as the catalogue declares it. */
  material: FamilyClassification['material'] | null;
  series: FamilyClassification['series'] | null;
  /**
   * True when this profile's own standard differs from the one its family declares.
   *
   * Surfaced because it is the sort of thing a reader must not discover from a footnote: a
   * family can be mostly one standard with a handful of entries from another.
   */
  standardDiffersFromFamily: boolean;
}

/**
 * A limitation on what the app can say about this section.
 *
 * i18n keys, never prose: these are rendered at the boundary like every other message in the
 * app, and a sheet that hardcoded Spanish would be untranslatable in the two other languages
 * the audit re-checks at every phase.
 */
export interface SectionLimitation {
  key: string;
  /** `geometry` limits what can be drawn or integrated; `data` limits what is published. */
  kind: 'geometry' | 'data';
}

/** Cold-formed specifics. Present only for a cold-formed section. */
export interface ColdFormedBlock {
  present: true;
  shape: ColdFormedEntry['shape'];
  /** Sheet thickness the whole section is folded from, mm. */
  thicknessMm: number;
  /** Product of inertia, cm⁴. Nonzero for a zed, zero for a channel. */
  ixyCm4: number;
  /** Degrees from the geometric axes to the nearer principal axis. Zero for a channel. */
  principalAngleDeg: number;
  jCm4: number;
  /** One word for every quantity on the entry: all of them are derived from the geometry. */
  basis: typeof COLD_FORMED_BASIS;
}

/** Why there is no cold-formed block. Shown, rather than leaving an empty panel unexplained. */
export interface NoColdFormedBlock {
  present: false;
  reasonKey: string;
}

export interface SectionDataSheet {
  identity: SectionIdentity;
  /** The thirteen quantities, in the catalogue's own order, each with its basis. */
  rows: PropertyRow[];
  /**
   * Centroid from the section's own origin, metres. Null when no canonical geometry was given.
   *
   * Not derived from `h`/`b`: that identity holds only for a doubly symmetric section, and the
   * sections whose centroid a reader actually looks up are the ones where it does not.
   */
  centroid: { yM: number; zM: number } | null;
  coldFormed: ColdFormedBlock | NoColdFormedBlock;
  limitations: SectionLimitation[];
  /** Quantities with no value, so a sheet can group them instead of showing thirteen dashes. */
  unavailable: PropertyRow[];
}

/** Canonical geometry, as much of it as this module reads. Keeps the store out of here. */
export interface CanonicalLike {
  yc: number;
  zc: number;
}

export interface DataSheetInput {
  entry: ProfileEntry;
  /** The resolved canonical state, when the section has one. Supplies the centroid. */
  canonical?: CanonicalLike | null;
  /** Present when the section is a cold-formed C or Z. */
  coldFormed?: ColdFormedEntry | null;
}

/**
 * Limitations, in the order a reader needs them.
 *
 * Geometry first, because "the outline is not exact" changes how every number below it should
 * be read; then the individual unavailable quantities, which `properties.ts` already collects.
 */
function limitationsFor(entry: ProfileEntry, notes: readonly string[]): SectionLimitation[] {
  const out: SectionLimitation[] = [];
  /*
   * `fidelity` is read off the ENTRY, not off its family.
   *
   * A family can carry entries merged in from another standard — `standardDiffersFromFamily`
   * is the flag for exactly that — and for those the family's fidelity is the wrong answer.
   * The catalogue already resolves this per profile; taking the family's would reintroduce the
   * approximation the entry exists to avoid.
   */
  if (entry.fidelity === 'nominalDimensions') {
    /*
     * The source table is internally inconsistent — it marks its dimensions nominal and derives
     * the area from nominal mass — so the outline is the right SHAPE without reproducing the
     * published area and inertias. Named here because it is a property of the whole section,
     * not of one row.
     */
    out.push({ key: 'section.sheet.limit.nominalDimensions', kind: 'geometry' });
  }
  if (entry.fidelity === 'propertiesOnly') {
    out.push({ key: 'section.sheet.limit.propertiesOnly', kind: 'geometry' });
  }
  if (entry.standardDiffersFromFamily) {
    out.push({ key: 'section.sheet.limit.standardDiffers', kind: 'data' });
  }
  for (const key of notes) out.push({ key, kind: 'data' });
  return out;
}

/**
 * Everything the sheet shows, for one section.
 *
 * Pure, so the panel that renders it holds no logic and the tests do not need a component.
 */
export function sectionDataSheet(input: DataSheetInput): SectionDataSheet {
  const { entry, canonical, coldFormed } = input;
  const cls = classifyFamily(entry.family);
  const props = profileProperties(entry);
  const rows = propertyRows(props);

  return {
    identity: {
      designation: entry.name,
      family: entry.family,
      standard: entry.standard,
      standardsBody: entry.standardsBody ?? null,
      country: cls?.country ?? null,
      material: cls?.material ?? null,
      series: entry.series ?? null,
      standardDiffersFromFamily: Boolean(entry.standardDiffersFromFamily),
    },
    rows,
    centroid: canonical ? { yM: canonical.yc, zM: canonical.zc } : null,
    coldFormed: coldFormed
      ? {
          present: true,
          shape: coldFormed.shape,
          thicknessMm: coldFormed.thicknessMm,
          ixyCm4: coldFormed.ixyCm4,
          principalAngleDeg: coldFormed.principalAngleDeg,
          jCm4: coldFormed.jCm4,
          basis: COLD_FORMED_BASIS,
        }
      : {
          present: false,
          /*
           * The reason distinguishes the two ways a section can have no cold-formed block, and
           * the difference is real: a rolled IPE has none because the concept does not apply,
           * while a section built from a template has none because nothing recorded which
           * sheet it would be folded from. Only the first is a settled answer.
           */
          reasonKey: cls?.material === 'cold-formed-steel'
            ? 'section.sheet.coldFormed.notCatalogued'
            : 'section.sheet.coldFormed.notApplicable',
        },
    limitations: limitationsFor(entry, props.unavailableReasons),
    unavailable: rows.filter((r) => r.quantity.basis === 'unavailable'),
  };
}

/** Whether a quantity carries a number. Kept here so no surface re-derives the rule. */
export function hasValue(q: Quantity): boolean {
  return q.value !== null && q.basis !== 'unavailable';
}
