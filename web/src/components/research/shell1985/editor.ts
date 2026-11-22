import LZString from 'lz-string';
import type { Case } from './cases';
import { strings, type ShellStrings } from './i18n';

type Names = Pick<ShellStrings, 'editorMaterial' | 'editorLoadCase' | 'roof' | 'cylinder' | 'hemisphere'>;

export function editorSnapshot(c: Case, s: Names = strings.en) {
  const entries = (v: object) => Object.entries(v).map(([id, value]) => [Number(id), value]);
  const supports = Object.entries(c.input.supports).map(([id, sup]) => [Number(id), {
    id: Number(id), nodeId: sup.nodeId, type: 'custom3d', dofFrame: 'global',
    dofRestraints: { tx: sup.rx, ty: sup.ry, tz: sup.rz, rx: sup.rrx, ry: sup.rry, rz: sup.rrz },
  }]);
  return {
    name: `${s[c.group as 'roof' | 'cylinder' | 'hemisphere']} ${c.mesh} × ${c.mesh}`, analysisMode: 'pro', localAxisConvention: 'zUpStrongAxis',
    nodes: entries(c.input.nodes), materials: Object.values(c.input.materials).map(m => [m.id, { ...m, name: s.editorMaterial, rho: 0 }]),
    sections: [], elements: [], supports, quads: entries(c.input.quads), plates: [],
    loads: c.input.loads.map((l, i) => ({ ...l, type: 'nodal3d', data: { ...l.data, id: i + 1, caseId: 1 } })),
    loadCases: [{ id: 1, name: s.editorLoadCase, type: 'other' }], combinations: [], constraints: [],
    includeSelfWeight: false, _shareMeta: { includeSelfWeight: false, autoSolve: false }, nextId: {},
  };
}

export function editorURL(c: Case, base: string, s: Names = strings.en): string {
  return `${base}#data=${LZString.compressToEncodedURIComponent(JSON.stringify(editorSnapshot(c, s)))}`;
}
