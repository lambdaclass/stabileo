import { describe, it, expect } from 'vitest';
import { expandToStoreys, masterOf, scopeLevels, similarityIssues, storeyIndex, StoreyIndex, elementLevel, placeOn, placeMemberOn, type StoreyModel } from '../similar-storeys';
import type { Level } from '../grid';

/** A frame of `n` storeys 3 m high (the third one 3.5 m), two columns and a beam on each, and an extra beam on storey 2. */
function building(n: number) {
  const nodes = new Map<number, { x: number; y: number; z: number }>();
  const elements = new Map<number, { nodeI: number; nodeJ: number }>();
  const levels: Level[] = [];
  let nid = 0, eid = 0, z = 0;
  const node = (x: number, y: number, zz: number) => { nodes.set(++nid, { x, y, z: zz }); return nid; };
  const at: Array<[number, number]> = [];
  for (let k = 0; k <= n; k++) {
    if (k > 0) z += k === 3 ? 3.5 : 3;
    levels.push({ id: `L${k}`, name: `N${k}`, z });
    at.push([node(0, 0, z), node(6, 0, z)]);
    if (k > 0) {
      elements.set(++eid, { nodeI: at[k - 1]![0], nodeJ: at[k]![0] });
      elements.set(++eid, { nodeI: at[k - 1]![1], nodeJ: at[k]![1] });
      elements.set(++eid, { nodeI: at[k]![0], nodeJ: at[k]![1] });
    }
  }
  const extraA = node(0, 4, levels[2]!.z), extraB = node(6, 4, levels[2]!.z);
  elements.set(++eid, { nodeI: extraA, nodeJ: extraB });
  return { m: { nodes, elements } as StoreyModel, levels };
}

