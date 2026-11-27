/**
 * Running the design command twice does not duplicate steel. Split from
 * design-families.test.ts so it runs on its own worker — see design-families-fixture.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { ready, designFamiliesWithWorkerYields } from './design-families-fixture';

describe('the global command is the individual commands', () => {
  it('running it twice does not duplicate steel', async () => {
    await ready('pro-edificio-7p');
    let elapsed = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => ++elapsed);
    try {
      // Two runs of ~20 s each, with a turn between them: back to back they were one 43 s
      // synchronous stretch, past the worker's 60 s RPC budget on a CI runner.
      expect((await designFamiliesWithWorkerYields(['column', 'beam', 'slab', 'wall'])).ok).toBe(true);
      const first = (modelStore.model.detailing?.assemblies ?? []).flatMap((a) => a.bars);
      expect((await designFamiliesWithWorkerYields(['column', 'beam', 'slab', 'wall'])).ok).toBe(true);
      const second = (modelStore.model.detailing?.assemblies ?? []).flatMap((a) => a.bars);

      expect(first.length).toBeGreaterThan(0);
      expect(second.length).toBe(first.length);
      // Ids are stable, so a repeat cannot append a second copy under new names either.
      expect(second.map((b) => b.id).sort()).toEqual(first.map((b) => b.id).sort());
    } finally { clock.mockRestore(); }
  }, 600_000);
});

