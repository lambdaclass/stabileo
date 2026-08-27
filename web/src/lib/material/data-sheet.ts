/**
 * The full data sheet for a chosen material — identity, provenance, properties, bands.
 *
 * ── Composed, not calculated ────────────────────────────────────────
 *
 * The same shape as `section/data-sheet.ts`, and for the same reason: the facts exist across
 * three modules that have never been put beside each other. `grades/catalogue.ts` produces the
 * properties with a `GradeBasis` on each and the thickness bands with the standard that
 * tabulates them; `data/material-presets.ts` produces the catalogue rows and the category
 * taxonomy; `data/structural-grades.ts` holds the design codes.
 *
 * Nothing here computes a material property. A value shown without saying where it came from
 * is the thing this file exists to prevent, not a thing it produces.
 *
 * ── The distinction the sheet must not blur ─────────────────────────
 *
 * A **product standard** — IRAM-IAS U 500-503, ASTM A572 — fixes what the steel IS. A **design
 * code** — CIRSOC 301, Eurocode 3 — says how to verify a member made of it. And a **band
 * standard** is a third thing again: every thickness band in this catalogue comes from a
 * DESIGN code's table, never from the product standard, which is why `GradeEntry` carries
 * `bandStandard` separately and why this sheet shows it on the band block rather than beside
 * the designation. Showing a band under the product standard would attribute a table to a
 * document that never published it.
 */

import type { MaterialPreset } from '../data/material-presets';
import { categoryFamily } from '../data/material-presets';
import {
  gradePropertyRows, bandTable, structuralGradeSource, GRADE_PROPERTY_ORDER,
  type GradeEntry, type GradePropertyRow,
} from '../grades/catalogue';
import { codesForFamily } from '../data/structural-grades';
import type { ThicknessBand } from '../data/structural-grades';

export interface MaterialIdentity {
  /** How it is written on a drawing: `F-24`, `S355`, `H-25`. */
  designation: string;
  /** Picker category id — `acero`, `hormigon`, … */
  category: string | null;
  /** Grade family, or null for concrete and timber, which have none in the metal sense. */
  family: string | null;
  /** The PRODUCT standard. Never a design code. */
  productStandard: string | null;
  region: string | null;
  /** Design codes whose tables are written around this family. Empty for the non-metals. */
  designCodes: readonly string[];
  /** Whether the values were read from the governing standard or carried from general knowledge. */
  verification: 'standard' | 'typical' | null;
  /** The catalogue id, when there is one. Null is what makes a material un-classifiable. */
  gradeId: string | null;
}

/** Thickness dependence, with the standard that tabulates it. */
export interface BandBlock {
  present: true;
  rows: readonly ThicknessBand[];
  /** The DESIGN code that publishes the table, which is never the product standard. */
  standard: string;
}

export interface NoBandBlock {
  present: false;
  reasonKey: string;
}

export interface MaterialLimitation {
  key: string;
  kind: 'data' | 'classification';
}

export interface MaterialDataSheet {
  identity: MaterialIdentity;
  /** fy, fu, E, G, nu, rho — each with the basis it was arrived at. */
  rows: GradePropertyRow[];
  bands: BandBlock | NoBandBlock;
  limitations: MaterialLimitation[];
}

export interface MaterialSheetInput {
  preset?: MaterialPreset | null;
  /** The grade behind the preset, when it has one. Looked up by the caller or by us. */
  grade?: GradeEntry | null;
}

/**
 * The sheet for a preset, a grade, or a preset with its grade resolved.
 *
 * A preset with a `gradeId` gets the full sheet: the grade supplies the property bases and the
 * bands. A preset without one — concrete, timber, the reinforcing bar — gets identity and
 * limitations, and says which of the two it is rather than showing an empty table.
 */
