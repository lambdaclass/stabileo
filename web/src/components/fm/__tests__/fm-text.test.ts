import { describe, it, expect } from 'vitest';
import { releaseLabel, redundantText } from '../fm-text';
import { delta0Tex } from '../fm-formulas';
import type { Geometry } from '../../../lib/engine/force-method/solve';
import type { ReleaseOption } from '../../../lib/engine/force-method/releases';

const g = (angle?: number): Geometry => ({
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4, z: 0 }],
  elements: [{ id: 1, nodeI: 1, nodeJ: 2, type: 'frame', hingeStart: false, hingeEnd: false }],
  supports: [{ nodeId: 1, restrained: [true, true, true], spring: false }, { nodeId: 2, restrained: [false, true, false], spring: false, ...(angle !== undefined ? { angle } : {}) }],
});
const opt: ReleaseOption = { key: 'r:2:1', group: 'reaction', kind: 'reaction', nodeId: 2, component: 1, count: 1 };

describe('the release a reader picks is named as the redundant it becomes', () => {
  it('on an inclined roller both say the reaction normal to the surface; on a level one, the global one', () => {
    for (const angle of [undefined, 0.5]) {
      expect(releaseLabel(opt, g(angle))).toBe(redundantText({ kind: 'reaction', nodeId: 2, component: 1 } as never, g(angle)));
    }
    expect(releaseLabel(opt, g(0.5))).not.toBe(releaseLabel(opt, g()));
  });
});

describe('the δᵢ₀ formula shown', () => {
  it('subtracts the gradient term, as the coefficient is computed: a hotter top face curves against a positive m', () => {
    const r = { delta0Terms: [[{ elementId: 1, source: 'thermal', value: 1 }]] } as never;
    expect(delta0Tex(r)).toContain('- \\sum \\int m_i\\,\\frac{\\alpha\\,\\Delta t}{h}');
  });
});
