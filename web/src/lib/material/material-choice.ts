/**
 * What the PRO material selector returns, and how it lands on a `Material`.
 *
 * ── The defect this closes, measured ────────────────────────────────
 *
 * `ProMaterialsTab.addPreset` wrote five fields — `name`, `e`, `nu`, `rho`, `fy` — and dropped
 * everything else the preset carried. `MaterialPreset` also holds `gradeId`, `standard`,
 * `region` and `fu`, and `Material.gradeId` has existed since PR #132 precisely so that the
 * app can tell what a material IS from a recorded fact instead of from a magnitude.
 *
 * The consequence is not theoretical. `materialFamilyOf` prefers a declared grade and falls
 * back to `fy > 80` otherwise, and that fallback cannot tell one metal from another:
 *
 *   · aluminium **5052-H32**, `fy = 195`, added through the PRO tab →
 *     `{ family: 'steel', basis: 'inferredFromFy' }`
 *   · the same preset with its `gradeId` →
 *     `{ family: 'aluminium', basis: 'declaredGrade' }`
 *
 * So an aluminium member entered in PRO joined the metallic steel inventory and was offered
 * CIRSOC 301. 27 of the 28 steel presets carry a `gradeId`; every one of them was being
 * discarded at the moment of selection.
 *
 * ── Why a module rather than four more lines in the tab ─────────────
 *
 * Because three surfaces write materials — the materials tab, the generators' grade trigger,
 * and the modal — and a field dropped in one of them is invisible until something downstream
 * misclassifies a member. One conversion, one place, one test.
 */

import type { MaterialPreset } from '../data/material-presets';
import type { GradeEntry } from '../grades/catalogue';

export type MaterialChoice =
  /** A row from the shipped catalogue, metals and non-metals alike. */
  | { kind: 'preset'; preset: MaterialPreset }
  /**
   * A grade from the grade database directly, as the generators' picker produces.
   *
   * Kept separate from `preset` because a `GradeEntry` is not a `MaterialPreset`: it has no
   * category, and its `fyMPa` is explicitly «the value for the FIRST thickness band» rather
   * than a single number. Flattening one into the other would lose which is which.
   */
  | { kind: 'grade'; grade: GradeEntry }
  /**
   * A material the project states by hand, because the catalogue does not carry it.
   *
   * The third way in, and the reason it is a `MaterialChoice` at all: it used to be a form on
   * `ProMaterialsTab` that called `modelStore.addMaterial` with its own literal, which made the
   * tab a second source of material creation beside the modal. Folding it into the choice type
   * is what let the tab stop writing to the model.
   *
   * It carries no `gradeId`, no `standard` and no `region` — not because they are optional here,
   * but because a hand-entered material HAS none of them. Synthesising any of the three is the
   * defect this module was written to prevent, one direction over.
   */
  | { kind: 'custom'; name: string; e: number; nu: number; rho: number; fy?: number };

/** The subset of `Material` a choice writes. Deliberately not the whole interface. */
export interface MaterialFields {
  name: string;
  /** MPa. */
  e: number;
  nu: number;
  /** kN/m³. */
  rho: number;
  /** MPa. Absent for a material with no yield point. */
  fy?: number;
  /** MPa. */
  fu?: number;
  /**
   * The catalogued grade this came from.
   *
   * The field that turns "steel because fy is above 80" into "aluminium because the project
   * says 5052-H32". Written whenever the source has one, never synthesised.
   */
  gradeId?: string;
  /** The PRODUCT standard, never a design code. */
  standard?: string;
  region?: string;
}

/**
 * The fields to write for a choice.
 *
 * Every optional field is emitted only when the source actually carries it. A `gradeId` of
 * `undefined` and a `gradeId` of `''` are different claims, and the second one would satisfy a
 * lookup that then returns nothing.
 */
export function toMaterialFields(choice: MaterialChoice): MaterialFields {
  if (choice.kind === 'preset') {
    const p = choice.preset;
    return {
      name: p.name,
      e: p.e,
      nu: p.nu,
      rho: p.rho,
      ...(p.fy !== undefined ? { fy: p.fy } : {}),
      ...(p.fu !== undefined ? { fu: p.fu } : {}),
      ...(p.gradeId ? { gradeId: p.gradeId } : {}),
      ...(p.standard ? { standard: p.standard } : {}),
      ...(p.region ? { region: p.region } : {}),
    };
  }
  if (choice.kind === 'custom') {
    return {
      name: choice.name,
      e: choice.e,
      nu: choice.nu,
      rho: choice.rho,
      ...(choice.fy !== undefined ? { fy: choice.fy } : {}),
    };
  }
  const g = choice.grade;
  return {
    /*
     * The designation is the name. Not «F-24 (IRAM-IAS U 500-503)» — the standard is its own
     * field, and folding it into the name is how a designation stops being matchable.
     */
    name: g.designation,
    e: g.eMPa,
    nu: g.nu,
    rho: g.rhoKNM3,
    fy: g.fyMPa,
    fu: g.fuMPa,
    gradeId: g.id,
    standard: g.productStandard,
    region: g.region,
  };
}

/** Whether a choice can name the family it belongs to, rather than leaving it to be inferred. */
export function declaresGrade(choice: MaterialChoice): boolean {
  if (choice.kind === 'grade') return true;
  if (choice.kind === 'custom') return false;
  return Boolean(choice.preset.gradeId);
}

/** The id a choice persists as, so a selection survives a reload. Null when it has none. */
export function choiceGradeId(choice: MaterialChoice): string | null {
  if (choice.kind === 'grade') return choice.grade.id;
  if (choice.kind === 'custom') return null;
  return choice.preset.gradeId ?? null;
}