describe('master and similar storeys', () => {
  it('follows a level to its master, and reaches the storeys of the scope', () => {
    const { levels } = building(5);
    levels[2]!.similarTo = 'L1'; levels[3]!.similarTo = 'L2'; levels[4]!.similarTo = 'L1';
    expect(masterOf(levels, 'L3')).toBe('L1');
    expect(scopeLevels(levels, 'L3', 'similar').map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(scopeLevels(levels, 'L5', 'similar').map((l) => l.id)).toEqual(['L5']);
    expect(scopeLevels(levels, 'L3', 'this').map((l) => l.id)).toEqual(['L3']);
    expect(scopeLevels(levels, 'L3', 'all')).toHaveLength(6);
  });

  it('a beam selected on the master takes the same beam on the similar storeys, not on the others', () => {
    const { m, levels } = building(5);
    levels[2]!.similarTo = 'L1'; levels[4]!.similarTo = 'L1';
    const beamOn1 = 3;
    const x = expandToStoreys(m, levels, { elements: [beamOn1], nodes: [], shells: [] }, 'similar');
    const lv = (id: number) => elementLevel(m, id, levels)!.id;
    expect(x.elements.map(lv).sort()).toEqual(['L1', 'L2', 'L4']);
    expect(x.added).toBe(2);
    expect(x.unmatched).toEqual([]);
  });

  it('a frame member and a truss at the same place are not each other\'s counterpart', () => {
    const { m, levels } = building(3);
    levels[2]!.similarTo = 'L1';
    const elements = m.elements as Map<number, { nodeI: number; nodeJ: number; type?: 'frame' | 'truss' }>;
    for (const e of elements.values()) e.type = 'frame';
    const frameOn1 = 3, trussOn2 = 6;
    elements.get(trussOn2)!.type = 'truss';
    const fromFrame = expandToStoreys(m, levels, { elements: [frameOn1], nodes: [], shells: [] }, 'similar');
    expect(fromFrame.elements).toEqual([frameOn1]);
    expect(fromFrame.unmatched).toEqual([{ kind: 'element', id: frameOn1, level: 'L2' }]);
    const fromTruss = expandToStoreys(m, levels, { elements: [trussOn2], nodes: [], shells: [] }, 'similar');
    expect(fromTruss.elements).toEqual([trussOn2]);
    expect(fromTruss.unmatched).toEqual([{ kind: 'element', id: trussOn2, level: 'L1' }]);
  });

  it('a column of a taller similar storey is the same column; what has no counterpart is reported', () => {
    const { m, levels } = building(5);
    levels[3]!.similarTo = 'L1';
    const colOn1 = 1;
    expect(expandToStoreys(m, levels, { elements: [colOn1], nodes: [], shells: [] }, 'similar').elements.map((id) => elementLevel(m, id, levels)!.id).sort()).toEqual(['L1', 'L3']);
    levels[2]!.similarTo = 'L1';
    const extra = [...m.elements.keys()].at(-1)!;
    const x = expandToStoreys(m, levels, { elements: [extra], nodes: [], shells: [] }, 'similar');
    expect(x.unmatched.map((u) => u.level).sort()).toEqual(['L1', 'L3']);
  });

  it('places a point at the same plan position and height above another level', () => {
    const { levels } = building(3);
    expect(placeOn({ x: 1, y: 2, z: 3.2 }, levels[1]!, levels[3]!)).toEqual({ x: 1, y: 2, z: 9.7 });
  });

  it('reads a cycle and a master that is gone', () => {
    const { levels } = building(3);
    levels[1]!.similarTo = 'L2'; levels[2]!.similarTo = 'L1'; levels[3]!.similarTo = 'gone';
    expect(similarityIssues(levels).map((i) => i.issue).sort()).toEqual(['cycle', 'cycle', 'missing']);
  });

  it('indexes every member once per storey', () => {
    const { m, levels } = building(13);
    expect(StoreyIndex.count(storeyIndex(m, levels).elements)).toBe(m.elements.size);
  });

  it('matches places closer than the tolerance across a cell boundary', () => {
    const levels: Level[] = [{ id: 'L0', name: 'N0', z: 0 }, { id: 'L1', name: 'N1', z: 3 }, { id: 'L2', name: 'N2', z: 6, similarTo: 'L1' }];
    const nodes = new Map([[1, { x: 0.0099, y: 0, z: 3 }], [2, { x: 6, y: 0, z: 3 }], [3, { x: 0.0101, y: 0, z: 6 }], [4, { x: 6, y: 0, z: 6 }]]);
    const elements = new Map([[1, { nodeI: 1, nodeJ: 2 }], [2, { nodeI: 3, nodeJ: 4 }]]);
    const m = { nodes, elements } as StoreyModel;
    expect(expandToStoreys(m, levels, { elements: [1], nodes: [], shells: [] }, 'similar').elements.sort()).toEqual([1, 2]);
    expect(expandToStoreys(m, levels, { elements: [], nodes: [1], shells: [] }, 'similar').nodes.sort()).toEqual([1, 3]);
    const far = new Map(nodes).set(3, { x: 0.0205, y: 0, z: 6 });
    expect(expandToStoreys({ nodes: far, elements } as StoreyModel, levels, { elements: [1], nodes: [], shells: [] }, 'similar').unmatched).toHaveLength(1);
  });

  it('places a column on a storey of another height between that storey\'s levels', () => {
    const levels: Level[] = [{ id: 'L0', name: 'N0', z: 0 }, { id: 'L1', name: 'N1', z: 3 }, { id: 'L2', name: 'N2', z: 7, similarTo: 'L1' }];
    const ends = placeMemberOn({ x: 0, y: 5, z: 0 }, { x: 0, y: 5, z: 3 }, levels[1]!, levels[2]!, levels)!;
    expect(ends).toEqual([{ x: 0, y: 5, z: 3 }, { x: 0, y: 5, z: 7 }]);
    expect(placeMemberOn({ x: 0, y: 0, z: 3 }, { x: 6, y: 0, z: 3 }, levels[1]!, levels[2]!, levels)).toEqual([{ x: 0, y: 0, z: 7 }, { x: 6, y: 0, z: 7 }]);
    expect(placeMemberOn({ x: 0, y: 5, z: 0 }, { x: 0, y: 5, z: 3 }, levels[1]!, levels[0]!, levels)).toBeNull();
  });
});
