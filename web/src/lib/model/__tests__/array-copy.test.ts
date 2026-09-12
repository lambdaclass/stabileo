/**
 * Repeating a selection, and the members that only exist between copies.
 *
 * The clipboard pastes one copy at a fixed offset, which is the right shape
 * for "another one of these" and the wrong shape for the job it gets used
 * for: six storeys, twenty purlins, a bay down a shed. Those are a count and
 * a spacing, and doing them by hand accumulates a placement error per paste.
 *
 * The part worth testing hardest is `link`. Repeating a floor plan gives you
 * floors and no building — the columns span BETWEEN a copy and the one before
 * it, so they are not in the thing being copied and have to be created. That
 * is the whole difference between an array tool and six pastes.
 */

import { describe, it, expect } from 'vitest';
import { repeatSelection, repeatIsMeaningful, type RepeatSource, type RepeatTarget } from '../array-copy';

/** A model that records what it was asked to build. */
function recorder() {
  const nodes: Array<{ id: number; x: number; y: number; z: number }> = [];
  const elements: Array<{ id: number; i: number; j: number; type: string; mat?: number; sec?: number }> = [];
  const supports: Array<{ nodeId: number; type: string }> = [];
  let nextNode = 100;
  let nextElem = 500;
  const target: RepeatTarget = {
    addNode(x, y, z) {
      const id = nextNode++;
      nodes.push({ id, x, y, z: z ?? 0 });
      return id;
    },
    addElement(i, j, type) {
      const id = nextElem++;
      elements.push({ id, i, j, type });
      return id;
    },
    setElementMaterial(id, materialId) {
      const e = elements.find((x) => x.id === id);
      if (e) e.mat = materialId;
    },
    setElementSection(id, sectionId) {
      const e = elements.find((x) => x.id === id);
      if (e) e.sec = sectionId;
    },
    addSupport(nodeId, type) { supports.push({ nodeId, type }); },
  };
  return { target, nodes, elements, supports };
}

/** One bay: two columns' worth of nodes and the beam across them. */
const BAY: RepeatSource = {
  nodes: [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: 6, y: 0, z: 0 },
  ],
  elements: [
    { id: 10, nodeI: 1, nodeJ: 2, type: 'frame', materialId: 2, sectionId: 7 },
  ],
  supports: [{ nodeId: 1, type: 'fixed' }],
};

const SPEC = { count: 3, dx: 0, dy: 0, dz: 3, link: false, withSupports: false };

describe('what it refuses', () => {
  it('a zero offset without links, which would stack copies on the original', () => {
    /*
     * Every copy landing exactly on the thing it came from is a way of
     * silently doubling a model. Refused rather than performed.
     */
    expect(repeatIsMeaningful({ ...SPEC, dx: 0, dy: 0, dz: 0 })).toBe(false);
  });

  it('a count below one', () => {
    expect(repeatIsMeaningful({ ...SPEC, count: 0 })).toBe(false);
    expect(repeatIsMeaningful({ ...SPEC, count: -2 })).toBe(false);
  });

  it('and does nothing when asked anyway', () => {
    const r = recorder();
    const out = repeatSelection(BAY, { ...SPEC, dz: 0 }, r.target);
    expect(out.nodes).toEqual([]);
    expect(r.nodes).toEqual([]);
  });
});

