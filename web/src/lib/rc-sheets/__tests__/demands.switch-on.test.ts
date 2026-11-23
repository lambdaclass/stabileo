import { describe, it, expect } from 'vitest';
import { wideBeamShear } from '../demands';

describe('a slab on posts in one-way shear', () => {
  it('averages the shear across a cut by the width each element covers, not by how many there are', () => {
    const boxes = new Map([
      ['q1', { x0: 2, x1: 2.2, y0: 0, y1: 0.1 }],
      ['q2', { x0: 2, x1: 2.2, y0: 0.1, y1: 1 }],
    ]);
    const rows = [{ key: 'q1', q: [100, 0] }, { key: 'q2', q: [10, 0] }];
    const r = wideBeamShear(rows, boxes, [{ p: { id: 1, x: 10, y: 10 }, r: 0.5 }])!;
    expect(r.qx).toBeCloseTo((100 * 0.1 + 10 * 0.9) / 1, 9);
  });

  it('reads no shear in a direction every cut of which runs within reach of a post, so its elements are read instead', () => {
    const boxes = new Map([['q1', { x0: 2, x1: 2.2, y0: 0, y1: 1 }]]);
    const r = wideBeamShear([{ key: 'q1', q: [80, 30] }], boxes, [{ p: { id: 1, x: 2.1, y: 10 }, r: 0.5 }])!;
    expect(r.qx).toBeNull();
    expect(r.qy).toBeCloseTo(30, 9);
  });
});

describe('a beam over a wall', () => {
  const pts: Array<[number, number, number, number]> = [
    [1, 0, 0, 3], [2, 4, 0, 3], [3, 8, 0, 3], [4, 0, 0, 0], [5, 8, 0, 0],
    [6, 4, -1, 0], [7, 4, 0, 0], [8, 4, 1, 0], [9, 4, -1, 3], [10, 4, 1, 3],
    [11, 10, 0, 3], [12, 12, -1, 3], [13, 12, 1, 3], [14, 12, -1, 0], [15, 12, 0, 0], [16, 12, 1, 0], [17, 12, 0, 3],
  ];
  const nodes = new Map(pts.map(([id, x, y, z]) => [id, { id, x, y, z }]));
  const el = (id: number, nodeI: number, nodeJ: number) => [id, { id, nodeI, nodeJ, sectionId: 1 }] as const;
  const quad = (id: number, ns: number[]) => [id, { id, nodes: ns, thickness: 0.2 }] as const;
  const input = (beam: number[]) => ({
    nodes, elements: new Map([el(1, 1, 2), el(2, 2, 3), el(3, 4, 1), el(4, 5, 3), el(5, 3, 11), el(6, 11, 17)]), sections: new Map([[1, { id: 1, b: 0.2, h: 0.5 }]]),
    supportNodes: new Set([4, 5]),
    shells: { nodes, quads: new Map([quad(1, [6, 7, 2, 9]), quad(2, [7, 8, 10, 2]), quad(3, [14, 15, 17, 12]), quad(4, [15, 16, 13, 17])]) },
    groups: [{ id: 1, name: 'V1', kind: 'beam', elements: beam, quads: [], plates: [] }], sets: [],
  });

  it('cuts the line into spans at a wall it crosses, and reads an end that runs into a wall as resting on it', async () => {
    const { beamDemands } = await import('../demands');
    const across = beamDemands(input([1, 2]) as never);
    expect(across.map((d) => d.length)).toEqual([4, 4]);
    const into = beamDemands(input([5, 6]) as never);
    expect(into).toHaveLength(1);
    expect(into[0]!.ends!.end).toEqual({ kind: 'column', half: 0.1 });
    expect(into[0]!.ends!.start).toMatchObject({ kind: 'column', corner: true });
    expect(across[0]!.ends!.start).toMatchObject({ kind: 'column', corner: true });
  });

  it('runs on along a wall it lies on, as on nothing', async () => {
    const { beamDemands } = await import('../demands');
    const along = { ...input([1, 2]), shells: { nodes, quads: new Map([quad(1, [4, 7, 2, 1]), quad(2, [7, 5, 3, 2])]) } };
    expect(beamDemands(along as never).map((d) => d.length)).toEqual([8]);
  });
});
