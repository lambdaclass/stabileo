import { describe, it, expect } from 'vitest';
import { buildPreview, project, PREVIEW_W, PREVIEW_H } from '../preview-geometry';

const portal = {
  nodes: [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 4 }, { id: 3, x: 6, y: 4 }, { id: 4, x: 6, y: 0 },
  ],
  elements: [{ nodeI: 1, nodeJ: 2 }, { nodeI: 2, nodeJ: 3 }, { nodeI: 3, nodeJ: 4 }],
  supports: [{ nodeId: 1 }, { nodeId: 4 }],
  shells: [],
};

describe('preview geometry', () => {
  it('draws a plane portal upright, centred and inside the box', () => {
    const p = buildPreview(portal, true);
    expect(p.m.match(/M/g)).toHaveLength(3);
    const nums = (p.m.match(/\d+/g) ?? []).map(Number);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...nums)).toBeLessThanOrEqual(PREVIEW_W);
    const [x1, y1, x2, y2] = p.p;
    expect(y1).toBe(y2);
    expect(y1).toBeGreaterThan(PREVIEW_H / 2);
    expect(x1 + x2).toBeCloseTo(PREVIEW_W, -1);
  });

  it('keeps one copy of members that land on the same pixels', () => {
    const doubled = { ...portal, elements: [...portal.elements, { nodeI: 2, nodeJ: 1 }] };
    expect(buildPreview(doubled, true).m).toBe(buildPreview(portal, true).m);
  });

  it('draws shells as outlines and skips unknown nodes', () => {
    const p = buildPreview({ ...portal, elements: [{ nodeI: 1, nodeJ: 99 }], shells: [[1, 2, 3, 4]] }, true);
    expect(p.m).toBe('');
    expect(p.s.match(/M/g)).toHaveLength(4);
  });

  it('projects space models in isometric with Z up', () => {
    const [, top] = project(0, 0, 5, false);
    const [, bottom] = project(0, 0, 0, false);
    expect(top).toBeLessThan(bottom);
    expect(project(1, 0, 0, false)[0]).toBeGreaterThan(0);
    expect(project(0, 1, 0, false)[0]).toBeLessThan(0);
  });

  it('returns an empty drawing for an empty model', () => {
    expect(buildPreview({ nodes: [], elements: [], supports: [], shells: [] }, true)).toEqual({ w: PREVIEW_W, h: PREVIEW_H, m: '', s: '', p: [] });
  });
});
