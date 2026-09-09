/**
 * Per-member detail for the metallic workflow's grade and section stages.
 *
 * ── Why a counter was not enough ───────────────────────────────────
 *
 * Stages 2 and 3 shipped saying «3 members with no declared grade» and «2 sections incomplete».
 * Both numbers are true and neither is actionable: a user cannot tell WHICH member, and the fix
 * differs per member — one needs a grade picked, another needs a section from the catalogue, a
 * third is aluminium and will never be checked by CIRSOC 301 at all. A count collapses three
 * different problems into one number and then leaves the user to guess.
 *
 * So this module answers, per member: what is known, what is missing, and **why that particular
 * absence matters** — which is the part a count can never carry.
 *
 * ── The rule that shapes every field ───────────────────────────────
 *
 * **Nothing is fabricated, and a grade is never inferred from `fy`.**
 *
 * `material-family.ts` will happily guess a family from a yield strength, and it marks the guess
 * (`basis !== 'declaredGrade'`, plus a `caveatKey` that is «never absent on an inference»). That
 * guess is fine for deciding whether a member is metallic at all. It is NOT a grade: a grade is a
 * designation in a product standard, with a thickness table behind it, and no yield strength
 * implies one. So `gradeId` absent is reported as absent — not backfilled, not approximated, and
 * not dressed up as «probably F-24».
 *
 * ── Five states, because «not ready» has five different meanings ───
 *
 * The distinction the brief asks for is real and each one has a different remedy:
 *
 *   · `chosen` — the user made the choice and it resolved. Nothing to do.
 *   · `incomplete` — a datum is missing and CAN be supplied. The user's move.
 *   · `unavailable` — the datum does not exist for this thing and no one can supply it. Not a
 *     failure of the user or of the app; a property of the data.
 *   · `outOfScope` — the member is not in the metallic pipeline at all (concrete, aluminium).
 *     Reported rather than filtered out, because a member that silently vanishes reads as a
 *     member that passed.
 *   · `authorityBlocked` — everything needed is present and it still cannot be checked, because
 *     no signed authority covers it. The only one no amount of data input will move.
 *
 * Never `verified`, and never a state that implies a check happened.
 */

import type { SteelInventory, SteelMemberEntry } from './steel-inventory';
import type { GradeEntry, GradeSource } from '../../grades/catalogue';
import type { ProfileEntry, ProfileSource } from '../../profiles/catalogue';
import { parseColdFormedDesignation } from '../../profiles/cold-formed';
import { isColdFormedSection } from '../../profiles/cold-formed-catalogue';

/** What a row can be, in the order of «nothing to do» to «nothing you can do». */
export type StageRowState =
  | 'chosen'
  | 'incomplete'
  | 'unavailable'
  | 'outOfScope'
  | 'authorityBlocked';

/** A datum that is absent, with the reason its absence matters. Both, always. */
export interface MissingDatum {
  /** i18n key naming the datum. */
  key: string;
  /**
   * i18n key saying what its absence costs.
   *
   * Required, not optional. «Flange thickness missing» tells a user nothing about whether to care;
   * «the section class and the shear area both come from it» tells them why to act.
   */
  whyKey: string;
  /**
   * Whether the absence stops the design or only narrows it.
   *
   * A blocking datum makes the check impossible. A limiting one makes it coarser — the thickness
   * band case: without a thickness the grade's first band is the only one readable, which is the
   * strongest band, so the strength used would be the most favourable of several.
   */
  severity: 'blocks' | 'limits';
}

// ───────────────────────────── stage 2: grade ─────────────────────────────

export interface GradeRow {
  elementId: number;
  /** The section's name, which is what a user recognises a member by in this app. */
  memberName: string;
  materialName: string;
  /** `steel` / `aluminium` / `concrete` / … — from the inventory's verdict. */
  family: string;
  /** How the family was decided. `declaredGrade` is the only one that is not a guess. */
  familyBasis: string;
  /** Present only when the caveat is: the family was inferred rather than declared. */
  familyCaveatKey?: string;
  /** The declared grade id, or null. NEVER derived from `fy`. */
  gradeId: string | null;
  /** How it is written on a drawing. Null when no grade is declared. */
  designation: string | null;
  /** The PRODUCT standard that fixes the values. Null when no grade is declared. */
  productStandard: string | null;
  /**
   * Whether this grade's strength depends on thickness, and which standard tabulates that.
   *
   * `bandStandard` is deliberately separate from `productStandard`: the bands come from a DESIGN
   * code's table, and showing them beside the product standard would imply that standard published
   * them.
   */
  hasThicknessBands: boolean;
  bandStandard: string | null;
  /** The governing thickness in mm, when the section carries one. */
  thicknessMm: number | null;
  missing: MissingDatum[];
  state: StageRowState;
  /** True when the member is not in the metallic pipeline at all. */
  outsidePipeline: boolean;
}

