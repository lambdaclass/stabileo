import LZString from 'lz-string';
import type { Case } from './cases';
import { caseLabel, strings } from './i18n';

type Names = Pick<typeof strings.en, 'editorMaterial' | 'editorSection' | 'editorLoadCase'> & Parameters<typeof caseLabel>[1];

export function editorSnapshot(c: Case, s: Names = strings.en) {
  const entries = (v: object) => Object.entries(v).map(([id, value]) => [Number(id), value]);
  const nodes = Object.values(c.input.nodes).map(n => [n.id, { id: n.id, x: n.x, y: c.dimension === 2 ? n.z : ('y' in n ? n.y : 0), z: c.dimension === 2 ? 0 : n.z }]);
  const supports = Object.entries(c.input.supports).map(([id, sup]) => [Number(id), { id: Number(id), nodeId: sup.nodeId, type: 'fixed' }]);
  return {
    name: `MacNeal–Harder: ${caseLabel(c.id, s)}`, analysisMode: c.dimension === 2 ? '2d' : 'pro', localAxisConvention: 'zUpStrongAxis',
    nodes, materials: Object.values(c.input.materials).map(m => [m.id, { ...m, name: s.editorMaterial, rho: 0 }]),
    sections: Object.values(c.input.sections).map(sec => [sec.id, { ...sec, name: s.editorSection }]),
    elements: entries(c.input.elements), supports, quads: entries(c.input.quads ?? {}), plates: [],
    loads: c.input.loads.map((l, i) => ({ ...l, type: c.dimension === 2 ? 'nodal' : 'nodal3d', data: { ...l.data, id: i + 1, caseId: 1, ...(c.dimension === 2 ? { fy: l.data.fz, mz: l.data.my } : {}) } })),
    loadCases: [{ id: 1, name: s.editorLoadCase, type: 'other' }], combinations: [], constraints: [],
    includeSelfWeight: false, _shareMeta: { includeSelfWeight: false, autoSolve: false }, nextId: {},
  };
}

export function editorURL(c: Case, base: string, s: Names = strings.en): string {
  return `${base}#data=${LZString.compressToEncodedURIComponent(JSON.stringify(editorSnapshot(c, s)))}`;
}
