/**
 * Running the design command twice does not duplicate steel. Split from
 * design-families.test.ts so it runs on its own worker — see design-families-fixture.ts.
 */

import { describe, it, expect } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { ready, designFamiliesThenTurn } from './design-families-fixture';

describe('the global command is the individual commands', () => {
  it('running it twice does not duplicate steel', async () => {
    await ready('pro-edificio-7p');
    // Two runs of ~20 s each, with a turn between them: back to back they were one 43 s
    // synchronous stretch, past the worker's 60 s RPC budget on a CI runner.
    await designFamiliesThenTurn(['column', 'beam', 'slab', 'wall']);
    const first = (modelStore.model.detailing?.assemblies ?? []).flatMap((a) => a.bars);
    await designFamiliesThenTurn(['column', 'beam', 'slab', 'wall']);
    const second = (modelStore.model.detailing?.assemblies ?? []).flatMap((a) => a.bars);

    expect(second.length).toBe(first.length);
    // Ids are stable, so a repeat cannot append a second copy under new names either.
    expect(second.map((b) => b.id).sort()).toEqual(first.map((b) => b.id).sort());
  }, 600_000);
});

