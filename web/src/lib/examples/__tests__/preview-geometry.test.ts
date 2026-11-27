import { describe, it, expect } from 'vitest';
import { buildPreview, project, roleOf, PREVIEW_W, PREVIEW_H } from '../preview-geometry';

const portal = {
  nodes: [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 4 }, { id: 3, x: 6, y: 4 }, { id: 4, x: 6, y: 0 },
  ],
  elements: [{ nodeI: 1, nodeJ: 2 }, { nodeI: 2, nodeJ: 3 }, { nodeI: 3, nodeJ: 4 }],
  supports: [{ nodeId: 1, type: 'fixed' }, { nodeId: 4, type: 'pinned' }],
  shells: [],
};

const numbers = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('preview geometry', () => {
  it('sorts members by their own direction: columns, beams and diagonals', () => {
    expect(roleOf(0, 4, 0, true)).toBe('column');
    expect(roleOf(6, 0, 0, true)).toBe('beam');
    expect(roleOf(3, 3, 0, true)).toBe('diagonal');
    expect(roleOf(0, 0, 3, false)).toBe('column');
    expect(roleOf(4, 4, 0, false)).toBe('beam');
    expect(roleOf(4, 0, 0.5, false)).toBe('beam');
  });

  it('draws a plane portal upright, centred and inside the box', () => {
    const p = buildPreview(portal, true);
    expect(p.c.match(/M/g)).toHaveLength(2);
    expect(p.b.match(/M/g)).toHaveLength(1);
    expect(p.d).toBe('');
    const starts = [...p.c.matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    for (const [x, y] of starts) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(PREVIEW_W);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(PREVIEW_H);
    }
    const [x1, y1, f1, x2, y2, f2] = p.p;
    expect(y1).toBe(y2);
    expect(y1, 'the supports are at the foot').toBeGreaterThan(PREVIEW_H / 2);
    expect(x1 + x2).toBeCloseTo(PREVIEW_W, 0);
    expect([f1, f2]).toEqual([1, 0]);
    expect(p.n).toHaveLength(8);
  });

  it('keeps one copy of members that land on the same pixels', () => {
    const doubled = { ...portal, elements: [...portal.elements, { nodeI: 2, nodeJ: 1 }] };
    expect(buildPreview(doubled, true).c).toBe(buildPreview(portal, true).c);
  });

  it('fills shells as closed outlines and skips members with unknown nodes', () => {
    const p = buildPreview({ ...portal, elements: [{ nodeI: 1, nodeJ: 99 }], shells: [[1, 2, 3, 4]] }, true);
    expect(p.c + p.b + p.d).toBe('');
    expect(p.s.match(/Z/g)).toHaveLength(1);
  });

  it('leaves supports and node dots out when there are too many to read', () => {
    const nodes = Array.from({ length: 64 }, (_, i) => ({ id: i + 1, x: i % 8, y: Math.floor(i / 8), z: 0 }));
    const p = buildPreview({ nodes, elements: [{ nodeI: 1, nodeJ: 2 }], supports: nodes.map((n) => ({ nodeId: n.id })), shells: [] }, false);
    expect(p.p).toEqual([]);
    expect(p.n).toEqual([]);
    expect(numbers(p.b).length).toBeGreaterThan(0);
  });

  it('projects space models in isometric with Z up, far members drawn first', () => {
    expect(project(0, 0, 5, false).y).toBeLessThan(project(0, 0, 0, false).y);
    expect(project(1, 0, 0, false).x).toBeGreaterThan(0);
    expect(project(0, 1, 0, false).x).toBeLessThan(0);
    expect(project(5, 5, 0, false).depth).toBeGreaterThan(project(0, 0, 0, false).depth);
  });

  it('returns an empty drawing for an empty model', () => {
    expect(buildPreview({ nodes: [], elements: [], supports: [], shells: [] }, true))
      .toEqual({ w: PREVIEW_W, h: PREVIEW_H, c: '', b: '', d: '', s: '', p: [], n: [] });
  });
});
