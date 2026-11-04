/** Copying a beam line onto a different one: by position, with what does not fit said, never stretched. */
import { describe, it, expect } from 'vitest';
import { matchFloorLines, planFrameCopy, type CopyLine } from '../frame-copy';

const line = (id: string, lengths: number[], sections: number[], forward = lengths.map(() => true)): CopyLine =>
  ({ id, label: id, members: lengths.map((_, i) => Number(`${id.charCodeAt(0)}${i}`)), forward, lengths, sections });

describe('a frame copied onto another', () => {
  it('the same frame: every member copies', () => {
    const p = planFrameCopy(line('a', [5, 4], [1, 1]), line('b', [5, 4], [1, 1]));
    expect(p.rows.map((r) => r.status)).toEqual(['copy', 'copy']);
    expect(p.reversed).toBe(false);
  });

  it('drawn the other way: read reversed, each member\'s bars turned', () => {
    const p = planFrameCopy(line('a', [5, 4], [1, 1]), line('b', [4, 5], [1, 1]));
    expect(p.reversed).toBe(true);
    expect(p.rows.map((r) => [r.status, r.mirror])).toEqual([['copy', true], ['copy', true]]);
  });

  it('another floor with a longer span and a different section: listed, not copied', () => {
    const p = planFrameCopy(line('a', [5, 4, 4], [1, 1, 1]), line('b', [5, 4.3, 4], [1, 1, 2]), 0.05);
    expect(p.rows.map((r) => r.status)).toEqual(['copy', 'length', 'section']);
    expect(p.rows[1]!.lengthSource).toBe(4);
    expect(p.rows[1]!.lengthTarget).toBe(4.3);
  });

  it('a tolerance lets a slightly different length copy', () => {
    const p = planFrameCopy(line('a', [5, 4], [1, 1]), line('b', [5, 4.02], [1, 1]), 0.05);
    expect(p.rows.map((r) => r.status)).toEqual(['copy', 'copy']);
  });

  it('fewer spans on the target: each takes the source member under its middle, the rest unused', () => {
    const src = line('a', [5, 4, 3], [1, 1, 1]);
    const p = planFrameCopy(src, line('b', [5, 4], [1, 1]));
    expect(p.rows.map((r) => r.source)).toEqual([src.members[0], src.members[1]]);
    expect(p.unused).toEqual([src.members[2]]);
    // More spans on the target than the source has: the ones past its end have no source.
    const q = planFrameCopy(line('a', [5], [1]), line('b', [5, 4], [1, 1]));
    expect(q.rows.map((r) => r.status)).toEqual(['copy', 'noSource']);
  });
});

describe('a floor matched to another', () => {
  it('line by line on the same plan line; a line with no partner is listed', () => {
    const at = (id: string, x: number, y: number, dx: number, dy: number) => ({ id, start: { x, y }, dir: { x: dx, y: dy } });
    const m = matchFloorLines([at('A', 0, 0, 1, 0), at('B', 0, 5, 1, 0), at('C', 3, 0, 0, 1)], [at('a', 2, 0, 1, 0), at('c', 3, 1, 0, 1)]);
    expect(m.pairs.map((p) => [p.source.id, p.target.id])).toEqual([['A', 'a'], ['C', 'c']]);
    expect(m.unmatched.map((l) => l.id)).toEqual(['B']);
  });
});
