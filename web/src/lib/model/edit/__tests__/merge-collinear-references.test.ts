/**
 * Merging collinear members leaves alone a node something outside the model's entities names.
 *
 * A time-history force is kept beside the model and names its node by id. Merging through that
 * node removed it, and the force was left on a number the next node drawn would take.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { mergeCollinear } from '../merge-collinear';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const GROUND = { x: { source: 'none', scale: 1 }, y: { source: 'none', scale: 1 }, z: { source: 'none', scale: 1 } } as const;

describe('merging collinear members through a node a time-history force acts on', () => {
  it('refuses that node and keeps the force on it', () => {
    const a = modelStore.addNode(0, 0, 0), m = modelStore.addNode(3, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e1 = modelStore.addElement(a, m, 'frame'), e2 = modelStore.addElement(m, b, 'frame');
    modelStore.setDynamics({ timeHistory: { dt: 0.01, nSteps: 10, method: 'newmark', alpha: 0, damping: 0.05,
      ground: GROUND, forces: [{ nodeId: m, dir: 'z', kind: 'step', amplitude: 10 }] } });
    const r = mergeCollinear([e1, e2]);
    expect(r.refused.nodeBusy).toBe(1);
    expect(r.removedNodes).toBe(0);
    expect(modelStore.nodes.has(m)).toBe(true);
    expect(modelStore.snapshot().dynamics!.timeHistory!.forces[0]!.nodeId).toBe(m);
  });

  it('still merges when the force acts elsewhere', () => {
    const a = modelStore.addNode(0, 0, 0), m = modelStore.addNode(3, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e1 = modelStore.addElement(a, m, 'frame'), e2 = modelStore.addElement(m, b, 'frame');
    modelStore.setDynamics({ timeHistory: { dt: 0.01, nSteps: 10, method: 'newmark', alpha: 0, damping: 0.05,
      ground: GROUND, forces: [{ nodeId: b, dir: 'z', kind: 'step', amplitude: 10 }] } });
    expect(mergeCollinear([e1, e2]).removedNodes).toBe(1);
  });
});
