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

  it('refuses while a load names a node or a member the model does not have: renumbered, it would land on another', () => {
    const s = scrambled();
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    // From an older file: a tendon on a member and a settlement at a node, both long deleted.
    snap.loads.push({ type: 'prestress3d', data: { id: 90, elementId: 2 + Math.max(s.beam, s.col1, s.col2), force: 500, eI: 0, eM: -0.2, eJ: 0 } });
    snap.loads.push({ type: 'displacement3d', data: { id: 91, nodeId: 9, dz: -0.01 } });
    modelStore.restore(snap);
    const before = JSON.stringify(modelStore.snapshot());
    expect(renumber({ nodes: true, members: true, order: 'zyx' })).toEqual({ refused: 'orphanLoads', ids: [90, 91] });
    expect(renumber({ nodes: true, members: false, order: 'zyx' })).toEqual({ refused: 'orphanLoads', ids: [91] });
    expect(JSON.stringify(modelStore.snapshot())).toBe(before);
  });
});

it.each(['explicit', 'group'] as const)(
  '#2565 — checks the actual ID claims for a missing %s member selector',
  kind => {
    const { beam, top1, top2, base1, base2 } = scrambled();
    const shell = modelStore.addQuad([base1, base2, top2, top1], 1, 0.2);
    const missing = 20;
    const ids = [missing + 3, missing];
    const group = modelStore.addGroup('Stale members', 'selection', { elements: ids });
    modelStore.setAnalysis({ selfWeight: [{
      caseId: 1, direction: 'Z', factor: -1,
      ...(kind === 'explicit' ? { elements: ids } : { groupId: group }),
    }] });
    expect.soft(renumber({ nodes: false, members: false, shells: true, order: 'xyz', start: missing }))
      .toMatchObject({ changedShells: 1 });
    expect.soft(modelStore.quads.get(missing)?.nodes).toEqual([base1, base2, top2, top1]);
    expect.soft(modelStore.quads.has(shell)).toBe(false);

    const opts = { nodes: false, members: true, order: 'xyz' as const };
    expect.soft(renumber({ ...opts, only: { elements: new Set([beam]) }, start: missing - 1 }))
      .toMatchObject({ changedMembers: 1 });
    const before = modelStore.snapshot();
    expect.soft(renumber({ ...opts, start: missing }))
      .toMatchObject({ refused: 'selfWeight', message: expect.stringMatching(/member.*20.*missing/i) });
    expect.soft(modelStore.snapshot()).toEqual(before);
  },
);

it.each(['plates', 'quads'] as const)(
  '#2565 — a shell remap only claims IDs in its own %s namespace',
  family => {
    const { top1, top2, base1, base2 } = scrambled();
    const p = modelStore.addPlate([base1, base2, top1], 1, 0.2);
    const q = modelStore.addQuad([base1, base2, top2, top1], 1, 0.2);
    const target = family === 'plates' ? `p${p}` : `q${q}`;
    const other = family === 'plates' ? `q${q}` : `p${p}`;
    const missing = 10;
    const groupId = modelStore.addGroup('Shells with stale targets', 'selection', { [family]: [missing + 1, missing] });
    modelStore.setAnalysis({ selfWeight: [{ caseId: 1, groupId, direction: 'Z', factor: -1 }] });
    const opts = { nodes: false, members: false, shells: true, order: 'xyz' as const, start: missing };

    expect.soft(renumber({ ...opts, only: { shells: new Set([other]) } })).toMatchObject({ changedShells: 1 });
    const before = modelStore.snapshot();
    expect.soft(renumber({ ...opts, only: { shells: new Set([target]) } }))
      .toMatchObject({ refused: 'selfWeight', message: expect.stringMatching(/10.*missing/i) });
    expect.soft(modelStore.snapshot()).toEqual(before);
  },
);

const lastReview = process.env.RUN_KNOWN_WRONG === '2565' ? it : it.skip;

lastReview.each(['explicit', 'group'] as const)(
  'known wrong result: #2565 — a fractional ID cannot hide member 20 in a %s selector',
  kind => {
    const { beam } = scrambled();
    const groupId = modelStore.addGroup('Gravity members', 'selection', { elements: [1.5, 20] });
    const rule = { caseId: 1, direction: 'Z', factor: -1 } as const;
    modelStore.setAnalysis({ selfWeight: [{
      ...rule, ...(kind === 'explicit' ? { elements: [1.5, 20] } : { groupId }),
    }] });
    const opts = { nodes: false, members: true, order: 'xyz' as const, only: { elements: new Set([beam]) } };

    expect(renumber({ ...opts, start: 19 })).toMatchObject({ changedMembers: 1 });
    const before = modelStore.snapshot();
    const undoCount = historyStore.undoCount;
    const claim = { ...opts, only: { elements: new Set([19]) }, start: 20 };
    expect.soft(renumber(claim)).toMatchObject({ refused: 'selfWeight', message: expect.stringMatching(/member.*20.*missing/i) });
    expect.soft(modelStore.snapshot()).toEqual(before);
    expect.soft(historyStore.undoCount).toBe(undoCount);

    modelStore.restore(before);
    modelStore.setGroupMembers(groupId, { elements: [19] });
    modelStore.setAnalysis({ selfWeight: [{
      ...rule, ...(kind === 'explicit' ? { elements: [19] } : { groupId }),
    }] });
    expect(renumber(claim)).toMatchObject({ changedMembers: 1 });
    const selected = kind === 'explicit'
      ? modelStore.analysis?.selfWeight?.[0]?.elements
      : modelStore.model.groups.get(groupId)?.members.elements;
    expect(selected).toEqual([20]);
  },
);

lastReview.each(['plates', 'quads'] as const)(
  'known wrong result: #2565 — bad member IDs cannot hide a claimed target in %s',
  family => {
    const { top1, top2, base1, base2 } = scrambled();
    const plate = modelStore.addPlate([base1, base2, top1], 1, 0.2);
    const quad = modelStore.addQuad([base1, base2, top2, top1], 1, 0.2);
    const selected = family === 'plates' ? `p${plate}` : `q${quad}`;
    const groupId = modelStore.addGroup('Gravity shells', 'selection', { elements: [1.5], [family]: [20] });
    modelStore.setAnalysis({ selfWeight: [{ caseId: 1, direction: 'Z', factor: -1, groupId }] });
    const before = modelStore.snapshot();
    expect.soft(renumber({ nodes: false, members: false, shells: true, order: 'xyz', only: { shells: new Set([selected]) }, start: 20 }))
      .toMatchObject({ refused: 'selfWeight', message: expect.stringMatching(/20.*missing/i) });
    expect(modelStore.snapshot()).toEqual(before);
  },
);
