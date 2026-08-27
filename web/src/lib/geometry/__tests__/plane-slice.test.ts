/**
 * Cutting one frame out of a 3D model.
 *
 * The model under test is the case the feature exists for: a warehouse with
 * two identical portal frames joined by purlins. Projected onto XZ the two
 * frames land exactly on top of each other and the purlins collapse to points
 * — a picture that solves and means nothing. Sliced at y = 0 it is one frame,
 * which is what an engineer would have drawn by hand.
 *
 *        y=0 frame            y=6 frame
 *        1 ──── 2             4 ──── 5          (rafters at z = 4)
 *        │      │             │      │
 *        0      3             6      7          (bases at z = 0)
 *
 *   purlins: 1–4 and 2–5, running along y, piercing every XZ plane between.
 */

import { describe, it, expect } from 'vitest';
import { sliceModelAtPlane, planeOffsets, normalAxis, offsetOf, SLICE_TOL } from '../plane-slice';

const NODES = [
  { id: 0, x: 0, y: 0, z: 0 },
  { id: 1, x: 0, y: 0, z: 4 },
  { id: 2, x: 8, y: 0, z: 4 },
  { id: 3, x: 8, y: 0, z: 0 },
  { id: 4, x: 0, y: 6, z: 4 },
  { id: 5, x: 8, y: 6, z: 4 },
  { id: 6, x: 0, y: 6, z: 0 },
  { id: 7, x: 8, y: 6, z: 0 },
];

const el = (id: number, nodeI: number, nodeJ: number) =>
  ({ id, type: 'frame', nodeI, nodeJ, materialId: 1, sectionId: 1 });

const ELEMENTS = [
  el(10, 0, 1), el(11, 1, 2), el(12, 2, 3),   // the y = 0 frame
  el(13, 6, 4), el(14, 4, 5), el(15, 5, 7),   // the y = 6 frame
  el(20, 1, 4), el(21, 2, 5),                 // purlins, piercing every XZ plane
];

const SUPPORTS = [
  { id: 100, nodeId: 0, type: 'fixed' },
  { id: 101, nodeId: 3, type: 'fixed' },
  { id: 102, nodeId: 6, type: 'fixed' },
  { id: 103, nodeId: 7, type: 'fixed' },
];

const LOADS = [
  { type: 'distributed', data: { id: 200, elementId: 11, qI: -10, qJ: -10 } },  // on the y=0 rafter
  { type: 'distributed', data: { id: 201, elementId: 14, qI: -10, qJ: -10 } },  // on the y=6 rafter
  { type: 'nodal', data: { id: 202, nodeId: 1, fx: 5, fy: 0, fz: 0 } },
  { type: 'nodal', data: { id: 203, nodeId: 4, fx: 5, fy: 0, fz: 0 } },
];

const MATERIALS = new Map([[1, { id: 1, E: 210e6 }]]);
const SECTIONS = new Map([[1, { id: 1, A: 0.01, Iz: 1e-4, Iy: 1e-4 }]]);

const cut = (plane: 'xy' | 'xz' | 'yz', offset: number, tol?: number) =>
  sliceModelAtPlane(plane, offset, NODES, ELEMENTS, SUPPORTS, LOADS, MATERIALS, SECTIONS, tol);

describe('which axis a plane is cut along', () => {
  it('is the one the plane does not contain', () => {
    expect(normalAxis('xy')).toBe('z');
    expect(normalAxis('xz')).toBe('y');
    expect(normalAxis('yz')).toBe('x');
  });

  it('reads that coordinate off a node', () => {
    const n = { x: 1, y: 2, z: 3 };
    expect(offsetOf('xy', n)).toBe(3);
    expect(offsetOf('xz', n)).toBe(2);
    expect(offsetOf('yz', n)).toBe(1);
    // A node with no z is a 2D node sitting at z = 0, not a broken one.
    expect(offsetOf('xy', { x: 1, y: 2 })).toBe(0);
  });
});

