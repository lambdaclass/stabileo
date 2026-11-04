/**
 * A temperature gradient on a plane member acts across the depth the section bends over in the
 * plane (#407): h when the section is upright or turned half round, b when turned a quarter, and
 * none (the engine's equivalent rectangle, with its warning) at any other angle.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { buildSolverInput2D } from '../solver-service';

beforeEach(() => { modelStore.clear(); });

function depthAt(rotation: number): number | undefined {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed');
  const sid = modelStore.addSection({ name: 'R', a: 0.02, iz: 1e-4, iy: 2e-5, h: 0.4, b: 0.15, rotation } as never);
  modelStore.updateElement(e, { sectionId: sid });
  modelStore.addLoadEntry({ type: 'thermal', data: { id: 0, elementId: e, dtUniform: 0, dtGradient: 20 } });
  const input = buildSolverInput2D(modelStore.model as never)!;
  const t = input.loads.find((l) => l.type === 'thermal')!;
  return (t.data as { depth?: number }).depth;
}

describe('a gradient on a plane member turned in its plane', () => {
  it.each([[0, 0.4], [180, 0.4], [-180, 0.4], [90, 0.15], [270, 0.15], [-90, 0.15]])('at %s° acts across %s m', (rot, d) => {
    expect(depthAt(rot)).toBeCloseTo(d, 12);
  });

  it('at another angle states no depth (the engine keeps its rectangle and says so)', () => {
    expect(depthAt(30)).toBeUndefined();
  });
});
