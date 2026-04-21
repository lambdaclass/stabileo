import { describe, it, expect } from 'vitest';
import { buildProxyPositions } from '../elements-proxy';

describe('elements proxy positions', () => {
  it('projects 2D nodes to the XZ plane when project2DToXZ is true', () => {
    // Regression: an earlier version of the orbit proxy pushed raw (x, y, z ?? 0)
    // positions, ignoring the XZ-upright mapping. With a flat 2D model that had
    // been toggled into 3D mode (viewportPresentation3D = 'upright2dIn3d'), the
    // rest of the scene drew nodes at (x, 0, y) while the proxy drew them at
    // (x, y, 0) — so during orbit the model visibly lay down on XY and stood
    // back up on release.
    const nodes = new Map([
      [1, { x: 2, y: 3 }],
      [2, { x: 4, y: 7 }],
    ]);
    const elements = [{ nodeI: 1, nodeJ: 2 }];

    const positions = buildProxyPositions(elements, (id) => nodes.get(id), true);

    // Projected: (x, y) → (x, 0, y). Proxy must match.
    expect(positions).toEqual([2, 0, 3, 4, 0, 7]);
  });

  it('uses raw 3D coordinates when project2DToXZ is false', () => {
    const nodes = new Map([
      [1, { x: 1, y: 2, z: 3 }],
      [2, { x: 4, y: 5, z: 6 }],
    ]);
    const elements = [{ nodeI: 1, nodeJ: 2 }];

    const positions = buildProxyPositions(elements, (id) => nodes.get(id), false);

    expect(positions).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('treats missing z as 0 when not projecting', () => {
    const nodes = new Map([
      [1, { x: 1, y: 2 }],
      [2, { x: 3, y: 4 }],
    ]);
    const elements = [{ nodeI: 1, nodeJ: 2 }];

    const positions = buildProxyPositions(elements, (id) => nodes.get(id), false);

    expect(positions).toEqual([1, 2, 0, 3, 4, 0]);
  });

  it('skips elements whose endpoint nodes are missing', () => {
    const nodes = new Map([[1, { x: 1, y: 2 }]]);
    const elements = [
      { nodeI: 1, nodeJ: 99 }, // nodeJ missing
      { nodeI: 1, nodeJ: 1 },  // both present (degenerate, but valid)
    ];

    const positions = buildProxyPositions(elements, (id) => nodes.get(id), false);

    expect(positions).toEqual([1, 2, 0, 1, 2, 0]);
  });
});
