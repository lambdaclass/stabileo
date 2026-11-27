import { describe, expect, it, vi } from 'vitest';
import { buildFromSpec } from '../exercise-spec';

function api() {
  let n = 0;
  return {
    addNode: vi.fn(() => ++n), addElement: vi.fn(() => ++n), addSupport: vi.fn(), addNodalLoad: vi.fn(),
    addDistributedLoad: vi.fn(), addHinge: vi.fn(),
  };
}

describe('building an exercise on the canvas', () => {
  it('applies a hinge listed twice once, and none on a truss bar', () => {
    const a = api();
    buildFromSpec({
      nodes: [[0, 0], [4, 0], [8, 0]], elements: [[0, 1], [1, 2]], truss: [1],
      supports: [{ node: 0, type: 'pinned' }, { node: 2, type: 'rollerX' }],
      hinges: [{ element: 0, end: 'end' }, { element: 0, end: 'end' }, { element: 1, end: 'start' }],
    }, a);
    expect(a.addHinge).toHaveBeenCalledTimes(1);
    expect(a.addHinge).toHaveBeenCalledWith(a.addElement.mock.results[0]!.value, 'end');
  });
});