describe('the cuts on offer', () => {
  it('finds the two frames and counts what is in each', () => {
    const offs = planeOffsets('xz', NODES, ELEMENTS, SUPPORTS, LOADS);
    expect(offs.map((o) => o.value)).toEqual([0, 6]);
    expect(offs[0]).toEqual({ value: 0, nodes: 4, elements: 3, supports: 2, loads: 2 });
    expect(offs[1]).toEqual({ value: 6, nodes: 4, elements: 3, supports: 2, loads: 2 });
  });

  it('does not credit a plane with the members that merely pierce it', () => {
    // The purlins have one end at y = 0 and one at y = 6, so neither offset
    // may count them — otherwise both frames would advertise five members and
    // deliver three.
    const total = planeOffsets('xz', NODES, ELEMENTS).reduce((s, o) => s + o.elements, 0);
    expect(total).toBe(6);
    expect(ELEMENTS).toHaveLength(8);
  });

  it('sorts by distance, so the list reads like the model', () => {
    const shuffled = [...NODES].reverse();
    expect(planeOffsets('xz', shuffled, ELEMENTS).map((o) => o.value)).toEqual([0, 6]);
  });

  it('groups nodes that differ by less than the tolerance', () => {
    const almost = [...NODES, { id: 99, x: 4, y: SLICE_TOL / 2, z: 2 }];
    expect(planeOffsets('xz', almost, ELEMENTS).map((o) => o.value)).toEqual([0, 6]);
  });

  it('reports an offset that has nodes but no members joining them', () => {
    const stray = [...NODES, { id: 98, x: 4, y: 3, z: 2 }];
    const offs = planeOffsets('xz', stray, ELEMENTS, SUPPORTS);
    expect(offs.find((o) => o.value === 3))
      .toEqual({ value: 3, nodes: 1, elements: 0, supports: 0, loads: 0 });
  });
});

describe('cutting a warehouse into one frame', () => {
  it('takes the frame in the plane and nothing else', () => {
    const r = cut('xz', 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.model.nodes.size).toBe(4);
    expect([...r.model.elements.keys()].sort((a, b) => a - b)).toEqual([10, 11, 12]);
  });

  it('says how much was left behind, and why', () => {
    const r = cut('xz', 0);
    if (!r.ok) throw new Error(r.error);
    // Two purlins pierce the plane; the whole far frame is simply elsewhere.
    expect(r.slice.crossingElements).toBe(2);
    expect(r.slice.elsewhereElements).toBe(3);
    expect(r.slice.elements).toBe(3);
    expect(r.slice.nodes).toBe(4);
  });

  it('lays the frame out in the plane, not on top of itself', () => {
    const r = cut('xz', 0);
    if (!r.ok) throw new Error(r.error);
    // XZ: x → horizontal, z → vertical. The base is 8 m wide and 4 m tall.
    const xs = [...r.model.nodes.values()].map((n) => n.x).sort((a, b) => a - b);
    const ys = [...r.model.nodes.values()].map((n) => n.y).sort((a, b) => a - b);
    expect(xs).toEqual([0, 0, 8, 8]);
    expect(ys).toEqual([0, 0, 4, 4]);
  });

  it('brings only the supports and loads that belong to the cut', () => {
    const r = cut('xz', 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.model.supports.size).toBe(2);
    // Checked by what each load is ATTACHED to, not by its id: the builder
    // renumbers loads on the way through, so an id assertion here would be
    // testing that renumbering rather than the cut.
    expect(r.model.loads).toHaveLength(2);
    const on = r.model.loads.map((l) => {
      const d = l.data as { elementId?: number; nodeId?: number };
      return d.elementId !== undefined ? `element ${d.elementId}` : `node ${d.nodeId}`;
    }).sort();
    expect(on).toEqual(['element 11', 'node 1']);
  });

  it('gives the far frame when cut at the far offset', () => {
    const r = cut('xz', 6);
    if (!r.ok) throw new Error(r.error);
    expect([...r.model.elements.keys()].sort((a, b) => a - b)).toEqual([13, 14, 15]);
    expect(r.model.loads).toHaveLength(2);
    const on = r.model.loads.map((l) => {
      const d = l.data as { elementId?: number; nodeId?: number };
      return d.elementId !== undefined ? `element ${d.elementId}` : `node ${d.nodeId}`;
    }).sort();
    expect(on).toEqual(['element 14', 'node 4']);
  });

  it('is the same frame either way, because the two are identical', () => {
    const a = cut('xz', 0);
    const b = cut('xz', 6);
    if (!a.ok || !b.ok) throw new Error('both cuts should succeed');
    const coords = (m: typeof a.model) =>
      [...m.nodes.values()].map((n) => `${n.x},${n.y}`).sort();
    expect(coords(b.model)).toEqual(coords(a.model));
  });
});

