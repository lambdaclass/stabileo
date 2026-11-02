import type { SolverInput3D, SolverSupport3D } from '../../lib/engine/types-3d';
import type { ModelSnapshot } from '../../lib/store/history.svelte';
import { modelToCode } from '../../lib/model/code/format';
import { encodeCode, CODE_HASH } from '../../lib/model/code/share';
import { editorUrl } from '../tools/share';
import type { EditorModel } from './define';

const NO_RELEASE = { my: false, mz: false, t: false };

function supportType(s: SolverSupport3D) {
  const dofs = { tx: s.rx, ty: s.ry, tz: s.rz, rx: s.rrx, ry: s.rry, rz: s.rrz };
  const all = Object.values(dofs);
  if (all.every(Boolean)) return { type: 'fixed3d' };
  if (dofs.tx && dofs.ty && dofs.tz && !dofs.rx && !dofs.ry && !dofs.rz) return { type: 'pinned3d' };
  return { type: 'custom3d', dofRestraints: dofs, dofFrame: 'global' };
}

export function proCode(model: SolverInput3D & { masses?: unknown }, name: string): string {
  const snapshot = {
    name,
    analysisMode: 'pro',
    localAxisConvention: 'zUpStrongAxis',
    nodes: [...model.nodes.values()].map(n => [n.id, { id: n.id, x: n.x, y: n.y, z: n.z }]),
    materials: [...model.materials.values()].map(m => [m.id, { id: m.id, name: `E ${m.e} MPa`, e: m.e, nu: m.nu, rho: 0 }]),
    sections: [...model.sections.values()].map(s => [s.id, { id: s.id, name: `Section ${s.id}`, a: s.a, iz: s.iz, iy: s.iy, j: s.j }]),
    elements: [...model.elements.values()].map(e => [e.id, { id: e.id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ, materialId: e.materialId, sectionId: e.sectionId, releaseI: NO_RELEASE, releaseJ: NO_RELEASE }]),
    supports: [...model.supports.values()].map((s, k) => [k + 1, { id: k + 1, nodeId: s.nodeId, ...supportType(s) }]),
    loads: model.loads.flatMap((l, k) => l.type === 'nodal' ? [{ type: 'nodal3d', data: { ...l.data, id: k + 1, caseId: 1 } }] : []),
    loadCases: [{ id: 1, type: 'D', name: name }],
    combinations: [],
    quads: [...(model.quads?.values() ?? [])].map(q => [q.id, { id: q.id, nodes: q.nodes, materialId: q.materialId, thickness: q.thickness }]),
  } as unknown as ModelSnapshot;
  return modelToCode(snapshot);
}

export function editorHref(target: EditorModel, name: string): string {
  if (target.mode === '2d') return editorUrl(target.model, name);
  const query = typeof location !== 'undefined' && new URLSearchParams(location.search).get('e2e') === '1' ? '?e2e=1' : '';
  return `/app/pro${query}${CODE_HASH}${encodeCode(proCode(target.model, name))}`;
}