export function materialDataSheet(input: MaterialSheetInput): MaterialDataSheet {
  const { preset } = input;
  const grade = input.grade
    ?? (preset?.gradeId ? structuralGradeSource.byId(preset.gradeId) : null)
    ?? null;

  const category = preset?.category ?? null;
  const family = grade?.family ?? (category ? categoryFamily(category) : null);

  const identity: MaterialIdentity = {
    designation: grade?.designation ?? preset?.name ?? '',
    category,
    family,
    productStandard: grade?.productStandard ?? preset?.standard ?? null,
    region: grade?.region ?? preset?.region ?? null,
    /*
     * Design codes come from the FAMILY, not from the grade, because that is how the catalogue
     * models it: a code covers a family, and one grade can be verified under several codes.
     */
    designCodes: family ? codesForFamily(family as never).map((c) => c.name) : [],
    verification: grade?.verification ?? null,
    gradeId: grade?.id ?? preset?.gradeId ?? null,
  };

  const table = grade ? bandTable(grade) : null;
  const bands: BandBlock | NoBandBlock = table
    ? { present: true, rows: table.rows, standard: table.standard }
    : {
        present: false,
        /*
         * Two different absences, and collapsing them would tell a user their concrete is
         * missing data it never had. A metal with no bands has a source that quotes one value
         * for every thickness; a non-metal has no band concept at all.
         */
        reasonKey: family
          ? 'material.sheet.bands.singleValue'
          : 'material.sheet.bands.notApplicable',
      };

  const limitations: MaterialLimitation[] = [];
  if (!identity.gradeId) {
    /*
     * Without a declared grade the app falls back to `fy > 80`, which cannot tell aluminium
     * from steel — measured: 5052-H32 at fy = 195 comes back as steel. One of the twenty-eight
     * steel presets is in this state; every other row in the catalogue carries an id.
     */
    limitations.push({ key: 'material.sheet.limit.noGradeId', kind: 'classification' });
  } else if (!grade) {
    /*
     * A grade id the METAL grade database does not know.
     *
     * I expected this to be the concrete and timber case only, and assumed those rows carried
     * no id at all — they do: `H-20` is `cirsoc-h20`, `C16` is `en338-c16`. All six categories
     * are fully identified. What differs is WHERE the properties live: the non-metals are
     * described by `non-metal-grades.ts` and by the preset row itself, not by
     * `structural-grades.ts`, so `structuralGradeSource.byId` returns nothing for them.
     *
     * That is a limitation of this sheet's depth, not of the material's identity, and the
     * distinction is the difference between "we know less here" and "this is unidentified".
     */
    limitations.push({ key: 'material.sheet.limit.gradeNotInMetalDatabase', kind: 'data' });
  }
  if (identity.verification === 'typical') {
    limitations.push({ key: 'material.sheet.limit.typicalValues', kind: 'data' });
  }
  if (grade && !grade.bands) {
    limitations.push({ key: 'material.sheet.limit.noThicknessBands', kind: 'data' });
  }

  return {
    identity,
    /*
     * Rows from the grade when there is one, and from the PRESET otherwise.
     *
     * A concrete sheet with an empty property table would be worse than no sheet: the numbers
     * exist, on the row the user just picked. What they lack is the per-field authority a
     * `GradeEntry` carries, so they are marked `typicalValue` — the catalogue's own word for
     * "an ordinary value for the material, not one read from the governing table" — rather than
     * promoted to `productStandard`, which would be a claim about a document this module never
     * opened.
     */
    rows: grade ? gradePropertyRows(grade) : presetRows(preset),
    bands,
    limitations,
  };
}

/**
 * Property rows for a preset with no entry in the metal grade database.
 *
 * Deliberately not `productStandard`, even though the preset names one: the preset carries four
 * numbers and a standard's NAME, not which of the four that standard fixes.
 */
function presetRows(p: MaterialPreset | null | undefined): GradePropertyRow[] {
  if (!p) return [];
  const q = (
    value: number | null, unit: GradePropertyRow['quantity']['unit'],
  ): GradePropertyRow['quantity'] =>
    value === null
      ? { value: null, unit, basis: 'unavailable', noteKey: 'material.sheet.notPublished' }
      : { value, unit, basis: 'typicalValue' };
  const rows: Record<string, GradePropertyRow['quantity']> = {
    fy: q(p.fy ?? null, 'MPa'),
    fu: q(p.fu ?? null, 'MPa'),
    e: q(p.e, 'MPa'),
    // `G = E / 2(1 + nu)` is exact isotropic elasticity on two numbers that are present, so it
    // is `derived` here exactly as it is on a full grade card.
    g: {
      value: p.e / (2 * (1 + p.nu)), unit: 'MPa', basis: 'derived',
      noteKey: 'steel.grades.note.shearModulusDerived',
    },
    nu: q(p.nu, '-'),
    rho: q(p.rho, 'kN/m3'),
  };
  return GRADE_PROPERTY_ORDER.map((key) => ({
    key, labelKey: `steel.grades.label.${key}`, quantity: rows[key],
  }));
}
