/**
 * The concrete of a frame as it is built: the four joints the node-to-node solids got wrong, each
 * against concrete written out here by hand as boxes, never through the function under test.
 *
 * Each case states the boxes that make the real concrete and the volume of their union worked by
 * hand. The physical frame must give that volume, cover every point of those boxes once, and put
 * concrete nowhere else: a grid of points through the case's extent is classified against the
 * boxes and against the solids, independently.
 *
 * Before, every member was its section swept from node to node: the volume was ΣA·L, which
 * counts the joint once per member meeting it and leaves the corner a corner beam does not reach
 * empty. Each case states that number too, so the difference is on the page.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPhysicalFrame, frameVolume, insidePolygon, type PhysicalFrame, type PhysicalFrameInput, type XY,
} from '../physical-frame';

type Box = [x0: number, x1: number, y0: number, y1: number, z0: number, z1: number];

interface Case {
  input: PhysicalFrameInput;
  /** The real concrete, as boxes that may overlap. */
  boxes: Box[];
}

const inBox = (p: [number, number, number], b: Box) =>
  p[0] >= b[0] && p[0] <= b[1] && p[1] >= b[2] && p[1] <= b[3] && p[2] >= b[4] && p[2] <= b[5];

/** How many solids contain the point. */
function solidsAt(f: PhysicalFrame, p: [number, number, number]): number {
  let n = 0;
  for (const s of f.solids) {
    if (s.layers.some((l) => p[2] > l.z0 && p[2] < l.z1 && l.polygons.some((poly) => insidePolygon([p[0], p[1]] as XY, poly)))) n++;
  }
  return n;
}

/**
 * Every point of a grid through the boxes' extent, off every face by a non-round step: in a box
 * means in exactly one solid; in no box means in none.
 */
function sample(c: Case, f: PhysicalFrame, step = 0.0437): { overlaps: number; gaps: number; extra: number; points: number } {
  const lo = [0, 2, 4].map((k) => Math.min(...c.boxes.map((b) => b[k]!)) - 0.1);
  const hi = [1, 3, 5].map((k) => Math.max(...c.boxes.map((b) => b[k]!)) + 0.1);
  let overlaps = 0, gaps = 0, extra = 0, points = 0;
  for (let x = lo[0]! + 0.0013; x < hi[0]!; x += step) for (let y = lo[1]! + 0.0017; y < hi[1]!; y += step) for (let z = lo[2]! + 0.0019; z < hi[2]!; z += step) {
    const p: [number, number, number] = [x, y, z];
    const real = c.boxes.some((b) => inBox(p, b));
    const n = solidsAt(f, p);
    points++;
    if (n > 1) overlaps++;
    if (real && n === 0) gaps++;
    if (!real && n > 0) extra++;
  }
  return { overlaps, gaps, extra, points };
}

const col300 = { id: 1, b: 0.3, h: 0.3 };
const beam400x500 = { id: 2, b: 0.4, h: 0.5 };

