// Model provenance: where a model came from and whether it has been reviewed.
//
// Today the only producer is the CAD → RC draft wizard, which tags generated
// models as unreviewed drafts. The tag travels inside ModelSnapshot (and
// therefore .ded files, undo history, and tabs) and is cleared only by an
// explicit user action.
//
// The layer-mapping entry is declared structurally here (instead of importing
// from lib/cad/types) so this module stays dependency-free: history.svelte.ts
// references it from ModelSnapshot, and lib/cad/types references
// ModelSnapshot — importing cad types here would close that cycle.

export interface ProvenanceLayerMapping {
  layer: string;
  role: string;
  suggested: string;
  confidence: string;
  evidence: string;
}

/**
 * Where a model came from.
 *
 * `cad-dxf` is an IMPORT: an outside file was read and interpreted. The generator sources
 * are the opposite — nothing was interpreted, the geometry was constructed from parameters
 * this app owns — but they share the property that matters here: the model carries
 * engineering assumptions its author did not type, and those have to travel with it.
 */
export type ProvenanceSource =
  | 'cad-dxf'
  | 'generator-truss'
  | 'generator-lattice-column'
  | 'generator-shed';

export interface ModelProvenance {
  source: ProvenanceSource;
  /** Source file for an import; the generator's display name for a generated model. */
  fileName: string;
  importedAtIso: string;
  /**
   * `cad-draft-unreviewed` until the user explicitly marks it reviewed.
   *
   * `generated-unreviewed` is its counterpart: a generated model is geometry plus a set of
   * assumptions, and until somebody has read them it is a draft in exactly the sense the
   * CAD import is. Cleared the same way.
   */
  status: 'cad-draft-unreviewed' | 'generated-unreviewed' | 'reviewed';
  /**
   * Engineering assumptions baked into the model.
   *
   * For a CAD import these are prose. For a generated model they are i18n KEYS, translated
   * at the boundary — a generator runs below the i18n layer and has no business producing
   * Spanish, and the same model has to be readable in whatever locale it is opened in.
   * `assumptionsAreKeys` says which, so a renderer cannot guess wrong.
   */
  assumptions: string[];
  /** True when `assumptions` holds i18n keys rather than prose. */
  assumptionsAreKeys?: boolean;
  /** Layer-role mapping in effect when the draft was generated. Imports only. */
  layerMappings: ProvenanceLayerMapping[];
  /**
   * The exact parameters a generator was run with.
   *
   * So that a generated model can be REGENERATED — or argued with — instead of only
   * inspected. A user who finds the purlin spacing wrong needs to know what was asked for,
   * not to reverse-engineer it from the node coordinates.
   */
  generatorParams?: Record<string, unknown>;
}

/** True when this model was produced by a generator rather than imported or hand-built. */
export function isGenerated(p: ModelProvenance | undefined): boolean {
  return !!p && p.source.startsWith('generator-');
}
