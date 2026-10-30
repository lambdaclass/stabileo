import LZString from 'lz-string';
import type { Case } from './cases';

export function editorSnapshot(c: Case) {
  const entries = (v: object) => Object.entries(v).map(([id, value]) => [Number(id), value]);
  const nodes = Object.values(c.input.nodes).map(n => [n.id, { id: n.id, x: n.x, y: n.z, z: 0 }]);
  const supports = Object.entries(c.input.supports).map(([id, s]) => [Number(id), { id: Number(id), nodeId: s.nodeId, type: 'fixed' }]);
  return {
    name: `Mattiasson: ${c.id}`, analysisMode: '2d', localAxisConvention: 'zUpStrongAxis',
    nodes, materials: Object.values(c.input.materials).map(m => [m.id, { ...m, name: 'Benchmark material', rho: 0 }]),
    sections: Object.values(c.input.sections).map(s => [s.id, { ...s, name: 'Benchmark section' }]),
    elements: entries(c.input.elements), supports, quads: [], plates: [],
    loads: c.input.loads.map((l, i) => ({ ...l, type: 'nodal', data: { ...l.data, id: i + 1, caseId: 1, fy: l.data.fz, mz: l.data.my } })),
    loadCases: [{ id: 1, name: 'Benchmark', type: 'other' }], combinations: [], constraints: [],
    includeSelfWeight: false, _shareMeta: { includeSelfWeight: false, autoSolve: false }, nextId: {},
  };
}

export function editorURL(c: Case, base: string): string {
  return `${base}#data=${LZString.compressToEncodedURIComponent(JSON.stringify(editorSnapshot(c)))}`;
}