describe('a beam-column joint with beams wider than the column', () => {
  // Column 300×300 through two storeys (z 0 to 6), beams 400×500 centred on the node at z 3,
  // running 2 m each way along x and y with free far ends.
  const input: PhysicalFrameInput = {
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: 3 }, { id: 3, x: 0, y: 0, z: 6 },
      { id: 4, x: 2, y: 0, z: 3 }, { id: 5, x: -2, y: 0, z: 3 }, { id: 6, x: 0, y: 2, z: 3 }, { id: 7, x: 0, y: -2, z: 3 }],
    elements: [{ id: 1, nodeI: 1, nodeJ: 2, sectionId: 1 }, { id: 2, nodeI: 2, nodeJ: 3, sectionId: 1 },
      { id: 3, nodeI: 2, nodeJ: 4, sectionId: 2 }, { id: 4, nodeI: 5, nodeJ: 2, sectionId: 2 },
      { id: 5, nodeI: 2, nodeJ: 6, sectionId: 2 }, { id: 6, nodeI: 7, nodeJ: 2, sectionId: 2 }],
    sections: [col300, beam400x500], elementIds: [1, 2, 3, 4, 5, 6],
  };
  const c: Case = {
    input,
    boxes: [[-0.15, 0.15, -0.15, 0.15, 0, 6], [-2, 2, -0.2, 0.2, 2.75, 3.25], [-0.2, 0.2, -2, 2, 2.75, 3.25]],
  };
  const f = buildPhysicalFrame(input);

  it('measures the concrete once: 2.015 m³ (node to node said 2.140)', () => {
    // Union by hand: column 0.09·6 = 0.54; each beam line 4·0.4·0.5 = 0.8; less the beams' crossing
    // 0.4·0.4·0.5 = 0.08 and the column inside the band 0.09·0.5 = 0.045: 2.015.
    expect(frameVolume(f)).toBeCloseTo(0.54 + 0.8 + 0.8 - 0.08 - 0.045, 9);
    // Node to node: two columns 0.09·3 and four beams 0.2·2.
    expect(0.09 * 3 * 2 + 0.2 * 2 * 4).toBeCloseTo(2.14, 9);
  });

  it('cuts each member at the joint and puts the joint in the column', () => {
    expect(f.member.get(1)!.span).toMatchObject({ from: 0, to: 2.75 });
    expect(f.member.get(2)!.span!.from).toBeCloseTo(0.25, 9);
    // Each beam starts at the crossing beams' far face, 0.2 m from the node: 1.8·0.4·0.5.
    for (const id of [3, 4, 5, 6]) expect(f.member.get(id)!.volume).toBeCloseTo(0.36, 9);
    const j = f.joint.get(2)!;
    expect(j.volume).toBeCloseTo(0.4 * 0.4 * 0.5, 9);
    expect(j.owner.elementId).toBe(1);
    expect(j.elementIds.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('covers every point of the real concrete once and nothing else', () => {
    const r = sample(c, f);
    expect(r.points).toBeGreaterThan(20_000);
    expect({ overlaps: r.overlaps, gaps: r.gaps, extra: r.extra }).toEqual({ overlaps: 0, gaps: 0, extra: 0 });
  });

  it('forms the faces against no concrete: 17.55 m²', () => {
    // Columns: 4·0.3·2.75 each. Beams: two sides 2·0.5·1.8, soffit 0.4·1.8, the free end 0.4·0.5.
    // Joint: its four sides are the beams' ends; its soffit is the square less the column, 0.16 − 0.09.
    const expected = 2 * (4 * 0.3 * 2.75) + 4 * (2 * 0.5 * 1.8 + 0.4 * 1.8 + 0.4 * 0.5) + (0.16 - 0.09);
    const total = f.solids.reduce((a, s) => a + (s.formwork ?? 0), 0);
    expect(total).toBeCloseTo(expected, 6);
    expect(f.joint.get(2)!.formwork).toBeCloseTo(0.07, 6);
  });
});

describe('a corner where two beams meet with no column', () => {
  // Beam A 400×500 along +x for 4 m, beam B 300×600 along +y for 3 m, both centred at z 3 on the
  // node, nothing under the node. A reaches B's far face and B reaches A's; B is the deeper.
  const input: PhysicalFrameInput = {
    nodes: [{ id: 1, x: 0, y: 0, z: 3 }, { id: 2, x: 4, y: 0, z: 3 }, { id: 3, x: 0, y: 3, z: 3 }],
    elements: [{ id: 1, nodeI: 1, nodeJ: 2, sectionId: 2 }, { id: 2, nodeI: 1, nodeJ: 3, sectionId: 3 }],
    sections: [beam400x500, { id: 3, b: 0.3, h: 0.6 }], elementIds: [1, 2],
  };
  const c: Case = { input, boxes: [[-0.15, 4, -0.2, 0.2, 2.75, 3.25], [-0.15, 0.15, -0.2, 3, 2.7, 3.3]] };
  const f = buildPhysicalFrame(input);

  it('closes the corner: 1.346 m³ (node to node said 1.340, with the corner empty)', () => {
    // A 4.15·0.4·0.5 = 0.83, B 3.2·0.3·0.6 = 0.576, less their overlap 0.3·0.4·0.5 = 0.06.
    expect(frameVolume(f)).toBeCloseTo(0.83 + 0.576 - 0.06, 9);
    expect(4 * 0.2 + 3 * 0.18).toBeCloseTo(1.34, 9);
  });

  it('gives the joint to the deeper beam, standing only where each beam stands', () => {
    const j = f.joint.get(1)!;
    expect(j.owner.elementId).toBe(2);
    // 0.3×0.4 in plan: 0.05 m of B alone below A, 0.5 m of both, 0.05 m of B alone above.
    expect(j.volume).toBeCloseTo(0.12 * 0.6, 9);
    expect(j.layers.map((l) => [l.z0, l.z1].map((z) => +z.toFixed(4)))).toEqual([[2.7, 2.75], [2.75, 3.25], [3.25, 3.3]]);
  });

  it('covers every point of the real concrete once and nothing else', () => {
    expect(sample(c, f)).toMatchObject({ overlaps: 0, gaps: 0, extra: 0 });
  });
});

describe('an eccentric column', () => {
  // Column 300×300 through two storeys, its axis 0.10 m off the nodes in +y (a declared insertion),
  // a 400×500 beam running 3 m each way along x through the node at z 3.
  const off = { frame: 'global' as const, i: { x: 0, y: 0.1, z: 0 }, j: { x: 0, y: 0.1, z: 0 } };
  const input: PhysicalFrameInput = {
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: 3 }, { id: 3, x: 0, y: 0, z: 6 }, { id: 4, x: 3, y: 0, z: 3 }, { id: 5, x: -3, y: 0, z: 3 }],
    elements: [{ id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, offset: off }, { id: 2, nodeI: 2, nodeJ: 3, sectionId: 1, offset: off },
      { id: 3, nodeI: 2, nodeJ: 4, sectionId: 2 }, { id: 4, nodeI: 5, nodeJ: 2, sectionId: 2 }],
    sections: [col300, beam400x500], elementIds: [1, 2, 3, 4],
  };
  const c: Case = { input, boxes: [[-0.15, 0.15, -0.05, 0.25, 0, 6], [-3, 3, -0.2, 0.2, 2.75, 3.25]] };
  const f = buildPhysicalFrame(input);

  it('stands the column where its insertion puts it: 1.7025 m³ (node to node said 1.740)', () => {
    // Column 0.09·6 = 0.54, beam 6·0.4·0.5 = 1.2, less the column inside the beam: 0.3·0.25·0.5.
    expect(frameVolume(f)).toBeCloseTo(0.54 + 1.2 - 0.0375, 9);
    expect(0.09 * 6 + 1.2).toBeCloseTo(1.74, 9);
  });

  it('takes the joint as the column footprint and the beam beside it', () => {
    // x from −0.15 to 0.15, y from −0.2 (the beam's side) to 0.25 (the column's), over the band.
    expect(f.joint.get(2)!.volume).toBeCloseTo(0.3 * 0.45 * 0.5, 9);
    expect(sample(c, f)).toMatchObject({ overlaps: 0, gaps: 0, extra: 0 });
  });
});

