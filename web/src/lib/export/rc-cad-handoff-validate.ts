/**
 * Validation for `RcCadHandoffV1`, in two layers that answer different questions.
 *
 *   SCHEMA    — is the document the right SHAPE? Types, required fields, enums, no stray keys.
 *               Delegated to the JSON Schema, which is the artifact the CAD side shares.
 *   SEMANTIC  — does the document MEAN something coherent? Do its ids resolve, do its
 *               dimensions describe a solid, and above all: does it avoid claiming more than
 *               Stabileo verified?
 *
 * The second layer is where the honesty of the manifest actually lives, because a document can
 * be perfectly shaped and still say something false. Three refusals matter most:
 *
 *   * a `completeFootingReinforcement` claim while an unsupported condition states the mats are
 *     not modelled — the claim this whole POC exists not to make;
 *   * a footing cover requirement scoped onto the column stub — applying a footing's number to
 *     a component whose cover nobody evaluated;
 *   * a containment or cover PASS while Stabileo's own status is NOT_EVALUATED — the exact
 *     conversion the deferred-cover decision forbids.
 *
 * Pure: no store, no runes, no i18n. Messages here are developer-facing; user-facing text is
 * the caller's business.
 */

import schemaJson from './rc-cad-handoff.schema.json';
import { validateAgainstSchema, type SchemaViolation } from './json-schema-subset';
import {
  validateRcCadHandoffSemantics, type SemanticViolation,
} from './rc-cad-handoff-semantics';

export { validateRcCadHandoffSemantics };
export type { SchemaViolation, SemanticViolation };

export const RC_CAD_HANDOFF_SCHEMA_DOC = schemaJson as unknown as Record<string, unknown>;

export interface RcCadValidation {
  ok: boolean;
  schema: SchemaViolation[];
  semantic: SemanticViolation[];
}

/** Shape only. */
export function validateRcCadHandoffSchema(doc: unknown): SchemaViolation[] {
  return validateAgainstSchema(doc, RC_CAD_HANDOFF_SCHEMA_DOC);
}

/** Both layers. Schema first, because a mis-shaped document makes semantic messages noise. */
export function validateRcCadHandoff(doc: unknown): RcCadValidation {
  const schema = validateRcCadHandoffSchema(doc);
  const semantic = validateRcCadHandoffSemantics(doc);
  return { ok: schema.length === 0 && semantic.length === 0, schema, semantic };
}
