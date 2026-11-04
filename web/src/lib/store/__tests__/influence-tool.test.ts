import { describe, it, expect } from 'vitest';
import { influenceTool } from '../influence-tool.svelte';

describe('the influence-line tool inputs', () => {
  it('a change of loads or placement drops the envelope drawn from the old ones', () => {
    const env = { quantity: 'M' as const, members: [], globalMax: 1 };
    influenceTool.envelope = env;
    influenceTool.setLoads({ q: 7 });
    expect(influenceTool.loads).toEqual({ g: 10, q: 7, P: 0 });
    expect(influenceTool.envelope).toBeNull();
    influenceTool.envelope = env;
    influenceTool.placement = 'spans';
    expect(influenceTool.placement).toBe('spans');
    expect(influenceTool.envelope).toBeNull();
  });
});