describe('a cut that finds nothing says so', () => {
  it('refuses an offset with no nodes at all', () => {
    const r = cut('xz', 3);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('slice.empty');
  });

  it('refuses an offset whose nodes are not joined by anything', () => {
    const stray = [...NODES, { id: 98, x: 4, y: 3, z: 2 }];
    const r = sliceModelAtPlane('xz', 3, stray, ELEMENTS, SUPPORTS, LOADS, MATERIALS, SECTIONS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Distinct from the above: there IS something at y = 3, it just cannot
    // form a structure, and telling the two apart is the difference between
    // "wrong grid line" and "this grid line has no frame on it".
    expect(r.error).toBe('slice.noElements');
  });
});

describe('the other two planes', () => {
  it('cuts along X, taking the two columns on that grid line', () => {
    // x = 0 holds nodes 0, 1, 4, 6 — the left columns of both frames plus the
    // purlin joining their tops.
    const r = cut('yz', 0);
    if (!r.ok) throw new Error(r.error);
    expect([...r.model.elements.keys()].sort((a, b) => a - b)).toEqual([10, 13, 20]);
  });

  it('cuts along Z, taking what sits at that height', () => {
    // z = 4 is the roof level: both rafters and both purlins lie in it.
    const r = cut('xy', 4);
    if (!r.ok) throw new Error(r.error);
    expect([...r.model.elements.keys()].sort((a, b) => a - b)).toEqual([11, 14, 20, 21]);
    expect(r.slice.crossingElements).toBe(4);   // the four columns
  });
});

describe('tolerance', () => {
  it('accepts a node a rounding error off the plane', () => {
    const wobbly = NODES.map((n) => (n.id === 2 ? { ...n, y: SLICE_TOL / 2 } : n));
    const r = sliceModelAtPlane('xz', 0, wobbly, ELEMENTS, SUPPORTS, LOADS, MATERIALS, SECTIONS);
    if (!r.ok) throw new Error(r.error);
    expect(r.model.nodes.size).toBe(4);
  });

  it('rejects one that is genuinely somewhere else', () => {
    const moved = NODES.map((n) => (n.id === 2 ? { ...n, y: 0.05 } : n));
    const r = sliceModelAtPlane('xz', 0, moved, ELEMENTS, SUPPORTS, LOADS, MATERIALS, SECTIONS);
    if (!r.ok) throw new Error(r.error);
    // Node 2 is out, so the rafter and the right column go with it.
    expect(r.model.nodes.size).toBe(3);
    expect([...r.model.elements.keys()]).toEqual([10]);
  });

  it('can be widened by the caller when a frame is not perfectly aligned', () => {
    const moved = NODES.map((n) => (n.id === 2 ? { ...n, y: 0.05 } : n));
    const r = sliceModelAtPlane('xz', 0, moved, ELEMENTS, SUPPORTS, LOADS, MATERIALS, SECTIONS, 0.1);
    if (!r.ok) throw new Error(r.error);
    expect(r.model.nodes.size).toBe(4);
    expect([...r.model.elements.keys()].sort((a, b) => a - b)).toEqual([10, 11, 12]);
  });
});

/**
 * Whether a cut brings anything to hold the frame up.
 *
 * Measured across the shipped 3D library, this is what decides whether a cut
 * is worth making: of the 75 cuts available in it, 30 fail to solve and every
 * one of those 30 is a frame with no support in it — a cut at roof level, or
 * along a grid line that never reaches the ground. Knowing it beforehand is
 * the difference between choosing a cut and discovering an error.
 */
describe('what a cut would bring to stand on', () => {
  it('counts the supports at each offset', () => {
    const offs = planeOffsets('xz', NODES, ELEMENTS, SUPPORTS);
    expect(offs.map((o) => o.supports)).toEqual([2, 2]);
  });

  it('reports none for a cut taken above the ground', () => {
    // z = 4 is roof level: rafters and purlins, and nothing holding them up.
    const offs = planeOffsets('xy', NODES, ELEMENTS, SUPPORTS);
    const roof = offs.find((o) => o.value === 4);
    expect(roof?.elements).toBeGreaterThan(0);
    expect(roof?.supports).toBe(0);
  });

  it('defaults to none rather than failing when supports are not passed', () => {
    // The count is advisory; a caller that has no supports to hand must still
    // get the list of cuts rather than an exception.
    expect(planeOffsets('xz', NODES, ELEMENTS).every((o) => o.supports === 0)).toBe(true);
  });
});

/**
 * What the cut leaves behind in LOAD, which is the count that was missing.
 *
 * A cut that loses its supports fails loudly: the solver refuses and the user is
 * told. A cut that loses its LOAD solves, reports zero everywhere, and reads as a
 * safe structure — so it has to be said out loud instead, before and after.
 */
describe('load left behind', () => {
  it('counts, per cut, the load that cut would bring', () => {
    const offs = planeOffsets('xz', NODES, ELEMENTS, SUPPORTS, LOADS);
    // The y = 0 frame carries the distributed load on rafter 11 and the nodal
    // load at node 1. The purlin loads belong to no XZ cut at all.
    expect(offs.find((o) => o.value === 0)?.loads).toBe(2);
    expect(offs.find((o) => o.value === 6)?.loads).toBe(2);
  });

  it('agrees with what the cut actually keeps', () => {
    // The number shown before the cut has to be the number the cut honours,
    // or the warning is about a different operation than the one performed.
    const before = planeOffsets('xz', NODES, ELEMENTS, SUPPORTS, LOADS)
      .find((o) => o.value === 0)!;
    const after = cut('xz', 0);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.slice.loads).toBe(before.loads);
    expect(after.slice.droppedLoads).toBe(LOADS.length - before.loads);
  });

  it('reports a cut that keeps members and no load at all', () => {
    // The quiet failure, in its purest form: every load sits on the purlins,
    // which pierce every XZ plane and are never taken. The frame still has
    // three members and four supports, so it solves — and means nothing.
    const onPurlinsOnly = [
      { type: 'distributed', data: { id: 300, elementId: 20, qI: -10, qJ: -10 } },
      { type: 'distributed', data: { id: 301, elementId: 21, qI: -10, qJ: -10 } },
    ];
    const offs = planeOffsets('xz', NODES, ELEMENTS, SUPPORTS, onPurlinsOnly);
    const frame = offs.find((o) => o.value === 0)!;
    expect(frame.elements).toBeGreaterThan(0);
    expect(frame.loads).toBe(0);

    const r = sliceModelAtPlane(
      'xz', 0, NODES, ELEMENTS, SUPPORTS, onPurlinsOnly, MATERIALS, SECTIONS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slice.elements).toBeGreaterThan(0);
    expect(r.slice.loads).toBe(0);
    expect(r.slice.droppedLoads).toBe(2);
  });

  it('counts a load keyed by neither a node nor a member as dropped', () => {
    // A surface load carries `quadId`, and a quad is not something a plane frame
    // can carry — so it is dropped by construction rather than by the cut. That
    // is defensible; going unmentioned is not, because a roof pressure is exactly
    // what the person reaching for this would have.
    const withSurface = [
      ...LOADS,
      { type: 'surface3d', data: { id: 400, quadId: 1, q: -5 } },
    ];
    const r = sliceModelAtPlane(
      'xz', 0, NODES, ELEMENTS, SUPPORTS, withSurface, MATERIALS, SECTIONS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slice.droppedLoads).toBe(withSurface.length - r.slice.loads);
    // And it is not silently counted as belonging to some cut.
    const offs = planeOffsets('xz', NODES, ELEMENTS, SUPPORTS, withSurface);
    expect(offs.reduce((s, o) => s + o.loads, 0)).toBe(LOADS.length);
  });

  it('defaults to none rather than failing when loads are not passed', () => {
    expect(planeOffsets('xz', NODES, ELEMENTS, SUPPORTS).every((o) => o.loads === 0)).toBe(true);
  });
});

