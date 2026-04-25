import { describe, it, expect } from 'vitest';
import { applyLowDetail, type LowDetailGroups } from '../lod';

function mkGroups(renderMode: 'wireframe' | 'solid' | 'sections' = 'wireframe'): LowDetailGroups {
  return {
    nodesParent: { visible: true },
    supportsParent: { visible: true },
    loadsParent: { visible: true },
    resultsParent: { visible: true },
    shellsParent: { visible: true },
    elementsParent: { visible: true },
    elementsBatchedMesh: { visible: renderMode === 'wireframe' },
    renderMode,
  };
}

describe('applyLowDetail', () => {
  it('hides decorative + per-element groups and forces the batched mesh on during orbit', () => {
    const g = mkGroups('solid');
    applyLowDetail(true, g);
    expect(g.nodesParent!.visible).toBe(false);
    expect(g.supportsParent!.visible).toBe(false);
    expect(g.loadsParent!.visible).toBe(false);
    expect(g.shellsParent!.visible).toBe(false);
    expect(g.elementsParent!.visible).toBe(false);
    // Forced on during orbit, independent of renderMode — so solid/sections
    // still shows *something* (the wireframe batch) while camera is moving.
    expect(g.elementsBatchedMesh!.visible).toBe(true);
  });

  it('restores idle visibility when orbit ends — batched mesh follows renderMode', () => {
    const g = mkGroups('wireframe');
    applyLowDetail(true, g);
    applyLowDetail(false, g);
    expect(g.nodesParent!.visible).toBe(true);
    expect(g.supportsParent!.visible).toBe(true);
    expect(g.loadsParent!.visible).toBe(true);
    expect(g.shellsParent!.visible).toBe(true);
    expect(g.elementsParent!.visible).toBe(true);
    expect(g.elementsBatchedMesh!.visible).toBe(true); // wireframe → on
  });

  it('in solid mode, idle hides the batched mesh (cylinders carry the visual)', () => {
    const g = mkGroups('solid');
    applyLowDetail(true, g);
    applyLowDetail(false, g);
    // Idle in solid: per-element cylinders render, batched wireframe stays off.
    expect(g.elementsParent!.visible).toBe(true);
    expect(g.elementsBatchedMesh!.visible).toBe(false);
  });

  it('keeps resultsParent visible during orbit (regression: diagrams/deformed/reactions must stay on screen while moving the camera)', () => {
    const g = mkGroups();
    applyLowDetail(true, g);
    expect(g.resultsParent!.visible).toBe(true);
  });

  it('tolerates null group references (not-yet-mounted scene)', () => {
    const g: LowDetailGroups = {
      nodesParent: null,
      supportsParent: null,
      loadsParent: null,
      resultsParent: null,
      shellsParent: null,
      elementsParent: null,
      elementsBatchedMesh: null,
      renderMode: 'wireframe',
    };
    expect(() => applyLowDetail(true, g)).not.toThrow();
    expect(() => applyLowDetail(false, g)).not.toThrow();
  });
});