/** The section fields this module reads. All optional: an old model may carry none of them. */
export interface RowSection {
  name?: string;
  profileFamily?: string;
  a?: number; iz?: number; iy?: number; j?: number;
  h?: number; b?: number; tw?: number; tf?: number; t?: number; tl?: number;
  shape?: string;
  built?: { shapeType: string; params: Record<string, number> };
  composition?: { profileName: string };
}

/**
 * The thickness a grade's band table should be read at.
 *
 * The flange governs for a rolled section — it is the thickest element and the one the band tables
 * are written for — falling back to the web and then to a wall thickness. Returns null rather than
 * a default: a missing thickness is a reported gap, not a zero.
 */
export function governingThicknessMm(sec: RowSection | undefined): number | null {
  if (!sec) return null;
  for (const v of [sec.tf, sec.tw, sec.t]) {
    if (v != null && v > 0) return v * 1000;
  }
  return null;
}

/** Families the metallic pipeline does not cover, from the inventory's own vocabulary. */
const NON_METALLIC = new Set(['concrete', 'timber', 'masonry']);
const NON_FERROUS = new Set(['aluminium']);

/**
 * One row per metallic member, for the grade stage.
 *
 * `authorityBound` decides whether a fully-specified member reads as `chosen` or as
 * `authorityBlocked`: with nothing bindable, «the grade is chosen» is the honest end of this
 * stage's story, and the authority problem belongs to the verification stage. Once something IS
 * bindable, a member with every datum present and still no check has to say so here too.
 */
export function gradeRows(
  inv: SteelInventory,
  sections: Map<number, RowSection>,
  elementSection: (elementId: number) => number | undefined,
  gradeSource: Pick<GradeSource, 'byId'>,
): GradeRow[] {
  return inv.members.map((m) => buildGradeRow(m, sections, elementSection, gradeSource));
}

function buildGradeRow(
  m: SteelMemberEntry,
  sections: Map<number, RowSection>,
  elementSection: (elementId: number) => number | undefined,
  gradeSource: Pick<GradeSource, 'byId'>,
): GradeRow {
  const sectionId = elementSection(m.elementId);
  const sec = sectionId == null ? undefined : sections.get(sectionId);
  const grade: GradeEntry | null = m.gradeId ? gradeSource.byId(m.gradeId) : null;
  const thicknessMm = governingThicknessMm(sec);
  const missing: MissingDatum[] = [];

  const outsidePipeline = NON_METALLIC.has(m.family.family) || NON_FERROUS.has(m.family.family);

  if (!m.gradeId) {
    /*
     * No grade declared. This is the one place the temptation to guess is strongest — the material
     * has an `fy`, and a plausible designation could be printed from it. It is not, and the row
     * says which datum is absent instead.
     */
    missing.push({
      key: 'steel.rows.missing.grade',
      whyKey: 'steel.rows.why.grade',
      severity: 'blocks',
    });
  } else if (!grade) {
    // A stored id the catalogue no longer knows: a withdrawn grade, or a project from a build with
    // a different catalogue. Distinct from «no grade», and the remedy is different too.
    missing.push({
      key: 'steel.rows.missing.gradeUnresolved',
      whyKey: 'steel.rows.why.gradeUnresolved',
      severity: 'blocks',
    });
  }

  /*
   * A grade with thickness bands, on a section with no thickness. `limits` and not `blocks`: the
   * check can run, reading the FIRST band — which is the thickest-material-excluded one, i.e. the
   * highest strength. So the answer is not unavailable, it is optimistic, and that is worth a
   * different word.
   */
  if (grade?.bands && grade.bands.length > 0 && thicknessMm == null) {
    missing.push({
      key: 'steel.rows.missing.thickness',
      whyKey: 'steel.rows.why.thickness',
      severity: 'limits',
    });
  }

  const state: StageRowState = outsidePipeline
    ? 'outOfScope'
    : missing.some((d) => d.severity === 'blocks')
      ? 'incomplete'
      : 'chosen';

  return {
    elementId: m.elementId,
    memberName: m.sectionName,
    materialName: m.materialName,
    family: m.family.family,
    familyBasis: m.family.basis,
    ...(m.family.caveatKey ? { familyCaveatKey: m.family.caveatKey } : {}),
    gradeId: m.gradeId ?? null,
    designation: grade?.designation ?? null,
    productStandard: grade?.productStandard ?? null,
    hasThicknessBands: !!(grade?.bands && grade.bands.length > 0),
    bandStandard: grade?.bandStandard ?? null,
    thicknessMm,
    missing,
    state,
    outsidePipeline,
  };
}

// ──────────────────────────── stage 3: section ────────────────────────────

/** How a section came to be, which decides what its provenance can even mean. */
export type SectionOrigin =
  /** Picked from a published table. Its properties are the table's. */
  | 'tabulated'
  /** Specified by dimensions — cold-formed C/Z. Properties derived from geometry, exactly. */
  | 'parametric'
  /** Built from a `SECTION_SHAPES` template, with `built` recording the inputs. */
  | 'built'
  /** Assembled from catalogue parts. */
  | 'composed'
  /** None of the above: a bare set of numbers with no declared origin. */
  | 'unknown';

