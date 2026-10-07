/**
 * The selection panel's operations answer in the kind armed above them: plates give plates,
 * supports give supports, loads give loads, and a kind that is not armed is never handed back.
 */
import { describe, it, expect } from 'vitest';
import { likeSelection, likeSeedCount, shellsParallelToGlobal, focusNodeIds, shellPlane, type LikeSeeds, type SelKind } from '../select-like';
import { selectByIds } from '../select-ops';

/*
 * Two slabs at z = 3 and z = 6 (quads 1 and 2, the first 0.2 thick, the second 0.25), a wall in
 * x = 0 (triangle 1), a column 1-5 and a beam 5-6, two supports and three loads.
 */
function model() {
  const nodes = new Map<number, { x: number; y: number; z: number }>([
    [1, { x: 0, y: 0, z: 0 }], [2, { x: 4, y: 0, z: 0 }],
    [5, { x: 0, y: 0, z: 3 }], [6, { x: 4, y: 0, z: 3 }], [7, { x: 4, y: 4, z: 3 }], [8, { x: 0, y: 4, z: 3 }],
    [9, { x: 0, y: 0, z: 6 }], [10, { x: 4, y: 0, z: 6 }], [11, { x: 4, y: 4, z: 6 }], [12, { x: 0, y: 4, z: 6 }],
  ]);
  const elements = new Map([
    [1, { nodeI: 1, nodeJ: 5, sectionId: 1, materialId: 1 }],
    [2, { nodeI: 5, nodeJ: 6, sectionId: 2, materialId: 1 }],
  ]);
  const quads = new Map([
    [1, { nodes: [5, 6, 7, 8], materialId: 2, thickness: 0.2 }],
    [2, { nodes: [9, 10, 11, 12], materialId: 2, thickness: 0.25 }],
  ]);
  const plates = new Map([[1, { nodes: [1, 5, 8], materialId: 3, thickness: 0.2 }]]);
  const supports = new Map([[1, { nodeId: 1, type: 'fixed' }], [2, { nodeId: 2, type: 'pinned' }], [3, { nodeId: 6, type: 'fixed' }]]);
  const loads = [
    { type: 'nodal', data: { id: 1, nodeId: 6, caseId: 1 } },
    { type: 'distributed', data: { id: 2, elementId: 2, caseId: 2 } },
    { type: 'nodal', data: { id: 3, nodeId: 7, caseId: 2 } },
  ];
  return { nodes, elements, quads, plates, supports, loads };
}
const seeds = (s: Partial<LikeSeeds>): LikeSeeds => ({ nodes: [], elements: [], shells: [], supports: [], loads: [], ...s });
const kinds = (...k: SelKind[]) => new Set<SelKind>(k);

describe('like what is selected, by kind', () => {
  it('plates: same thickness, same material, same plane, parallel, touching, same level', () => {
    const m = model();
    const one = (op: Parameters<typeof likeSelection>[3]) => [...likeSelection(m, kinds('shells'), seeds({ shells: ['q1'] }), op)[0]!.ids].sort();
    expect(one('section')).toEqual(['p1', 'q1']);
    expect(one('material')).toEqual(['q1', 'q2']);
    expect(one('plane')).toEqual(['q1']);
    expect(one('parallel')).toEqual(['q1', 'q2']);
    expect(one('connected')).toEqual(['p1', 'q1']);
    expect(one('level')).toEqual(['q1']);
  });

  it('nodes: same level, and joined by a member or a plate', () => {
    const m = model();
    const [lvl] = likeSelection(m, kinds('nodes'), seeds({ nodes: [5] }), 'level');
    expect([...lvl!.ids].sort((a, b) => (a as number) - (b as number))).toEqual([5, 6, 7, 8]);
    const [con] = likeSelection(m, kinds('nodes'), seeds({ nodes: [1] }), 'connected');
    expect([...con!.ids].sort((a, b) => (a as number) - (b as number))).toEqual([1, 5, 8]);
  });

  it('supports: same type and same level; loads: same type and same case', () => {
    const m = model();
    expect([...likeSelection(m, kinds('supports'), seeds({ supports: [1] }), 'kind')[0]!.ids]).toEqual([1, 3]);
    expect([...likeSelection(m, kinds('supports'), seeds({ supports: [1] }), 'level')[0]!.ids]).toEqual([1, 2]);
    expect([...likeSelection(m, kinds('loads'), seeds({ loads: [1] }), 'kind')[0]!.ids]).toEqual([1, 3]);
    expect([...likeSelection(m, kinds('loads'), seeds({ loads: [2] }), 'case')[0]!.ids]).toEqual([2, 3]);
  });

  it('answers only in armed kinds, and only where something of them is selected', () => {
    const m = model();
    // Members are selected, but only plates are armed: no member comes back.
    const a = likeSelection(m, kinds('shells'), seeds({ elements: [2], shells: ['q1'] }), 'material');
    expect(a.map((x) => x.kind)).toEqual(['shells']);
    // An operation a kind does not have gives no answer for it.
    expect(likeSelection(m, kinds('supports'), seeds({ supports: [1] }), 'parallel')).toEqual([]);
    expect(likeSeedCount(kinds('supports', 'loads'), seeds({ supports: [1, 2], loads: [1] }), 'case')).toBe(1);
  });
});

describe('plates parallel to a global axis or plane', () => {
  it('slabs lie in XY, the wall holds Z', () => {
    const m = model();
    expect([...shellsParallelToGlobal(m, 'XY')].sort()).toEqual(['q1', 'q2']);
    expect([...shellsParallelToGlobal(m, 'Z')]).toEqual(['p1']);
    expect(shellPlane(m, 'p1')!.n.map((v) => Math.abs(v))).toEqual([1, 0, 0]);
  });
});

describe('by id, every kind the panel arms', () => {
  it('plates are one kind: an id is looked up among triangles and quadrilaterals', () => {
    const m = model();
    const r = selectByIds(m, 'shells', '1, 2, 9');
    expect([...r.selection.shells].sort()).toEqual(['p1', 'q1', 'q2']);
    expect(r.both).toEqual([1]);
    expect(r.missing).toEqual([9]);
  });

  it('supports and loads by their own ids', () => {
    const m = model();
    expect([...selectByIds(m, 'supports', '2, 3').selection.supports!]).toEqual([2, 3]);
    const r = selectByIds(m, 'loads', '1-3, 5');
    expect([...r.selection.loads!]).toEqual([1, 2, 3]);
    expect(r.missing).toEqual([5]);
    expect(r.selection.nodes.size + r.selection.elements.size + r.selection.shells.size).toBe(0);
  });
});

describe('zoom to the selection frames every kind', () => {
  it('by the nodes each one sits on', () => {
    const m = model();
    expect([...focusNodeIds(m, { shells: ['p1'] })].sort((a, b) => a - b)).toEqual([1, 5, 8]);
    expect([...focusNodeIds(m, { supports: [3] })]).toEqual([6]);
    expect([...focusNodeIds(m, { loads: [2, 3] })].sort((a, b) => a - b)).toEqual([5, 6, 7]);
  });
});
