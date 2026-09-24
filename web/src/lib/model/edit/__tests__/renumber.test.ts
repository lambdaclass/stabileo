/**
 * Renumbering by position rewrites every reference, and the structure is the same structure.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { validateAndSolve3D } from '../../../engine/solver-service';
import * as wasmSolver from '../../../engine/wasm-solver';
import { renumber } from '../renumber';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

function solve() {
  const md = {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
  };
  const r = validateAndSolve3D(md as never, false, false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
}

/** A portal numbered out of order on purpose: the top nodes first. */
function scrambled() {
  const top2 = modelStore.addNode(5, 0, 3), top1 = modelStore.addNode(0, 0, 3);
  const base2 = modelStore.addNode(5, 0, 0), base1 = modelStore.addNode(0, 0, 0);
  const beam = modelStore.addElement(top1, top2, 'frame');
  const col2 = modelStore.addElement(base2, top2, 'frame'), col1 = modelStore.addElement(base1, top1, 'frame');
  modelStore.addSupport(base1, 'fixed3d');
  modelStore.addSupport(base2, 'fixed3d');
  modelStore.addNodalLoad3D(top1, 10, 0, 0, 0, 0, 0, 1);
  modelStore.addDistributedLoad3D(beam, 0, 0, -8, -8, undefined, undefined, 1);
  const g = modelStore.addGroup('columns', 'selection', { elements: [col1, col2], nodes: [base1, base2] });
  historyStore.clear();
  return { top1, top2, base1, base2, beam, col1, col2, g };
}

describe('renumber', () => {
  it('numbers bottom-up, rewrites every reference, and solves as the same structure', () => {
    const s = scrambled();
    const pos = (id: number) => { const n = modelStore.nodes.get(id)!; return `${n.x},${n.y},${n.z ?? 0}`; };
    const before = solve();
    const dispAt = new Map(before.displacements.map((d) => [pos(d.nodeId), d]));
    const r = renumber({ nodes: true, members: true, order: 'zyx' });
    if ('refused' in r) throw new Error('refused');
    expect(r.changedNodes).toBe(4);
    // Bottom storey first, then along x.
    expect([1, 2, 3, 4].map(pos)).toEqual(['0,0,0', '5,0,0', '0,0,3', '5,0,3']);
    const after = solve();
    for (const d of after.displacements) {
      const d0 = dispAt.get(pos(d.nodeId))!;
      for (const k of ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const) expect(d[k]).toBeCloseTo(d0[k], 12);
    }
    const g = modelStore.model.groups.get(s.g)!;
    expect(g.members.nodes!.map(pos).sort()).toEqual(['0,0,0', '5,0,0']);
    expect(g.members.elements!.every((id) => { const e = modelStore.elements.get(id)!; return pos(e.nodeI).endsWith(',0'); })).toBe(true);
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo();
    expect(pos(s.top2)).toBe('5,0,3');
  });

  it('refuses a model that carries design documents', () => {
    scrambled();
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    // A joint design is keyed by node: renumbering under it would attach it to another node.
    snap.jointDesigns = { version: 1, joints: [{ nodeId: 1, choices: {}, fingerprint: 'x' }] };
    modelStore.restore(snap);
    const r = renumber({ nodes: true, members: true, order: 'zyx' });
    expect(r).toMatchObject({ refused: 'hasDesignDocuments' });
  });
});
