/**
 * Validation for `RcCadHandoffV2`, in the same two layers V1 uses and for the same reason.
 *
 *   SCHEMA    — is the document the right SHAPE? Delegated to `rc-cad-handoff-v2.schema.json`,
 *               which is the artifact the CAD side shares.
 *   SEMANTIC  — does it MEAN something coherent, and does it avoid claiming more than Stabileo
 *               verified?
 *
 * ── What V2's semantic layer has to catch that V1's did not ─────────
 *
 * V2 carries five families, two of which describe the same physical mat from two directions, plus
 * a resolved layer order stated once. Every one of those is a place where the document could say
 * two things that cannot both be true — and "do not duplicate geometric truth across
 * contradictory fields" is only a rule if something enforces it. So:
 *
 *   * the family whose direction IS the lower direction must be the LOWER layer, and the other
 *     must be UPPER. A document naming X as lower while its X family says UPPER is refused;
 *   * `bottomMatGeometry: MODELED` and the presence of mat families must agree, both ways;
 *   * `completeness: bottomMatAndConnection` requires the mats to actually be here;
 *   * `constructible: false` requires a blocker, and `true` requires none — a false verdict with
 *     no stated cause is unactionable, and a true one with a blocker is self-contradictory;
 *   * clear-spacing findings and the constructibility verdict must agree: four measured failures
 *     with `constructible: true` is exactly the clean-pass claim V2 exists to prevent.
 *
 * The V1 rules that still apply are re-stated rather than imported, because V1's module reads
 * V1's shape — `assembly.families` has a different item type — and a shared walker parameterised
 * over both would be harder to read than two explicit lists.
 *
 * Pure: no store, no runes, no i18n. Messages are developer-facing.
 */

import schemaJson from './rc-cad-handoff-v2.schema.json';
import { validateAgainstSchema, type SchemaViolation } from './json-schema-subset';
import {
  validateRcCadHandoffV2Semantics, type SemanticViolation,
} from './rc-cad-handoff-v2-semantics';

export { validateRcCadHandoffV2Semantics };
export type { SchemaViolation, SemanticViolation };

export const RC_CAD_HANDOFF_V2_SCHEMA_DOC = schemaJson as unknown as Record<string, unknown>;

export interface RcCadV2Validation {
  ok: boolean;
  schema: SchemaViolation[];
  semantic: SemanticViolation[];
}

/** Shape only. */
export function validateRcCadHandoffV2Schema(doc: unknown): SchemaViolation[] {
  return validateAgainstSchema(doc, RC_CAD_HANDOFF_V2_SCHEMA_DOC);
}

/** Both layers. Schema first, because a mis-shaped document makes semantic messages noise. */
export function validateRcCadHandoffV2(doc: unknown): RcCadV2Validation {
  const schema = validateRcCadHandoffV2Schema(doc);
  const semantic = validateRcCadHandoffV2Semantics(doc);
  return { ok: schema.length === 0 && semantic.length === 0, schema, semantic };
}
