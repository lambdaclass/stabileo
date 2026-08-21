/**
 * The preview projection, checked against the invariants a projection has to satisfy.
 *
 * A drawing is the one part of the generator surface that can be plausibly wrong: nobody
 * notices a truss drawn 5 % too shallow, and a picture that disagrees with the model it
 * claims to show is worse than no picture. So the elevation is checked against coordinates
 * that are known by hand, and the isometric against the properties of an axonometric
 * projection — parallel lines stay parallel, equal world lengths along one axis stay equal,
 * and depth ordering follows distance from the viewer.
 */

import { describe, it, expect } from 'vitest';
import { generateTruss } from '../truss-topology';
import { generateLatticeColumn } from '../lattice-column';
import { generateShed, DEFAULT_SHED_PARAMS } from '../shed';
import {
  projectTopology, roleWidth, ROLE_COLOUR, type Projection,
} from '../preview-projection';
import { MEMBER_ROLES } from '../member-roles';

const inside = (p: Projection, x: number, y: number) =>
  x >= p.viewBox.x && x <= p.viewBox.x + p.viewBox.w
  && y >= p.viewBox.y && y <= p.viewBox.y + p.viewBox.h;

describe('elevation — z is up on screen', () => {
  const t = generateTruss({ kind: 'trapezoidal', spanM: 10, endDepthM: 0.6, riseM: 1, panelsPerHalf: 5 });
  const p = projectTopology(t, { view: 'elevation' });

  it('keeps x and flips z, because SVG counts downward and structures do not', () => {
    for (const [i, n] of t.nodes.entries()) {
      expect(p.nodes[i].x).toBeCloseTo(n.x, 12);
      expect(p.nodes[i].y).toBeCloseTo(-n.z, 12);
    }
  });

  it('puts the ridge above the bearings on screen', () => {
    const ys = p.nodes.map((n) => n.y);
    const ridgeY = Math.min(...ys);
    const bottomY = Math.max(...ys);
    expect(ridgeY).toBeLessThan(bottomY);
    // The bottom chord sits at z = 0 → y = 0.
    expect(bottomY).toBeCloseTo(0, 12);
    // Ridge is endDepth + rise above it.
    expect(ridgeY).toBeCloseTo(-1.6, 9);
  });

  it('projects one segment per member, keeping its role', () => {
    expect(p.segments).toHaveLength(t.members.length);
    const byRole = (arr: Array<{ role: string }>) =>
      arr.reduce<Record<string, number>>((a, s) => ({ ...a, [s.role]: (a[s.role] ?? 0) + 1 }), {});
    expect(byRole(p.segments)).toEqual(byRole(t.members));
  });

  it('carries no depth, since there is nothing to order', () => {
    for (const s of p.segments) expect(s.depth).toBe(0);
    for (const n of p.nodes) expect(n.depth).toBe(0);
  });

  it('draws no footprint', () => {
    expect(p.footprint).toEqual([]);
  });

  it('marks the two bearings, and says which is fixed', () => {
    expect(p.supports).toHaveLength(2);
    for (const s of p.supports) expect(s.y).toBeCloseTo(0, 12);
    const column = projectTopology(generateLatticeColumn({ fixedBase: true }), { view: 'elevation' });
    expect(column.supports.every((s) => s.type === 'fixed')).toBe(true);
  });
});

describe('the viewBox fits the content', () => {
  it('contains every projected node, with margin on all sides', () => {
    const p = projectTopology(generateTruss(), { view: 'elevation' });
    for (const n of p.nodes) expect(inside(p, n.x, n.y)).toBe(true);
    // Margin: nothing sits exactly on the edge.
    const xs = p.nodes.map((n) => n.x);
    expect(Math.min(...xs)).toBeGreaterThan(p.viewBox.x);
    expect(Math.max(...xs)).toBeLessThan(p.viewBox.x + p.viewBox.w);
  });

  it('never returns a zero dimension, even for a structure with no width on screen', () => {
    // A lattice column in elevation is much taller than it is wide; a bug that scaled by the
    // smaller dimension would divide by something near zero and draw nothing.
    const p = projectTopology(generateLatticeColumn({ heightM: 8, widthM: 0.6 }), { view: 'elevation' });
    expect(p.viewBox.w).toBeGreaterThan(0);
    expect(p.viewBox.h).toBeGreaterThan(0);
    expect(p.viewBox.h).toBeGreaterThan(p.viewBox.w);
  });

  it('includes the footprint, not only the members', () => {
    const shed = generateShed({ ...DEFAULT_SHED_PARAMS, frames: 4 });
    const footprint = { spanM: 10, lengthM: 15 };
    const withIt = projectTopology(shed, { view: 'isometric', footprint });
    for (const q of withIt.footprint) expect(inside(withIt, q.x, q.y)).toBe(true);
  });

  it('gives a degenerate topology a usable box rather than an empty one', () => {
    const p = projectTopology(
      { nodes: [{ i: 0, x: 1, y: 1, z: 1 }], members: [], supports: [], counts: {} as never,
        totalLengthM: 0, slopePercent: null, assumptions: [] },
      { view: 'elevation' },
    );
    expect(p.viewBox.w).toBeGreaterThan(0);
    expect(p.viewBox.h).toBeGreaterThan(0);
  });
});

