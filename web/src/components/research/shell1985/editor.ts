import LZString from 'lz-string';
import type { Case } from './cases';

export function editorSnapshot(c: Case) {
  const entries = (v: object) => Object.entries(v).map(([id, value]) => [Number(id), value]);
  const supports = Object.entries(c.input.supports).map(([id, s]) => [Number(id), {
    id: Number(id), nodeId: s.nodeId, type: 'custom3d', dofFrame: 'global',
    dofRestraints: { tx: s.rx, ty: s.ry, tz: s.rz, rx: s.rrx, ry: s.rry, rz: s.rrz },
  }]);
  return {
    name: `Shell obstacle course: ${c.label}`, analysisMode: 'pro', localAxisConvention: 'zUpStrongAxis',
    nodes: entries(c.input.nodes), materials: Object.values(c.input.materials).map(m => [m.id, { ...m, name: 'Benchmark material', rho: 0 }]),
    sections: [], elements: [], supports, quads: entries(c.input.quads), plates: [],
    loads: c.input.loads.map((l, i) => ({ ...l, type: 'nodal3d', data: { ...l.data, id: i + 1, caseId: 1 } })),
    loadCases: [{ id: 1, name: 'Benchmark', type: 'other' }], combinations: [], constraints: [],
    includeSelfWeight: false, _shareMeta: { includeSelfWeight: false, autoSolve: false }, nextId: {},
  };
}

export function editorURL(c: Case, base: string): string {
  return `${base}#data=${LZString.compressToEncodedURIComponent(JSON.stringify(editorSnapshot(c)))}`;
}
