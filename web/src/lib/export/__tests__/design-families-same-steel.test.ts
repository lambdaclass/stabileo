/**
 * The global design command and the individual buttons reach the same steel: the
 * rule that stops two implementations drifting. Split from design-families.test.ts
 * so it runs on its own worker — see design-families-fixture.ts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { modelStore } from '../../store/model.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { designRunStore } from '../../store/design-run.svelte';
import { ready, familiesWithSteel } from './design-families-fixture';

// ─── Equivalence and idempotence ─────────────────────────────────

describe('the global command is the individual commands', () => {
  afterEach(() => { vi.restoreAllMocks(); });
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
    // Compare every bar's geometry and metadata without retaining a second large tree.
    // Assembly demand revisions advance on each solve, so they are not steel identity.
    const geometryHash = () => createHash('sha256').update(JSON.stringify(
      (modelStore.model.detailing?.assemblies ?? [])
        .map(({ id, bars }) => ({ id, bars })),
    )).digest('hex');
    const globalGeometry = geometryHash();

    await ready('pro-edificio-7p');
    const generate = vi.spyOn(detailingStore, 'generate');
    designRunStore.designAll();
    expect(generate).toHaveBeenCalledTimes(1);
    detailingStore.generate({ verifierId: 'cirsoc201.provided.v2.2025' });
    detailingStore.generateFloors({ verifierId: 'cirsoc201.provided.v2.2025', families: ['slab', 'wall'] });
    const viaButtons = (modelStore.model.detailing?.assemblies ?? [])
      .flatMap((a) => a.bars).length;

    expect(globalFamilies).toEqual([...familiesWithSteel()].sort());
    expect(viaGlobal).toBe(viaButtons);
    expect(geometryHash()).toBe(globalGeometry);
  }, 600_000);

  it('standalone auto-design still respects the project auto-detailing opt-out', async () => {
    await ready('rc-design-qa-8');
    detailingStore.setAutoGenerate(false);
    const generate = vi.spyOn(detailingStore, 'generate');
    expect(designRunStore.designAll().ok).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    expect(detailingStore.autoGenerate).toBe(false);
  }, 300_000);
});
