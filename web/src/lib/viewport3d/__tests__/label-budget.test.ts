/**
 * The 3D view numbers what it can carry. Each label is a canvas texture on the GPU, and a
 * building's exchange file brings some 20 000 nodes: past the budget a kind is numbered on the
 * selection only, and the view says so once.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { modelStore, historyStore, uiStore } from '../../store';
import { syncLabels3D, type ResultsSyncContext } from '../results-sync';

// A canvas enough for a label's texture: the unit tests run without a DOM.
const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => new Proxy({ measureText: (t: string) => ({ width: t.length * 10 }) }, { get: (o, k) => (k in o ? (o as never)[k] : () => {}), set: () => true }) });
(globalThis as { document?: unknown }).document ??= { createElement: fakeCanvas };

const ctx = () => ({ initialized: true, scene: new THREE.Scene(), nodeLabelsGroup: null, elementLabelsGroup: null, shellLabelsGroup: null, lengthLabelsGroup: null }) as unknown as ResultsSyncContext;

describe('the labels the 3D view draws', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; uiStore.showNodeLabels3D = true; uiStore.clearSelection(); });

  it('numbers every node of a small model', () => {
    for (let i = 0; i < 5; i++) modelStore.addNode(i, 0, 0);
    const c = ctx();
    syncLabels3D(c);
    expect(c.nodeLabelsGroup!.children).toHaveLength(5);
  });

  it('numbers only the selection past the budget, and says so', () => {
    const ids: number[] = [];
    modelStore.batch(() => { for (let i = 0; i < 2100; i++) ids.push(modelStore.addNode(i % 50, Math.floor(i / 50), 0)); });
    uiStore.setSelection(new Set([ids[0]!, ids[1]!]), new Set());
    const toasts: string[] = [];
    const real = uiStore.toast.bind(uiStore);
    uiStore.toast = ((m: string) => { toasts.push(m); }) as never;
    try {
      const c = ctx();
      syncLabels3D(c);
      expect(c.nodeLabelsGroup!.children).toHaveLength(2);
      syncLabels3D(c);
      expect(toasts).toHaveLength(1);
    } finally { uiStore.toast = real as never; }
  });
});
