/**
 * The global design command and the individual buttons reach the same steel: the
 * rule that stops two implementations drifting. Split from design-families.test.ts
 * so it runs on its own worker — see design-families-fixture.ts.
 */

import { describe, it, expect } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { designRunStore } from '../../store/design-run.svelte';
import { ready, familiesWithSteel } from './design-families-fixture';

// ─── Equivalence and idempotence ─────────────────────────────────

describe('the global command is the individual commands', () => {
  it('reaches the same steel as running each pass by hand', async () => {
    /**
     * The rule that stops two implementations drifting. The global path calls `autoDesign`,
     * `generate` and `generateFloors` — the same functions the individual buttons call — so
     * the two must land on the same families with the same bar counts.
     */
    await ready('pro-edificio-7p');
    designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']);
    const viaGlobal = (modelStore.model.detailing?.assemblies ?? [])
      .flatMap((a) => a.bars).length;
    const globalFamilies = [...familiesWithSteel()].sort();

    await ready('pro-edificio-7p');
    designRunStore.designAll();
    detailingStore.generate({ verifierId: 'cirsoc201.provided.v2.2025' });
    detailingStore.generateFloors({ verifierId: 'cirsoc201.provided.v2.2025', families: ['slab', 'wall'] });
    const viaButtons = (modelStore.model.detailing?.assemblies ?? [])
      .flatMap((a) => a.bars).length;

    expect(globalFamilies).toEqual([...familiesWithSteel()].sort());
    expect(viaGlobal).toBe(viaButtons);
  }, 600_000);
});
