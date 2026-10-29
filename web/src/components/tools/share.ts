import { deflateSync } from 'fflate';
import type { SolverInput } from '../../lib/engine/types';
import { currentResultsVersion } from '../../lib/provenance/result-changes.json';

export function editorUrl(model: SolverInput, name: string) {
  const compact = {
    m: '2d', nm: name, lx: 'zUpStrongAxis', sv: 6,
    n: [...model.nodes.values()].map(n => [n.id, n.x, n.z]),
    mt: [...model.materials.values()].map(m => [m.id, 'E', m.e, m.nu, 0]),
    sc: [...model.sections.values()].map(s => [s.id, 'I', s.a, s.iz]),
    e: [...model.elements.values()].map(e => [e.id, 0, e.nodeI, e.nodeJ, e.materialId, e.sectionId]),
    s: [...model.supports.values()].map(s => [s.id, s.nodeId, s.type]),
    l: model.loads.map((l, i) => ({ ...l, data: { ...l.data, id: i + 1, caseId: 1 } })),
    ni: [model.nodes.size + 1, 2, 2, model.elements.size + 1, model.supports.size + 1, model.loads.length + 1],
    _: { autoSolve: true, diagramType: 'moment', includeSelfWeight: false },
    sw: { resultsVersion: currentResultsVersion, resultsSchemaVersion: 1, analyses: [] },
  };
  const bytes = deflateSync(new TextEncoder().encode(JSON.stringify(compact)));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `/app/basic#data=2.${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
