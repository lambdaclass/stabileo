import { afterEach, expect, it, vi } from 'vitest';
import { axesStore } from '../../axes/axes.svelte';
import { allChoices } from '../../axes/frame';
import { ilShown } from '../../axes/user-names';
import { influenceTool } from '../../store/influence-tool.svelte';
import { drawInfluenceLine } from '../draw-influence';
import { drawIlEnvelope } from '../draw-il-envelope';

vi.mock('../draw-il-envelope', () => ({ drawIlEnvelope: vi.fn() }));
afterEach(() => { axesStore.reset(); influenceTool.envelope = null; vi.clearAllMocks(); });

it.skip('known wrong result: #2259 influence envelopes negate and exchange bounds with their response', () => {
  const env = { quantity: 'N' as const, globalMax: 9, members: [{ elementId: 1, t: [0, 1], max: [0, 9], min: [-2, -3] }] };
  for (const c of allChoices()) for (const quantity of ['Rx', 'Rz', 'ry', 'N'] as const) {
    axesStore.choice = c;
    influenceTool.envelope = env;
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
    drawInfluenceLine({ quantity, points: [{ elementId: 1, t: 0, x: 0, y: 0, value: 1 }] } as never,
      { ctx, worldToScreen: (x, y) => ({ x, y }), getNode: () => undefined, getElement: () => undefined }, 1);
    const want = ilShown(quantity).sign < 0 ? { ...env, members: [{ ...env.members[0]!, max: [2, 3], min: [0, -9] }] } : env;
    expect(vi.mocked(drawIlEnvelope).mock.lastCall![0]).toEqual(want);
    expect(env.members[0]!.max).toEqual([0, 9]);
  }
});