describe('the copies', () => {
  it('are placed at multiples of the offset, not at a fixed step', () => {
    const r = recorder();
    repeatSelection(BAY, SPEC, r.target);
    /* Two nodes per copy, three copies. */
    expect(r.nodes).toHaveLength(6);
    expect(r.nodes.map((n) => n.z)).toEqual([3, 3, 6, 6, 9, 9]);
    /* The plan does not drift sideways. */
    expect(new Set(r.nodes.map((n) => n.x))).toEqual(new Set([0, 6]));
  });

  it('carry the members, with their material and section', () => {
    const r = recorder();
    repeatSelection(BAY, SPEC, r.target);
    const beams = r.elements.filter((e) => e.type === 'frame');
    expect(beams).toHaveLength(3);
    for (const b of beams) {
      expect(b.mat, 'the copy is the same member').toBe(2);
      expect(b.sec).toBe(7);
    }
  });

  it('skip a member whose other end was not selected', () => {
    /*
     * A beam running out of the selection has nothing to copy to. Creating
     * it anyway would attach the copy to the ORIGINAL node — a member from
     * the sixth floor to the ground, which is not what anybody drew.
     */
    const dangling: RepeatSource = {
      ...BAY,
      elements: [
        ...BAY.elements,
        { id: 11, nodeI: 2, nodeJ: 99, type: 'frame', materialId: 2, sectionId: 7 },
      ],
    };
    const r = recorder();
    repeatSelection(dangling, { ...SPEC, count: 1 }, r.target);
    expect(r.elements).toHaveLength(1);
  });

  it('take the supports only when asked', () => {
    const without = recorder();
    repeatSelection(BAY, SPEC, without.target);
    expect(without.supports).toEqual([]);

    const with_ = recorder();
    repeatSelection(BAY, { ...SPEC, withSupports: true }, with_.target);
    expect(with_.supports).toHaveLength(3);
  });
});

describe('the members between copies', () => {
  it('join each node to its own image, one copy at a time', () => {
    const r = recorder();
    const out = repeatSelection(BAY, { ...SPEC, link: true }, r.target);

    /* Two nodes × three copies of vertical member. */
    expect(out.links).toHaveLength(6);

    const links = r.elements.filter((e) => out.links.includes(e.id));
    const byNode = new Map<number, number[]>();
    for (const l of links) {
      byNode.set(l.i, [...(byNode.get(l.i) ?? []), l.j]);
    }
    /*
     * The first link starts at the ORIGINAL node, not at a copy — otherwise
     * the stack floats, joined to itself and to nothing on the ground.
     */
    expect(byNode.has(1), 'a column rises from the original node').toBe(true);
    expect(byNode.has(2)).toBe(true);
  });

  it('form a chain, not a fan from the original', () => {
    /*
     * Each column spans one storey. Joining every copy back to the ground
     * node would produce three members through the same space, which reads
     * as one column and analyses as three.
     */
    const r = recorder();
    const out = repeatSelection(BAY, { ...SPEC, link: true }, r.target);
    const links = r.elements.filter((e) => out.links.includes(e.id));

    const zOf = new Map<number, number>([[1, 0], [2, 0]]);
    for (const n of r.nodes) zOf.set(n.id, n.z);

    for (const l of links) {
      const rise = (zOf.get(l.j) ?? 0) - (zOf.get(l.i) ?? 0);
      expect(rise, 'each link spans exactly one copy').toBeCloseTo(3, 9);
    }
  });

  it('are frames, and inherit the selection’s properties', () => {
    const r = recorder();
    const out = repeatSelection(BAY, { ...SPEC, link: true }, r.target);
    const links = r.elements.filter((e) => out.links.includes(e.id));
    for (const l of links) {
      /* A column between storeys carries moment; a release is the reader's call. */
      expect(l.type).toBe('frame');
      expect(l.mat).toBe(2);
      expect(l.sec).toBe(7);
    }
  });

  it('are not created when they were not asked for', () => {
    const r = recorder();
    const out = repeatSelection(BAY, SPEC, r.target);
    expect(out.links).toEqual([]);
  });
});

describe('a horizontal array', () => {
  it('repeats a bay along a shed without touching its height', () => {
    const r = recorder();
    repeatSelection(BAY, { count: 4, dx: 5, dy: 0, dz: 0, link: false, withSupports: false }, r.target);
    expect(r.nodes.map((n) => n.x)).toEqual([5, 11, 10, 16, 15, 21, 20, 26]);
    expect(new Set(r.nodes.map((n) => n.z))).toEqual(new Set([0]));
  });
});
