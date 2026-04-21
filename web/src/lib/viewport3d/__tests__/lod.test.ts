import { describe, it, expect } from 'vitest';
import { applyLowDetail, type LowDetailGroups } from '../lod';

function mkGroups(): LowDetailGroups {
  return {
    nodesParent: { visible: true },
    supportsParent: { visible: true },
    loadsParent: { visible: true },
    resultsParent: { visible: true },
    shellsParent: { visible: true },
    elementsParent: { visible: true },
    elementsProxy: { visible: false },
  };
}

describe('applyLowDetail', () => {
  it('hides decorative groups and swaps elements for proxy when orbit starts', () => {
    const g = mkGroups();
    applyLowDetail(true, g);
    expect(g.nodesParent!.visible).toBe(false);
    expect(g.supportsParent!.visible).toBe(false);
    expect(g.loadsParent!.visible).toBe(false);
    expect(g.shellsParent!.visible).toBe(false);
    expect(g.elementsParent!.visible).toBe(false);
    expect(g.elementsProxy!.visible).toBe(true);
  });

  it('restores original visibility when orbit ends', () => {
    const g = mkGroups();
    applyLowDetail(true, g);
    applyLowDetail(false, g);
    expect(g.nodesParent!.visible).toBe(true);
    expect(g.supportsParent!.visible).toBe(true);
    expect(g.loadsParent!.visible).toBe(true);
    expect(g.shellsParent!.visible).toBe(true);
    expect(g.elementsParent!.visible).toBe(true);
    expect(g.elementsProxy!.visible).toBe(false);
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
      elementsProxy: null,
    };
    expect(() => applyLowDetail(true, g)).not.toThrow();
    expect(() => applyLowDetail(false, g)).not.toThrow();
  });
});
