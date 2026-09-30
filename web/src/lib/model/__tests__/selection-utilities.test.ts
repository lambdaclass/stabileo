/**
 * Selection utilities: loaded in a case, parallel to a global axis or plane, the lasso's
 * inside test, the command palette's search, and the weld tolerance every weld reads.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { loadedInCase, parallelToGlobal } from '../select-ops';
import { insidePolygon, extendLasso } from '../../viewport/lasso';
import { paletteEntries, searchPalette } from '../../pro/command-search';
import { weldTolerance, setWeldTolerance, DEFAULT_WELD_TOL } from '../weld-tolerance';
import { findCoincidentNode } from '../../engine/mesh-weld';

afterEach(() => { setWeldTolerance(DEFAULT_WELD_TOL); });

describe('select', () => {
  it('what carries a load of one case, loads with no case in case 1', () => {
    const s = loadedInCase([
      { type: 'nodal3d', data: { nodeId: 3, caseId: 2 } },
      { type: 'distributed3d', data: { elementId: 7 } },
      { type: 'surface3d', data: { quadId: 4, caseId: 2 } },
    ], 2);
    expect([...s.nodes]).toEqual([3]);
    expect([...s.elements]).toEqual([]);
    expect([...s.shells]).toEqual(['q4']);
    expect([...loadedInCase([{ type: 'distributed3d', data: { elementId: 7 } }], 1).elements]).toEqual([7]);
  });

  it('parallel to an axis, or lying parallel to a plane', () => {
    const nodes = new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 0, y: 0, z: 3 }], [3, { x: 5, y: 0, z: 3 }], [4, { x: 5, y: 4, z: 3 }]]);
    const els = new Map([[1, { nodeI: 1, nodeJ: 2 }], [2, { nodeI: 2, nodeJ: 3 }], [3, { nodeI: 3, nodeJ: 4 }], [4, { nodeI: 1, nodeJ: 4 }]]);
    expect([...parallelToGlobal(nodes, els, 'Z')]).toEqual([1]);
    expect([...parallelToGlobal(nodes, els, 'X')]).toEqual([2]);
    expect([...parallelToGlobal(nodes, els, 'XY')]).toEqual([2, 3]);
  });
});

describe('lasso', () => {
  it('inside an L-shaped outline, and a path that grows by steps', () => {
    const L = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
    expect(insidePolygon({ x: 2, y: 8 }, L)).toBe(true);
    expect(insidePolygon({ x: 8, y: 8 }, L)).toBe(false);
    expect(extendLasso([{ x: 0, y: 0 }], { x: 1, y: 1 })).toHaveLength(1);
    expect(extendLasso([{ x: 0, y: 0 }], { x: 5, y: 0 })).toHaveLength(2);
  });
});

describe('command palette', () => {
  const stages = [{ id: 'model', labelKey: 'Modelo', home: 'nodes', groups: [{ id: 'g', labelKey: 'Dibujar', cmds: [
    { id: 'nodes', labelKey: 'Nodos' }, { id: 'elements', labelKey: 'Barras' }, { id: 'shells', labelKey: 'Placas', enabled: () => false },
  ] }] }] as never;
  it('finds by the words of the label, accents aside, and says what is disabled', () => {
    const e = paletteEntries(stages, (k) => k);
    expect(searchPalette(e, 'barr').map((x) => x.cmd.id)).toEqual(['elements']);
    expect(searchPalette(e, 'modelo placas').map((x) => x.cmd.id)).toEqual(['shells']);
    expect(e.find((x) => x.cmd.id === 'shells')!.enabled).toBe(false);
    expect(searchPalette(e, '')).toHaveLength(3);
  });
});

describe('weld tolerance', () => {
  it('is what a weld reads, and resets when it is out of range', () => {
    const nodes = [{ id: 1, x: 0, y: 0, z: 0 }];
    expect(findCoincidentNode(nodes as never, 0.004, 0, 0)).toBeNull();
    setWeldTolerance(0.005);
    expect(weldTolerance()).toBe(0.005);
    expect(findCoincidentNode(nodes as never, 0.004, 0, 0)).toBe(1);
    expect(setWeldTolerance(-1)).toBe(DEFAULT_WELD_TOL);
  });
});
