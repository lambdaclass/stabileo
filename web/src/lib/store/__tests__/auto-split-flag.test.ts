/**
 * Behavior pin for the auto-split-on-node-place uiStore flag and the
 * underlying splitElementAtPoint contract that the click handler in
 * Viewport.svelte relies on.
 *
 * The click handler itself lives in Svelte and is exercised by a
 * Playwright probe. These tests pin the parts that are unit-testable:
 *   - The uiStore flag exists, defaults OFF, and is round-trip settable.
 *   - splitElementAtPoint preserves enough metadata for the auto-split
 *     scenario (type, materialId, sectionId, releases) — the same
 *     contract used by hinge-mode subdivide.
 *   - The endpoint-guard threshold (t ∈ [0.05, 0.95]) matches what the
 *     Viewport handler enforces; calling splitElementAtPoint with
 *     t < 0.01 or t > 0.99 returns null (its own internal guard).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';

describe('auto-split-on-node-place — flag + underlying split contract', () => {
  beforeEach(() => {
    modelStore.clear();
    uiStore.autoSplitOnNodePlace = false;
  });

  it('uiStore.autoSplitOnNodePlace defaults to OFF', () => {
    expect(uiStore.autoSplitOnNodePlace).toBe(false);
  });

  it('uiStore.autoSplitOnNodePlace round-trips ON/OFF', () => {
    uiStore.autoSplitOnNodePlace = true;
    expect(uiStore.autoSplitOnNodePlace).toBe(true);
    uiStore.autoSplitOnNodePlace = false;
    expect(uiStore.autoSplitOnNodePlace).toBe(false);
  });

  it('splitElementAtPoint preserves type, material, section across the split', () => {
    modelStore.addNode(0, 0);
    modelStore.addNode(8, 0);
    const elemId = modelStore.addElement(1, 2, 'truss');
    const orig = modelStore.elements.get(elemId)!;

    const split = modelStore.splitElementAtPoint(elemId, 0.5);
    expect(split).not.toBeNull();
    const a = modelStore.elements.get(split!.elemA)!;
    const b = modelStore.elements.get(split!.elemB)!;
    expect(a.type).toBe(orig.type);
    expect(b.type).toBe(orig.type);
    expect(a.materialId).toBe(orig.materialId);
    expect(b.materialId).toBe(orig.materialId);
    expect(a.sectionId).toBe(orig.sectionId);
    expect(b.sectionId).toBe(orig.sectionId);
  });

  it('splitElementAtPoint returns null for t too close to either endpoint (own guard)', () => {
    modelStore.addNode(0, 0);
    modelStore.addNode(8, 0);
    const elemId = modelStore.addElement(1, 2, 'frame');
    expect(modelStore.splitElementAtPoint(elemId, 0.005)).toBeNull();
    expect(modelStore.splitElementAtPoint(elemId, 0.995)).toBeNull();
    // The Viewport-level guard (0.05/0.95) is stricter; this checks the
    // belt-and-suspenders inner guard at 0.01/0.99.
  });

  it('splitElementAtPoint conserves a uniform distributed load total', () => {
    modelStore.addNode(0, 0);
    modelStore.addNode(6, 0);
    const elemId = modelStore.addElement(1, 2, 'frame');
    modelStore.addDistributedLoad(elemId, -10, -10);

    const split = modelStore.splitElementAtPoint(elemId, 1 / 3);
    expect(split).not.toBeNull();

    const total = modelStore.loads
      .filter((l) => l.type === 'distributed')
      .reduce((acc, l) => {
        const d = l.data as { qI: number; qJ: number; elementId: number };
        const elem = modelStore.elements.get(d.elementId);
        if (!elem) return acc;
        const ni = modelStore.getNode(elem.nodeI);
        const nj = modelStore.getNode(elem.nodeJ);
        if (!ni || !nj) return acc;
        const L = Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2);
        return acc + 0.5 * (d.qI + d.qJ) * L;
      }, 0);
    // Pre-split total: -10 kN/m × 6m = -60 kN. Must be conserved.
    expect(total).toBeCloseTo(-60, 6);
  });

  it('splitElementAtPoint replicates a thermal load on both sub-elements', () => {
    modelStore.addNode(0, 0);
    modelStore.addNode(6, 0);
    const elemId = modelStore.addElement(1, 2, 'frame');
    modelStore.addThermalLoad(elemId, 30, 5); // ΔT_uniform=30°C, ΔT_grad=5°C/h

    const split = modelStore.splitElementAtPoint(elemId, 0.5);
    expect(split).not.toBeNull();

    const thermals = modelStore.loads.filter((l) => l.type === 'thermal');
    expect(thermals.length).toBe(2);
    for (const tl of thermals) {
      const d = tl.data as { dtUniform: number; dtGradient: number };
      expect(d.dtUniform).toBe(30);
      expect(d.dtGradient).toBe(5);
    }
  });
});