describe('the roof, a beam centred on the node over a column wider than it', () => {
  // Column 400×400 from z 0 to the roof node at z 3, a 250×500 beam centred on the node running
  // 3 m each way: the column's concrete rises to the beam's top, beside the beam too.
  const input: PhysicalFrameInput = {
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: 3 }, { id: 3, x: 3, y: 0, z: 3 }, { id: 4, x: -3, y: 0, z: 3 }],
    elements: [{ id: 1, nodeI: 1, nodeJ: 2, sectionId: 4 }, { id: 2, nodeI: 2, nodeJ: 3, sectionId: 5 }, { id: 3, nodeI: 4, nodeJ: 2, sectionId: 5 }],
    sections: [{ id: 4, b: 0.4, h: 0.4 }, { id: 5, b: 0.25, h: 0.5 }], elementIds: [1, 2, 3],
  };
  const c: Case = { input, boxes: [[-0.2, 0.2, -0.2, 0.2, 0, 3.25], [-3, 3, -0.125, 0.125, 2.75, 3.25]] };
  const f = buildPhysicalFrame(input);

  it('fills the top of the joint and counts the column once: 1.22 m³ (node to node said 1.23)', () => {
    // Column to the joint's top 0.16·3.25 = 0.52, beam 6·0.25·0.5 = 0.75, less the beam inside it 0.4·0.25·0.5.
    expect(frameVolume(f)).toBeCloseTo(0.52 + 0.75 - 0.05, 9);
    // Node to node counted 0.025 m³ twice under the node and left 0.015 m³ empty above it.
    expect(0.16 * 3 + 0.75).toBeCloseTo(1.22 + 0.025 - 0.015, 9);
    expect(sample(c, f)).toMatchObject({ overlaps: 0, gaps: 0, extra: 0 });
  });
});

