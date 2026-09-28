/**
 * A rigid diaphragm turns its nodes about its normal as one body.
 *
 * Four columns carry a floor made rigid by a diaphragm, pushed off its centre: the floor
 * translates and turns, and every column head turns with it. The engine's diaphragm tied the
 * in-plane translations only, so each head turned on its own; in a validation model the heads of
 * one floor ranged from 2.22e-6 to 2.73e-6 rad where the floor turns 2.24e-6.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { withDiaphragmRotation } from '../diaphragm-rotation';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

describe('a rigid diaphragm', () => {
  it('ties each slave\'s rotation about the normal to the master\'s', () => {
    const out = withDiaphragmRotation([
      { type: 'diaphragm', masterNode: 1, slaveNodes: [2, 3], plane: 'XY' },
      { type: 'diaphragm', masterNode: 7, slaveNodes: [8], plane: 'XZ' },
    ]);
    expect(out.filter((c) => c.type === 'equalDOF')).toEqual([
      { type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [5] },
      { type: 'equalDOF', masterNode: 1, slaveNode: 3, dofs: [5] },
      { type: 'equalDOF', masterNode: 7, slaveNode: 8, dofs: [4] },
    ]);
  });

  it('turns every column head with the floor', async () => {
    const heads: number[] = [];
    for (const [x, y] of [[0, 0], [6, 0], [6, 4], [0, 4]]) {
      const base = modelStore.addNode(x, y, 0), head = modelStore.addNode(x, y, 3);
      modelStore.addElement(base, head, 'frame');
      modelStore.addSupport(base, 'fixed3d');
      heads.push(head);
    }
    modelStore.addConstraint({ type: 'diaphragm', masterNode: heads[0]!, slaveNodes: heads.slice(1), plane: 'XY' });
    modelStore.addNodalLoad3D(heads[1]!, 0, 20, 0, 0, 0, 0);
    const r = await modelStore.solve3DAsync(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const rz = heads.map((h) => r.displacements.find((d) => d.nodeId === h)!.rz);
    expect(Math.abs(rz[0]!)).toBeGreaterThan(1e-6);
    for (const v of rz) expect(v).toBeCloseTo(rz[0]!, 12);
  });
});