/**
 * Whether a hinge survives the cut.
 *
 * The 2D solver reads only `release.mz` as the bending hinge, but a 3D model
 * stores the IN-PLANE hinge under whichever local axis is normal to the
 * plane — and with the canonical auto-orient that is `mz` only for an XY
 * frame. An XZ frame's in-plane hinge is `my`; copying releases verbatim
 * would lose it, and would invent a phantom hinge from the out-of-plane `mz`.
 * The remap lives in the shared builder, so the slice path and the project
 * path get the same answer; these tests pin it per plane.
 */
describe('a released member keeps its hinge through the cut', () => {
  const rel = (my: boolean, mz: boolean) => ({ my, mz, t: false });

  // A portal frame lying wholly in the named plane, with the rafter released
  // at the left end about the axis the plane calls in-plane.
  function frameIn(plane: 'xy' | 'xz' | 'yz', releaseI: ReturnType<typeof rel>, releaseJ?: ReturnType<typeof rel>) {
    const at = (a: number, b: number) =>
      plane === 'xy' ? { x: a, y: b, z: 0 } : plane === 'xz' ? { x: a, y: 0, z: b } : { x: 0, y: a, z: b };
    const nodes = [
      { id: 0, ...at(0, 0) }, { id: 1, ...at(0, 4) },
      { id: 2, ...at(8, 4) }, { id: 3, ...at(8, 0) },
    ];
    const elements = [
      { id: 10, type: 'frame', nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1 },
      { id: 11, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI, releaseJ },
      { id: 12, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 },
    ];
    const supports = [
      { id: 100, nodeId: 0, type: 'fixed' },
      { id: 101, nodeId: 3, type: 'fixed' },
    ];
    const r = sliceModelAtPlane(plane, 0, nodes, elements, supports, [], MATERIALS, SECTIONS);
    if (!r.ok) throw new Error(r.error);
    return r.model.elements.get(11)!;
  }

  it('XZ: the in-plane hinge is my, and lands in mz', () => {
    const rafter = frameIn('xz', rel(true, false));
    expect(rafter.releaseI).toEqual(rel(false, true));
  });

  it('XZ: an out-of-plane mz release does not become a phantom hinge', () => {
    const rafter = frameIn('xz', rel(false, true));
    expect(rafter.releaseI).toEqual(rel(false, false));
  });

  it('XY: mz is already the in-plane hinge, and my is dropped', () => {
    const rafter = frameIn('xy', rel(true, true));
    expect(rafter.releaseI).toEqual(rel(false, true));
  });

  it('YZ: a horizontal member reads the hinge from my, a vertical one from mz', () => {
    // The rafter of the frame above runs horizontally (along Y); with the
    // auto-orient its plane normal is local y, so my is the in-plane hinge.
    const rafter = frameIn('yz', rel(true, true));
    expect(rafter.releaseI).toEqual(rel(false, true));
    // A vertical member (along Z) hits the near-vertical fallback, whose
    // local z IS the plane normal — so its mz survives instead.
    const nodes = [
      { id: 0, x: 0, y: 0, z: 0 }, { id: 1, x: 0, y: 0, z: 4 },
      { id: 2, x: 0, y: 8, z: 4 }, { id: 3, x: 0, y: 8, z: 0 },
    ];
    const elements = [
      { id: 10, type: 'frame', nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1, releaseI: rel(true, true) },
      { id: 11, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 },
      { id: 12, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 },
    ];
    const supports = [
      { id: 100, nodeId: 0, type: 'fixed' },
      { id: 101, nodeId: 3, type: 'fixed' },
    ];
    const r = sliceModelAtPlane('yz', 0, nodes, elements, supports, [], MATERIALS, SECTIONS);
    if (!r.ok) throw new Error(r.error);
    expect(r.model.elements.get(10)!.releaseI).toEqual(rel(false, true));
  });
});

