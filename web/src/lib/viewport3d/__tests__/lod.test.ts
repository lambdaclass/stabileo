import { describe, it, expect } from 'vitest';
import { applyLowDetail, isHeavyModel, HEAVY_MODEL_VISUALS, HEAVY_MODEL_VISUALS_SECTIONS, type LowDetailGroups } from '../lod';

function mkGroups(renderMode: 'wireframe' | 'solid' | 'sections' = 'wireframe'): LowDetailGroups {
  return {
    nodesParent: { visible: true },
    supportsParent: { visible: true },
    loadsParent: { visible: true },
    resultsParent: { visible: true },
    shellsParent: { visible: true },
    localAxesParent: { visible: true },
    elementsParent: { visible: true },
    elementsBatchedMesh: { visible: renderMode === 'wireframe' },
    renderMode,
  };
}

describe('applyLowDetail — default (professional inspection: keep detail during motion)', () => {
  it('keeps decorative + per-element groups visible during orbit on normal models', () => {
    const g = mkGroups('sections');
    applyLowDetail(true, g); // no heavyModel → no stripping
    expect(g.nodesParent!.visible).toBe(true);
    expect(g.supportsParent!.visible).toBe(true);
    expect(g.loadsParent!.visible).toBe(true);
    expect(g.shellsParent!.visible).toBe(true);
    expect(g.elementsParent!.visible).toBe(true); // sections stay on screen while moving
    expect(g.resultsParent!.visible).toBe(true);
  });

  it('batched mesh follows render mode during motion when not stripping (off in solid/sections)', () => {
    const solid = mkGroups('solid');
    applyLowDetail(true, solid);
    expect(solid.elementsBatchedMesh!.visible).toBe(false); // cylinders carry the visual
    const wire = mkGroups('wireframe');
    applyLowDetail(true, wire);
    expect(wire.elementsBatchedMesh!.visible).toBe(true);
  });

  it('restores idle visibility when orbit ends', () => {
    const g = mkGroups('solid');
    applyLowDetail(true, g);
    applyLowDetail(false, g);
    expect(g.nodesParent!.visible).toBe(true);
    expect(g.elementsParent!.visible).toBe(true);
    expect(g.elementsBatchedMesh!.visible).toBe(false); // solid idle → batched off
  });
});

describe('applyLowDetail — heavy-model fallback', () => {
  it('hides decorative + per-element groups and forces batched mesh on during orbit', () => {
    const g = mkGroups('solid');
    applyLowDetail(true, g, { heavyModel: true });
    expect(g.nodesParent!.visible).toBe(false);
    expect(g.supportsParent!.visible).toBe(false);
    expect(g.loadsParent!.visible).toBe(false);
    expect(g.shellsParent!.visible).toBe(false);
    expect(g.elementsParent!.visible).toBe(false);
    expect(g.elementsBatchedMesh!.visible).toBe(true); // stand-in while moving
  });

  it('restores idle visibility when orbit ends (heavy)', () => {
    const g = mkGroups('wireframe');
    applyLowDetail(true, g, { heavyModel: true });
    applyLowDetail(false, g, { heavyModel: true });
    expect(g.nodesParent!.visible).toBe(true);
    expect(g.elementsParent!.visible).toBe(true);
    expect(g.elementsBatchedMesh!.visible).toBe(true); // wireframe idle → on
  });

  it('keeps elementsParent visible during heavy orbit when results coloring is active', () => {
    const g = mkGroups('solid');
    applyLowDetail(true, g, { heavyModel: true, resultsColoringActive: true });
    expect(g.elementsParent!.visible).toBe(true); // color carrier stays
    expect(g.nodesParent!.visible).toBe(false);   // other decor still stripped
    expect(g.loadsParent!.visible).toBe(false);
  });
});

describe('isHeavyModel — single LOD policy point', () => {
  it('counts shells toward the visual budget', () => {
    expect(isHeavyModel({ elements: 200, shells: HEAVY_MODEL_VISUALS }, 'wireframe')).toBe(true);
    expect(isHeavyModel({ elements: 200 }, 'wireframe')).toBe(false);
  });

  it('sections mode falls back much earlier (edges double the per-element cost)', () => {
    const n = HEAVY_MODEL_VISUALS_SECTIONS + 1;
    expect(isHeavyModel({ elements: n }, 'sections')).toBe(true);
    expect(isHeavyModel({ elements: n }, 'wireframe')).toBe(false);
  });

  it('strips the local-axes parent with the other decor in the heavy fallback', () => {
    const g = mkGroups('wireframe');
    applyLowDetail(true, g, { heavyModel: true });
    expect(g.localAxesParent!.visible).toBe(false);
    applyLowDetail(false, g, { heavyModel: true });
    expect(g.localAxesParent!.visible).toBe(true);
  });
});

describe('applyLowDetail — always-on invariants', () => {
  it('resultsParent is never hidden, even in heavy fallback', () => {
    const g = mkGroups();
    applyLowDetail(true, g, { heavyModel: true });
    expect(g.resultsParent!.visible).toBe(true);
  });

  it('tolerates null group references (not-yet-mounted scene)', () => {
    const g: LowDetailGroups = {
      nodesParent: null, supportsParent: null, loadsParent: null,
      resultsParent: null, shellsParent: null, elementsParent: null,
      elementsBatchedMesh: null, renderMode: 'wireframe',
    };
    expect(() => applyLowDetail(true, g, { heavyModel: true })).not.toThrow();
    expect(() => applyLowDetail(false, g)).not.toThrow();
  });
});
