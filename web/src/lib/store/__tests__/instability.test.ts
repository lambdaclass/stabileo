/**
 * A failed solve names its mechanism: the free nodes and directions, from the engine's rank analysis.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { instability } from '../instability.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; instability.clear(); });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('the instability report', () => {
  it('names the node and direction nothing holds', () => {
    modelStore.clear();
    // A bar on one pin: free to spin about the pin and to rotate about its own axis.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false } });
    const r = instability.explain(false, false);
    expect(r, 'a mechanism is reported').not.toBeNull();
    expect(r!.mechanismModes).toBeGreaterThan(0);
    expect(instability.current).toBe(r);
    // Editing the model makes the report stale.
    modelStore.addSupport(b, 'fixed3d');
    expect(instability.current).toBeNull();
  });

  it('reports nothing for a stable structure', () => {
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    expect(instability.explain(false, false)).toBeNull();
  });
});
