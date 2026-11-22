import { describe, it, expect } from 'vitest';
import { sheetsLeftOut, torsionThreshold, type CoverageGroup } from '../coverage';

const group = (id: number, kind: string, elements: number, shells = 0, name = `G${id}`): CoverageGroup => ({ id, name, kind, level: 'N1', elements, shells });
const base = { groups: [] as CoverageGroup[], looseElements: 0, looseShells: 0, rowKeys: [] as string[], columns: [], defaultFc: 25 };

describe('what the sheets leave out', () => {
  it('nothing, when every physical element in concrete has a row and no column carries torsion', () => {
    const left = sheetsLeftOut({ ...base, groups: [group(1, 'beam', 3), group(2, 'column', 2), group(3, 'slab', 0, 12), group(4, 'wall', 0, 8)], rowKeys: ['beam:1:0', 'beam:1:1', 'column:2:0', 'slab:3', 'wall:4:0'] });
    expect(left).toEqual([]);
  });

  it('members in no physical element, bars and shells counted apart', () => {
    const left = sheetsLeftOut({ ...base, looseElements: 5, looseShells: 40 });
    expect(left).toEqual([{ reason: 'notPhysical', members: 5, kind: 'element' }, { reason: 'notPhysical', members: 40, kind: 'shell' }]);
  });

  it('a brace is a kind the sheets do not design; a beam or a wall they could not lay out is said apart', () => {
    const left = sheetsLeftOut({ ...base, groups: [group(1, 'brace', 2), group(2, 'beam', 4, 0, 'V7'), group(3, 'wall', 0, 6, 'M2'), group(4, 'column', 1)], rowKeys: ['column:4:0'] });
    expect(left.map((x) => [x.name, x.reason, x.members])).toEqual([['G1', 'kind', 2], ['V7', 'layout', 4], ['M2', 'layout', 6]]);
    expect(left[1]).toMatchObject({ level: 'N1', kind: 'beam' });
  });

  it('a group with nothing in concrete is no concern of the sheets, and a row of another family names no group', () => {
    expect(sheetsLeftOut({ ...base, groups: [group(1, 'beam', 0), group(2, 'column', 1)], rowKeys: ['punching:2:0', 'footing:2'] }))
      .toEqual([{ reason: 'layout', name: 'G2', level: 'N1', kind: 'column', members: 1 }]);
  });

  it('a designed element of a material with no f\'c is said to be designed with the one assumed', () => {
    const left = sheetsLeftOut({ ...base, groups: [{ ...group(1, 'beam', 2, 0, 'V1'), noFc: true }, { ...group(2, 'column', 1), noFc: true }], rowKeys: ['beam:1:0'] });
    expect(left).toEqual([
      { reason: 'fcAssumed', name: 'V1', level: 'N1', kind: 'beam', members: 2, fc: 25 },
      { reason: 'layout', name: 'G2', level: 'N1', kind: 'column', members: 1 },
    ]);
  });

  it('a column carrying more torsion than may be neglected is named with its Tu and the limit; one below it is not', () => {
    const limit = torsionThreshold(0.3, 0.3, 25);
    expect(limit).toBeCloseTo(0.75 * 0.083 * 5 * 0.09 ** 2 / 1.2 * 1000, 9);
    const left = sheetsLeftOut({ ...base, columns: [{ name: 'C1', level: 'N0', b: 0.3, h: 0.3, fc: 25, tu: limit * 2 }, { name: 'C2', b: 0.3, h: 0.3, fc: 25, tu: limit * 0.9 }] });
    expect(left).toEqual([{ reason: 'torsion', name: 'C1', level: 'N0', kind: 'column', members: 1, tu: limit * 2, limit }]);
  });
});
