import { describe, it, expect } from 'vitest';
import { expandToStoreys, masterOf, scopeLevels, similarityIssues, storeyIndex, elementLevel, placeOn, type StoreyModel } from '../similar-storeys';
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
    expect(storeyIndex(m, levels).elements.size).toBe(m.elements.size);
  });
});