export interface SectionRow {
  elementId: number;
  sectionName: string;
  /** The catalogue family, when there is one. `CFC`/`CFZ` for cold-formed. */
  family: string | null;
  /** The id that resolves in a source — the same string a saved `.ded` keeps. */
  catalogueId: string | null;
  origin: SectionOrigin;
  /** Which properties the row actually carries. */
  present: string[];
  /** Which the checker needs and this section does not have. */
  absent: string[];
  missing: MissingDatum[];
  state: StageRowState;
  /**
   * Whether what is missing is DATA or AUTHORITY, when something is missing.
   *
   * The distinction the brief asks for, and the reason it matters: a geometric gap is the user's to
   * close by picking a better section; an authority gap is not closeable by any input at all. A
   * surface that shows them the same way sends a user hunting for a datum that would change
   * nothing.
   */
  blockedBy: 'geometry' | 'authority' | null;
}

/** The properties the CIRSOC 301 checker reads, and the key naming each. */
const CHECKER_PROPERTIES = [
  ['a', 'steel.rows.prop.area'],
  ['iy', 'steel.rows.prop.strongInertia'],
  ['iz', 'steel.rows.prop.weakInertia'],
  ['h', 'steel.rows.prop.depth'],
  ['b', 'steel.rows.prop.flangeWidth'],
  ['tw', 'steel.rows.prop.webThickness'],
  ['tf', 'steel.rows.prop.flangeThickness'],
] as const;

/**
 * How this section came to be, decided from what it carries rather than from a stored flag.
 *
 * Order matters: a cold-formed designation is checked before `profileFamily`, because a cold-formed
 * row carries BOTH (`CFC` and a parseable name) and «parametric» is the more specific truth.
 */
export function sectionOrigin(sec: RowSection | undefined): SectionOrigin {
  if (!sec) return 'unknown';
  if (isColdFormedSection(sec) && sec.name && parseColdFormedDesignation(sec.name)) return 'parametric';
  if (sec.composition) return 'composed';
  if (sec.built) return 'built';
  if (sec.profileFamily) return 'tabulated';
  return 'unknown';
}

/**
 * One row per metallic member, for the section stage.
 *
 * `authorityBound` is threaded because a cold-formed section is the case where geometry is complete
 * and the answer is still no: CIRSOC 301 excludes it by name. That member is `authorityBlocked`
 * with `blockedBy: 'authority'`, and no section datum will move it — which is exactly what the row
 * has to say instead of listing a gap the user could chase.
 */
export function sectionRows(
  inv: SteelInventory,
  sections: Map<number, RowSection>,
  elementSection: (elementId: number) => number | undefined,
  profileSource: Pick<ProfileSource, 'byId'>,
): SectionRow[] {
  return inv.members.map((m) => {
    const sectionId = elementSection(m.elementId);
    const sec = sectionId == null ? undefined : sections.get(sectionId);
    const origin = sectionOrigin(sec);
    const entry: ProfileEntry | null = sec?.name ? profileSource.byId(sec.name) : null;

    const present: string[] = [];
    const absent: string[] = [];
    for (const [field, key] of CHECKER_PROPERTIES) {
      const v = sec?.[field as keyof RowSection] as number | undefined;
      (v != null && v > 0 ? present : absent).push(key);
    }

    const missing: MissingDatum[] = absent.map((key) => ({
      key,
      whyKey: `${key}.why`,
      severity: 'blocks' as const,
    }));

    const outsidePipeline = NON_METALLIC.has(m.family.family) || NON_FERROUS.has(m.family.family);
    /*
     * Cold-formed: complete geometry, no authority. CIRSOC 301 chapter A excludes cold-formed open
     * sections by name and defers to CIRSOC 303, which this app does not carry — so this is the one
     * row where `absent` can be empty and the answer is still «not designed».
     */
    const coldFormed = origin === 'parametric' && isColdFormedSection(sec);

    const state: StageRowState = outsidePipeline
      ? 'outOfScope'
      : absent.length > 0
        ? 'incomplete'
        : coldFormed
          ? 'authorityBlocked'
          : 'chosen';

    const blockedBy: SectionRow['blockedBy'] =
      state === 'incomplete' ? 'geometry' : state === 'authorityBlocked' ? 'authority' : null;

    return {
      elementId: m.elementId,
      sectionName: sec?.name ?? m.sectionName,
      family: sec?.profileFamily ?? entry?.family ?? null,
      catalogueId: entry?.id ?? (coldFormed ? sec?.name ?? null : null),
      origin,
      present,
      absent,
      missing: coldFormed && absent.length === 0
        ? [{
            key: 'steel.rows.missing.coldFormedAuthority',
            whyKey: 'steel.rows.why.coldFormedAuthority',
            severity: 'blocks',
          }]
        : missing,
      state,
      blockedBy,
    };
  });
}

/** i18n key for a row state. Never a raw enum on screen. */
export const rowStateKey = (s: StageRowState): string => `steel.rows.state.${s}`;
