/**
 * The structural grid: what typed bays and heights become, how a point snaps, what a model
 * reads as, and columns and beams laid between axes and welded into the model in one undo step.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store';
import {
  axesFromBays, axisName, baysText, frameBetweenAxes, gridFromModel, gridIssues, levelsFromHeights,
  parseBays, snapToAxes, type StructuralGrid,
} from '../grid';
import { fragmentFromMembers } from '../edit/fragment';
import { insertFragment } from '../edit/transformed-copy';
import { IDENTITY } from '../edit/affine';
import { modelToCode, codeToModel } from '../code/format';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

describe('bays and names', () => {
  it('reads bays with a decimal comma, spaces and repeats', () => {
    expect(parseBays('6; 7,5; 6')).toEqual([6, 7.5, 6]);
    expect(parseBays('3x6 4')).toEqual([6, 6, 6, 4]);
    expect(parseBays('5/5')).toEqual([5, 5]);
    expect(parseBays('6; -1')).toBeNull();
    expect(parseBays('abc')).toBeNull();
  });

  it('names axes in sequence from any start', () => {
    expect(axisName('letters', 'A', 0)).toBe('A');
    expect(axisName('letters', 'C', 2)).toBe('E');
    expect(axisName('letters', 'Z', 1)).toBe('AA');
    expect(axisName('numbers', '3', 2)).toBe('5');
  });

  it('lays axes at the running sum of the bays and gives the bays back', () => {
    const axes = axesFromBays([6, 7.5, 6], 'x', 1, 'numbers', '1');
    expect(axes.map((a) => [a.name, a.at])).toEqual([['1', 1], ['2', 7], ['3', 14.5], ['4', 20.5]]);
    expect(baysText(axes)).toBe('6; 7,5; 6');
  });

  it('names levels from the list, then by index', () => {
    const lv = levelsFromHeights([3, 3.2], 0, ['PB', '1°']);
    expect(lv.map((l) => [l.name, l.z])).toEqual([['PB', 0], ['1°', 3], ['N2', 6.2]]);
  });

  it('reports repeated names and coincident axes', () => {
    const g: StructuralGrid = {
      axes: [{ id: 'a', name: 'A', axis: 'y', at: 0 }, { id: 'b', name: 'A', axis: 'y', at: 0 }],
      levels: [],
    };
    expect(gridIssues(g)).toEqual(['duplicateName:A', 'coincident:A/A']);
  });
});

describe('snapping', () => {
  const g: StructuralGrid = {
    axes: [...axesFromBays([6], 'x', 0, 'numbers', '1'), ...axesFromBays([5], 'y', 0, 'letters', 'A')],
    levels: [],
  };
  it('prefers an intersection, then an axis, then nothing', () => {
    expect(snapToAxes(g, 5.9, 0.1, 0.2)).toMatchObject({ x: 6, y: 0, kind: 'intersection', label: '2-A' });
    expect(snapToAxes(g, 5.9, 2.5, 0.2)).toMatchObject({ x: 6, y: 2.5, kind: 'axis', label: '2' });
    expect(snapToAxes(g, 3, 4.95, 0.2)).toMatchObject({ x: 3, y: 5, kind: 'axis', label: 'B' });
    expect(snapToAxes(g, 3, 2.5, 0.2)).toBeNull();
  });
});

describe('a grid read off a model', () => {
  it('puts axes on the columns and levels on the floors', () => {
    const n = [
      { id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: 3 },
      { id: 3, x: 6, y: 0, z: 0 }, { id: 4, x: 6, y: 0, z: 3 },
      { id: 5, x: 3, y: 0, z: 3 }, // mid-span node, no column
    ];
    const m = [{ nodeI: 1, nodeJ: 2 }, { nodeI: 3, nodeJ: 4 }, { nodeI: 2, nodeJ: 5 }, { nodeI: 5, nodeJ: 4 }];
    const g = gridFromModel(n, m);
    expect(g.axes.filter((a) => a.axis === 'x').map((a) => a.at)).toEqual([0, 6]);
    expect(g.axes.filter((a) => a.axis === 'y').map((a) => a.at)).toEqual([0]);
    expect(g.levels.map((l) => l.z)).toEqual([0, 3]);
  });
});

describe('columns and beams between axes', () => {
  function building(): StructuralGrid {
    return {
      axes: [...axesFromBays([6, 6], 'x', 0, 'numbers', '1'), ...axesFromBays([5], 'y', 0, 'letters', 'A')],
      levels: levelsFromHeights([3, 3], 0),
    };
  }
  const all = (g: StructuralGrid) => {
    const xs = g.axes.filter((a) => a.axis === 'x'), ys = g.axes.filter((a) => a.axis === 'y');
    return {
      x: [xs[0]!.id, xs[xs.length - 1]!.id] as [string, string],
      y: [ys[0]!.id, ys[ys.length - 1]!.id] as [string, string],
      levels: [g.levels[0]!.id, g.levels[g.levels.length - 1]!.id] as [string, string],
    };
  };

  it('counts columns per storey and beams per floor above the base', () => {
    const g = building();
    const L = frameBetweenAxes(g, { ...all(g), columns: { sectionId: 1, materialId: 1 }, beamsX: { sectionId: 1, materialId: 1 }, beamsY: { sectionId: 1, materialId: 1 } })!;
    // 3 × 2 intersections, 2 storeys → 12 columns; per floor 2×2 beams along X and 3×1 along Y → 7, two floors.
    expect(L.members.filter((m) => m.role === 'column')).toHaveLength(12);
    expect(L.members.filter((m) => m.role === 'beamX')).toHaveLength(8);
    expect(L.members.filter((m) => m.role === 'beamY')).toHaveLength(6);
    expect(L.nodes).toHaveLength(18);
  });

  it('with one level lays only its beams', () => {
    const g = building();
    const r = all(g);
    const L = frameBetweenAxes(g, { ...r, levels: [r.levels[1], r.levels[1]], columns: { sectionId: 1, materialId: 1 }, beamsX: { sectionId: 1, materialId: 1 }, beamsY: null })!;
    expect(L.members.every((m) => m.role === 'beamX')).toBe(true);
    expect(L.members).toHaveLength(4);
  });

  it('welds onto the model, skips members already there, and undoes in one step', () => {
    const g = building();
    modelStore.setGrid(g);
    // An existing column on 1-A, bottom storey.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    modelStore.addElement(a, b, 'frame');
    const before = { nodes: modelStore.nodes.size, elements: modelStore.elements.size };
    const L = frameBetweenAxes(g, { ...all(g), columns: { sectionId: 1, materialId: 1 }, beamsX: { sectionId: 1, materialId: 1 }, beamsY: { sectionId: 1, materialId: 1 } })!;
    uiStore.setSelection(new Set([a]), new Set());
    const r = insertFragment(fragmentFromMembers(L.nodes, L.members), [{ A: IDENTITY, t: [0, 0, 0] }]);
    expect(r.welded).toBe(2);
    expect(r.duplicates).toBe(1);
    expect(modelStore.nodes.size).toBe(before.nodes + 16);
    expect(modelStore.elements.size).toBe(before.elements + 25);
    uiStore.setSelection(new Set(r.nodes), new Set(r.elements));
    historyStore.undo();
    expect(modelStore.nodes.size).toBe(before.nodes);
    expect(modelStore.elements.size).toBe(before.elements);
    expect([...uiStore.selectedNodes]).toEqual([a]);
    historyStore.redo();
    expect(modelStore.elements.size).toBe(before.elements + 25);
    expect([...uiStore.selectedElements].sort((x, y) => x - y)).toEqual([...r.elements].sort((x, y) => x - y));
  });
});

describe('the grid in the model', () => {
  it('is saved, undone without touching the solve, and travels in the model code', () => {
    const g: StructuralGrid = { axes: axesFromBays([6], 'x', 0, 'numbers', '1'), levels: levelsFromHeights([3], 0, ['PB', 'Techo']) };
    const v0 = modelStore.modelVersion;
    modelStore.setGrid(g);
    expect(modelStore.modelVersion).toBe(v0);
    expect(modelStore.snapshot().grid).toEqual(g);
    const code = modelToCode(modelStore.snapshot());
    expect(code).toContain('grid ');
    const back = codeToModel(code);
    expect(back.errors).toEqual([]);
    expect(back.snapshot?.grid).toEqual(g);
    historyStore.undo();
    expect(modelStore.grid).toBeUndefined();
  });
});
