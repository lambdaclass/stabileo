/**
 * Web openings placed from the frame editor: a point of the line is a member and its own
 * position, and an opening saved on a member is drawn back at the same point of the line,
 * whichever way the member runs.
 */
import { describe, it, expect } from 'vitest';
import { lineOpenings, memberAtLine } from '../line-openings';
import type { OpeningCheck } from '../special-elements';

const line = { members: [7, 9], lengths: [5, 4] };

describe('openings on a beam line', () => {
  it('a point of the line is the member under it and its position from its i node', () => {
    expect(memberAtLine(line, [true, true], 2)).toEqual({ elementId: 7, x: 2 });
    expect(memberAtLine(line, [true, true], 6.5)).toEqual({ elementId: 9, x: 1.5 });
    // The second member runs against the line: 6,5 m on the line is 2,5 m from its i node.
    expect(memberAtLine(line, [true, false], 6.5)).toEqual({ elementId: 9, x: 2.5 });
    expect(memberAtLine(line, [true, true], 9.5)).toBeNull();
  });

  it('round-trips: saved where the line says, drawn back at the same point', () => {
    for (const forward of [[true, true], [true, false]]) {
      const at = memberAtLine(line, forward, 6.5)!;
      const check = { entry: { id: 'o1', elementId: at.elementId, x: at.x, lo: 0.4, ho: 0.15 }, status: 'ok', rows: [], mu: 1, vu: 1, design: null } as unknown as OpeningCheck;
      const [o] = lineOpenings([check], line, forward, () => 0.5);
      expect(o!.lineX).toBeCloseTo(6.5, 9);
      expect([o!.from, o!.to]).toEqual([6.3, 6.7].map((v) => expect.closeTo(v, 9)));
      expect(o!.hShare).toBeCloseTo(0.3, 9);
    }
  });
});
