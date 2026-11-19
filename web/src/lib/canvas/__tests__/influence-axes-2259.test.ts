import { afterEach, expect, it, vi } from 'vitest';
import { axesStore } from '../../axes/axes.svelte';
import { allChoices, makeFrame, plane2D, planeSigns } from '../../axes/frame';
import { inspectMember, inspectNode } from '../draw-despiece';
import { ilShown } from '../../axes/user-names';
import { influenceTool } from '../../store/influence-tool.svelte';
import { drawInfluenceLine } from '../draw-influence';
import { drawIlEnvelope } from '../draw-il-envelope';

vi.mock('../draw-il-envelope', () => ({ drawIlEnvelope: vi.fn() }));
afterEach(() => { axesStore.reset(); influenceTool.envelope = null; vi.clearAllMocks(); });

it('known wrong result: #1986 influence envelopes negate and exchange bounds with their response', () => {
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

it('known wrong result: #1986 T108 end actions agree between member and node inspection', () => {
  const args: Omit<Parameters<typeof inspectMember>[0], 'basis'> = {
    elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
    getNode: (id: number) => ({ x: id - 1, y: 0 }),
    getElementForces: () => ({ elementId: 1, nStart: 0, nEnd: 0, vStart: 0, vEnd: 0, mStart: 10, mEnd: 5 }),
  };
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const p = planeSigns(makeFrame(choice));
    const global = { ...args, basis: 'global' } as const;
    const local = { ...args, basis: 'local' } as const;
    expect(inspectMember(global, 1)?.ends.map(e => e.components[2])).toEqual([
      { label: `M${plane2D(makeFrame(choice)).normal.name.toLowerCase()}`, value: p.sr * 10 },
      { label: `M${plane2D(makeFrame(choice)).normal.name.toLowerCase()}`, value: p.sr * 5 },
    ]);
    expect(inspectNode(global, 1).actions[0]?.components[2]?.value).toBe(p.sr * 10);
    expect(inspectNode(local, 1).actions[0]?.components[2]).toEqual({ label: 'M', value: 10 });
  }
});

it.skip('known wrong result: #1986 each influence envelope uses its own quantity for bounds and title', () => {
  const fillText = vi.fn();
  const ctx = new Proxy({}, { get: (_, key) => key === 'fillText' ? fillText : () => {}, set: () => true }) as CanvasRenderingContext2D;
  const dc = { ctx, worldToScreen: (x: number, y: number) => ({ x, y }), getNode: () => undefined, getElement: () => undefined };
  const bounds = { elementId: 1, t: [0, 1], max: [0, 9], min: [-2, -3] };
  for (const choice of allChoices()) for (const quantity of ['N', 'V', 'M'] as const) {
    axesStore.choice = choice;
    const env = { quantity, globalMax: 9, members: [bounds] };
    influenceTool.envelope = env;
    drawInfluenceLine({ quantity: 'Rz', targetNodeId: 1, points: [{ elementId: 1, t: 0, x: 0, y: 0, value: 1 }] }, dc, 1);
    const expected = ilShown(quantity).sign < 0 ? { ...bounds, max: [2, 3], min: [0, -9] } : bounds;
    expect(fillText.mock.lastCall?.[0]).toContain(quantity);
    expect(vi.mocked(drawIlEnvelope).mock.lastCall?.[0]).toEqual({ ...env, members: [expected] });
    expect(env.members[0]!.max).toEqual([0, 9]);
  }
});
