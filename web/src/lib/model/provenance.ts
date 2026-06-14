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

export interface ModelProvenance {
  source: 'cad-dxf';
  fileName: string;
  importedAtIso: string;
  /** 'cad-draft-unreviewed' until the user explicitly marks it reviewed. */
  status: 'cad-draft-unreviewed' | 'reviewed';
  /** Human-readable engineering assumptions baked into the draft. */
  assumptions: string[];
  /** Layer-role mapping in effect when the draft was generated. */
  layerMappings: ProvenanceLayerMapping[];
}
