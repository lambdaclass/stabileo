/**
 * Members lying over each other, for the editor's question (one list from the
 * same two tests the diagnostics use), and the report's numbered model figure.
 */
import { describe, it, expect } from 'vitest';
import { overlappingMemberPairs } from '../model-diagnostics';
import { modelFigureSvg } from '../report/model-figure';

const nodes = new Map([
  [1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 6, y: 0 }], [3, { id: 3, x: 3, y: 0 }],
  [4, { id: 4, x: 0, y: 3 }],
]);
const el = (id: number, nodeI: number, nodeJ: number) => ({ id, type: 'frame', nodeI, nodeJ, materialId: 1, sectionId: 1 });

describe('members lying over each other', () => {
  it('finds a repeated node pair, newer member second', () => {
    const elements = new Map([[1, el(1, 1, 2)], [5, el(5, 2, 1)]]);
    expect(overlappingMemberPairs(elements as never, nodes as never)).toEqual([{ a: 1, b: 5, duplicate: true, length: 6 }]);
  });
  it('finds a member over part of another, with the length they share', () => {
    const elements = new Map([[1, el(1, 1, 2)], [2, el(2, 1, 3)]]);
    const [p] = overlappingMemberPairs(elements as never, nodes as never);
    expect(p).toMatchObject({ a: 1, b: 2, duplicate: false });
    expect(p!.length).toBeCloseTo(3);
  });
  it('says nothing of members that only meet or cross', () => {
    const elements = new Map([[1, el(1, 1, 3)], [2, el(2, 3, 2)], [3, el(3, 1, 4)]]);
    expect(overlappingMemberPairs(elements as never, nodes as never)).toEqual([]);
  });
});

describe('the report\'s model figure', () => {
  it('numbers every node and member, in 2D', () => {
    const svg = modelFigureSvg({
      nodes: [...nodes.values()], elements: [el(1, 1, 3), el(2, 3, 2), el(3, 1, 4)], supports: [{ nodeId: 1 }], is3D: false,
    });
    expect(svg.startsWith('<svg')).toBe(true);
    for (const id of ['1', '2', '3', '4']) expect(svg).toContain(`>${id}</text>`);
    expect(svg).toContain('<polygon');
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
  it('draws a 3D model in an isometric view, and a lone node without failing', () => {
    const svg = modelFigureSvg({
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: 3 }, { id: 3, x: 4, y: 0, z: 3 }],
      elements: [el(1, 1, 2), el(2, 2, 3)], supports: [], is3D: true,
    });
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(modelFigureSvg({ nodes: [{ id: 1, x: 0, y: 0 }], elements: [], supports: [], is3D: false })).not.toMatch(/NaN/);
    expect(modelFigureSvg({ nodes: [], elements: [], supports: [], is3D: false })).toBe('');
  });
});

describe('a 2D model shown upright in the 3D workspace', () => {
  /** The members' lines, as [x1, y1, x2, y2] in the drawing. */
  const lines = (svg: string) => [...svg.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)]
    .map((m) => m.slice(1, 5).map(Number));

  it('draws a column standing, as the 3D view shows it, not lying on the ground', () => {
    // A portal: two columns (0,0)→(0,3) and (4,0)→(4,3) and the beam; vertical in y, z = 0.
    const portal = [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 3, z: 0 }, { id: 3, x: 4, y: 3, z: 0 }, { id: 4, x: 4, y: 0, z: 0 }];
    const svg = modelFigureSvg({
      nodes: portal, elements: [el(1, 1, 2), el(2, 2, 3), el(3, 4, 3)], supports: [{ nodeId: 1 }, { nodeId: 4 }],
      is3D: true, project2DToXZ: true,
    });
    const [column, beam] = lines(svg);
    // Upright on the page: one x, the top above the foot (SVG y grows downward).
    expect(column![0]).toBeCloseTo(column![2]!, 1);
    expect(column![3]).toBeLessThan(column![1]! - 10);
    // The beam is not vertical; it runs across in the isometric view.
    expect(Math.abs(beam![0]! - beam![2]!)).toBeGreaterThan(10);
  });
});
