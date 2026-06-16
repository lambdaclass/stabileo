/**
 * PR [9] review fix — the CAD-draft "unreviewed" provenance tag must survive a
 * share-link round-trip through the REAL compress/decompress. URL share/embed is
 * the one persistence path that crosses a trust boundary, so dropping the tag
 * there would hand a reviewer an auto-generated draft indistinguishable from a
 * hand-built, reviewed model. (snapshot/.ded/history/tabs already preserved it.)
 */
import { describe, it, expect } from 'vitest';
import { compressSnapshot, decompressSnapshot } from '../url-sharing';
import type { ModelSnapshot } from '../../store/history.svelte';
import type { ModelProvenance } from '../../model/provenance';

const provenance: ModelProvenance = {
  source: 'cad-dxf',
  fileName: 'plan.dxf',
  importedAtIso: '2026-06-09T12:00:00.000Z',
  status: 'cad-draft-unreviewed',
  assumptions: ['One plan replicated across all 3 floor(s).', 'Self-weight NOT included.'],
  layerMappings: [
    { layer: 'COLUMNS', role: 'column', suggested: 'column', confidence: 'high', evidence: 'name' },
  ],
};

function snap(withProvenance: boolean): ModelSnapshot {
  return {
    analysisMode: 'pro',
    name: 'cad-draft',
    nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 1, y: 0, z: 0 }]],
    materials: [[1, { id: 1, name: 'C', e: 30000000, nu: 0.2, rho: 2400 }]],
    sections: [],
    elements: [],
    supports: [],
    loads: [],
    loadCases: [],
    combinations: [],
    ...(withProvenance ? { provenance } : {}),
    nextId: { node: 3, material: 2, section: 1, element: 1, support: 1, load: 1, loadCase: 1, combination: 1 },
  } as unknown as ModelSnapshot;
}

describe('provenance URL round-trip', () => {
  it('preserves the unreviewed-draft tag, assumptions and layer mappings', () => {
    const out = decompressSnapshot(compressSnapshot(snap(true)));
    expect(out).not.toBeNull();
    expect(out!.provenance?.status).toBe('cad-draft-unreviewed');
    expect(out!.provenance?.fileName).toBe('plan.dxf');
    expect(out!.provenance?.assumptions.length).toBe(2);
    expect(out!.provenance?.layerMappings.length).toBe(1);
  });

  it('an ordinary (non-draft) model decodes without provenance', () => {
    const out = decompressSnapshot(compressSnapshot(snap(false)));
    expect(out!.provenance).toBeUndefined();
  });
});