describe('a slab on the frame', () => {
  // The first case with a 0.12 m slab on the quarter x, y in [0, 2], centred on the node at z 3.
  const base = {
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: 3 }, { id: 3, x: 0, y: 0, z: 6 },
      { id: 4, x: 2, y: 0, z: 3 }, { id: 5, x: -2, y: 0, z: 3 }, { id: 6, x: 0, y: 2, z: 3 }, { id: 7, x: 0, y: -2, z: 3 }, { id: 8, x: 2, y: 2, z: 3 }],
    elements: [{ id: 1, nodeI: 1, nodeJ: 2, sectionId: 1 }, { id: 2, nodeI: 2, nodeJ: 3, sectionId: 1 },
      { id: 3, nodeI: 2, nodeJ: 4, sectionId: 2 }, { id: 4, nodeI: 5, nodeJ: 2, sectionId: 2 },
      { id: 5, nodeI: 2, nodeJ: 6, sectionId: 2 }, { id: 6, nodeI: 7, nodeJ: 2, sectionId: 2 }],
    sections: [col300, beam400x500], elementIds: [1, 2, 3, 4, 5, 6],
  };
  const input: PhysicalFrameInput = { ...base, shells: [{ key: 'q1', nodes: [2, 4, 8, 6], thickness: 0.12 }] };
  const c: Case = {
    input,
    boxes: [[-0.15, 0.15, -0.15, 0.15, 0, 6], [-2, 2, -0.2, 0.2, 2.75, 3.25], [-0.2, 0.2, -2, 2, 2.75, 3.25], [0, 2, 0, 2, 2.94, 3.06]],
  };
  const f = buildPhysicalFrame(input);

  it('leaves the frame whole and measures the slab net of it: 0.3888 m³', () => {
    // The quarter 2·2 less the frame in it (two beam strips 0.2·2 each, less their 0.2·0.2 overlap).
    const net = 4 - (0.2 * 2 + 0.2 * 2 - 0.04);
    expect(f.slab.get('q1')!.volume).toBeCloseTo(net * 0.12, 9);
    expect(frameVolume(f)).toBeCloseTo(2.015 + net * 0.12, 9);
    for (const id of [3, 4, 5, 6]) expect(f.member.get(id)!.volume).toBeCloseTo(0.36, 9);
    expect(sample(c, f)).toMatchObject({ overlaps: 0, gaps: 0, extra: 0 });
  });

  it('forms the slab soffit and its free edges, and no beam side it covers', () => {
    // Soffit 3.24; free edges x = 2 and y = 2, 1.8 m each beyond the beams, 0.12 deep.
    expect(f.slab.get('q1')!.formwork).toBeCloseTo(3.24 + 2 * 1.8 * 0.12, 6);
    // The beams along +x and +y lose the 1.8·0.12 of side the slab is cast against.
    const bare = buildPhysicalFrame(base);
    expect(bare.member.get(3)!.formwork! - f.member.get(3)!.formwork!).toBeCloseTo(1.8 * 0.12, 6);
    expect(bare.member.get(4)!.formwork! - f.member.get(4)!.formwork!).toBeCloseTo(0, 6);
  });
});

describe('what it does not cut', () => {
  it('sweeps an inclined member uncut and says so', () => {
    const f = buildPhysicalFrame({
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 3, y: 0, z: 4 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2, sectionId: 2 }], sections: [beam400x500], elementIds: [1],
    });
    expect(f.untrimmed).toEqual([{ elementId: 1, reason: 'inclined' }]);
    expect(f.member.get(1)!.volume).toBeCloseTo(0.2 * 5, 9);
    expect(f.member.get(1)!.formwork).toBeUndefined();
  });

  it('refuses a member with no rectangle, as the scene does', () => {
    const f = buildPhysicalFrame({
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 3, y: 0, z: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2, sectionId: 9 }], sections: [{ id: 9 }], elementIds: [1],
    });
    expect(f.refused).toEqual([{ elementId: 1, reason: 'noRectangle' }]);
    expect(f.solids).toEqual([]);
  });
});
