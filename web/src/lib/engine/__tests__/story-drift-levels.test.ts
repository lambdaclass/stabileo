import { describe, it, expect } from 'vitest';
import { storyDrifts } from '../story-drift';

describe('stories named by the model\'s levels', () => {
  it('a story whose tops sit at a grid level carries its name', () => {
    const nodes = new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 0, y: 0, z: 3 }]]);
    const r = storyDrifts(nodes, [{ id: 1, nodeI: 1, nodeJ: 2 }],
      [{ nodeId: 1, ux: 0, uy: 0, uz: 0 }, { nodeId: 2, ux: 0.003, uy: 0, uz: 0 }],
      { limit: 0.02, levels: [{ name: 'Planta 1', z: 3 }] });
    expect(r[0]).toMatchObject({ level: 3, levelName: 'Planta 1' });
  });
});