describe('isometric — an axonometric projection, with its properties', () => {
  const shed = generateShed({ ...DEFAULT_SHED_PARAMS, frames: 4, roof: true, purlins: true });
  const p = projectTopology(shed, { view: 'isometric', footprint: { spanM: 10, lengthM: 15 } });

  it('separates the frames on screen, so four frames read as four', () => {
    // Frames sit at distinct Y. Under the projection each Y has to land somewhere different,
    // or the isometric view would draw one frame and hide the other three behind it.
    //
    // Taken from the ground nodes as a group rather than from a node at x = 0: a latticed
    // column has no material on its own axis, so there is no node there — which is exactly
    // the assumption the first version of this test got wrong.
    const frameYs = [...new Set(shed.nodes.filter((n) => n.z < 1e-9).map((n) => n.y))].sort((a, b) => a - b);
    expect(frameYs.length).toBeGreaterThanOrEqual(4);

    const screen = frameYs.map((y) => {
      const one = projectTopology(
        { ...shed, nodes: [{ i: 0, x: 0, y, z: 0 }], members: [], supports: [] } as never,
        { view: 'isometric' },
      );
      return `${one.nodes[0].x.toFixed(6)},${one.nodes[0].y.toFixed(6)}`;
    });
    expect(new Set(screen).size).toBe(frameYs.length);
  });

  it('keeps parallel world lines parallel on screen', () => {
    // Two purlins in different bays run along Y at the same x and z. Parallel in the world,
    // so parallel on screen — the defining property of an axonometric projection.
    const purlins = p.segments.filter((s) => s.role === 'purlin');
    expect(purlins.length).toBeGreaterThan(2);
    const dir = (s: typeof purlins[number]) => {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const L = Math.hypot(dx, dy);
      const sign = dx < 0 || (dx === 0 && dy < 0) ? -1 : 1;
      return `${((dx / L) * sign).toFixed(6)},${((dy / L) * sign).toFixed(6)}`;
    };
    expect(new Set(purlins.map(dir)).size).toBe(1);
  });

  it('preserves equal world lengths along one axis as equal screen lengths', () => {
    const purlins = p.segments.filter((s) => s.role === 'purlin');
    const lens = purlins.map((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1));
    // Every purlin spans one bay, so every screen length is the same.
    for (const L of lens) expect(L).toBeCloseTo(lens[0], 9);
  });

  it('orders the members back to front, so the near ones overlap the far ones', () => {
    for (let i = 1; i < p.segments.length; i++) {
      expect(p.segments[i].depth).toBeGreaterThanOrEqual(p.segments[i - 1].depth);
    }
  });

  it('draws the footprint as a quadrilateral under the building', () => {
    expect(p.footprint).toHaveLength(4);
    // All four corners are at z = 0, so they project onto the lowest band of the drawing —
    // below every node that is above the ground.
    const roofY = Math.min(...p.nodes.map((n) => n.y));
    for (const q of p.footprint) expect(q.y).toBeGreaterThan(roofY);
  });

  it('projects one segment per member here too', () => {
    expect(p.segments).toHaveLength(shed.members.length);
  });
});

describe('the legend and the drawing cannot disagree', () => {
  it('has a colour for every role that exists', () => {
    for (const role of MEMBER_ROLES) {
      expect(ROLE_COLOUR[role], role).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('gives distinct colours to the roles a single generator places together', () => {
    // Chord, post and diagonal appear in the same drawing; if two shared a colour the
    // legend would attribute members to the wrong role.
    const lattice = ['chord', 'post', 'diagonal'] as const;
    expect(new Set(lattice.map((r) => ROLE_COLOUR[r])).size).toBe(3);
    const shedRoles = ['chord', 'post', 'diagonal', 'purlin', 'beam'] as const;
    expect(new Set(shedRoles.map((r) => ROLE_COLOUR[r])).size).toBe(5);
  });

  it('scales stroke width with the drawing, so it reads at any span', () => {
    const small = projectTopology(generateTruss({ spanM: 4 }), { view: 'elevation' });
    const large = projectTopology(generateTruss({ spanM: 40 }), { view: 'elevation' });
    expect(roleWidth('chord', large.viewBox)).toBeGreaterThan(roleWidth('chord', small.viewBox));
    // And a chord is drawn heavier than a diagonal, at either size.
    for (const p of [small, large]) {
      expect(roleWidth('chord', p.viewBox)).toBeGreaterThan(roleWidth('diagonal', p.viewBox));
    }
  });
});