/**
 * A load that survives the cut but carries nothing must not count as kept.
 *
 * This is the failure the dropped-load count was written to prevent and did
 * not. A load survives whenever the thing it acts on survives, but it carries
 * only its IN-PLANE component into the frame: a roof load pointing down the
 * global Z is nothing at all to a horizontal frame. So a cut could advertise
 * forty loads, "keep" all forty, and produce a model carrying zero — with the
 * zero-load warning silent, because it is gated on that same count.
 *
 * Counting objects instead of effect is what made it invisible.
 */
describe('load is counted by what it carries, not by what survives', () => {
  /** A vertical (global Z) distributed load on the y = 0 frame's rafter. */
  const VERTICAL = [
    { type: 'distributed3d', data: { id: 300, elementId: 11, qYI: 0, qYJ: 0, qZI: -10, qZJ: -10 } },
  ];

  it('an XZ cut keeps it, because Z lies in that plane', () => {
    expect(planeOffsets('xz', NODES, ELEMENTS, SUPPORTS, VERTICAL).find((o) => o.value === 0)?.loads)
      .toBe(1);
    const r = sliceModelAtPlane('xz', 0, NODES, ELEMENTS, SUPPORTS, VERTICAL, MATERIALS, SECTIONS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slice.loads).toBe(1);
    expect(r.slice.droppedLoads).toBe(0);
  });

  it('an XY cut does not, because a vertical load is nothing to a horizontal frame', () => {
    // Same load, same members, a plane that cannot hold it. This has to read
    // zero, or the warning gated on it never fires.
    for (const o of planeOffsets('xy', NODES, ELEMENTS, SUPPORTS, VERTICAL)) {
      expect(o.loads, `offset ${o.value}`).toBe(0);
    }
    const r = sliceModelAtPlane('xy', 4, NODES, ELEMENTS, SUPPORTS, VERTICAL, MATERIALS, SECTIONS);
    if (r.ok) {
      expect(r.slice.loads).toBe(0);
      expect(r.slice.droppedLoads).toBe(1);
    }
  });

  it('the preview is exact about ZERO, which is what the warning needs', () => {
    /*
     * Not "advertised equals kept" — that is false in general and I had
     * claimed it. The preview runs before the projection, so it cannot know
     * about members that collapse or duplicate away, and a load on one of
     * those goes with it. Four cuts of the shipped library disagree by a few.
     *
     * What must hold exactly is the equivalence the zero-load warning is
     * gated on, in both directions: a cut that will carry nothing has to
     * count zero (or the warning stays silent when it is needed), and a cut
     * that counts zero has to carry nothing (or it cries wolf).
     */
    for (const plane of ['xy', 'xz', 'yz'] as const) {
      for (const cut of planeOffsets(plane, NODES, ELEMENTS, SUPPORTS, LOADS)) {
        if (cut.elements === 0) continue;
        const r = sliceModelAtPlane(plane, cut.value, NODES, ELEMENTS, SUPPORTS, LOADS, MATERIALS, SECTIONS);
        if (!r.ok) continue;
        expect(cut.loads === 0, `${plane} = ${cut.value}`).toBe(r.slice.loads === 0);
      }
    }
  });

  it('every load is either carried or counted as dropped — none vanish', () => {
    for (const plane of ['xy', 'xz', 'yz'] as const) {
      for (const cut of planeOffsets(plane, NODES, ELEMENTS, SUPPORTS, LOADS)) {
        if (cut.elements === 0) continue;
        const r = sliceModelAtPlane(plane, cut.value, NODES, ELEMENTS, SUPPORTS, LOADS, MATERIALS, SECTIONS);
        if (!r.ok) continue;
        expect(r.slice.loads + r.slice.droppedLoads, `${plane} = ${cut.value}`).toBe(LOADS.length);
      }
    }
  });

  /**
   * Every KIND, including the ones no shipped fixture exercises at zero.
   *
   * The library sweep cannot see this: nothing that ships carries a
   * zero-magnitude point or thermal load, so a rule applied to the
   * distributed branch and forgotten on the other two passed it completely.
   * It did — `pointOnElement` with p = 0 was advertised as nothing by the
   * preview and counted as carried by the projection, which is the same lie
   * this count exists to stop, wearing a rarer type.
   *
   * Enumerating the kinds is what catches a rule applied unevenly. A sweep
   * over real models only ever proves things about the loads real models have.
   */
  const AT_ZERO: Array<[string, { type: string; data: Record<string, unknown> }]> = [
    ['distributed', { type: 'distributed', data: { id: 1, elementId: 11, qI: 0, qJ: 0 } }],
    ['distributed3d', { type: 'distributed3d', data: { id: 1, elementId: 11, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0 } }],
    ['pointOnElement', { type: 'pointOnElement', data: { id: 1, elementId: 11, a: 2, p: 0 } }],
    ['thermal', { type: 'thermal', data: { id: 1, elementId: 11, dtUniform: 0, dtGradient: 0 } }],
    ['nodal', { type: 'nodal', data: { id: 1, nodeId: 1, fx: 0, fz: 0 } }],
    ['nodal3d', { type: 'nodal3d', data: { id: 1, nodeId: 1, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }],
  ];

  for (const [kind, load] of AT_ZERO) {
    it(`a ${kind} carrying nothing is dropped and counted, not "kept"`, () => {
      const cut = planeOffsets('xz', NODES, ELEMENTS, SUPPORTS, [load]).find((o) => o.value === 0)!;
      expect(cut.loads, 'the preview must not advertise it').toBe(0);

      const r = sliceModelAtPlane('xz', 0, NODES, ELEMENTS, SUPPORTS, [load], MATERIALS, SECTIONS);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.slice.loads, 'nor may the slice report it as carried').toBe(0);
      expect(r.slice.droppedLoads, 'and it has to be counted as dropped').toBe(1);
    });
  }

  const CARRYING: Array<[string, { type: string; data: Record<string, unknown> }]> = [
    ['distributed', { type: 'distributed', data: { id: 1, elementId: 11, qI: -10, qJ: -10 } }],
    ['pointOnElement', { type: 'pointOnElement', data: { id: 1, elementId: 11, a: 2, p: -5 } }],
    ['thermal', { type: 'thermal', data: { id: 1, elementId: 11, dtUniform: 20, dtGradient: 0 } }],
    ['nodal', { type: 'nodal', data: { id: 1, nodeId: 1, fx: 3, fz: -7 } }],
  ];

  for (const [kind, load] of CARRYING) {
    it(`a ${kind} that does carry something is not dropped`, () => {
      // The other direction, so the rule cannot be satisfied by dropping
      // everything — which would silence the warning just as effectively.
      const cut = planeOffsets('xz', NODES, ELEMENTS, SUPPORTS, [load]).find((o) => o.value === 0)!;
      expect(cut.loads, `${kind} should be advertised`).toBe(1);

      const r = sliceModelAtPlane('xz', 0, NODES, ELEMENTS, SUPPORTS, [load], MATERIALS, SECTIONS);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.slice.loads, `${kind} should be carried`).toBe(1);
      expect(r.slice.droppedLoads).toBe(0);
    });
  }
});
