/**
 * The design run reports what happened, family by family. Split from
 * design-families.test.ts so it runs on its own worker — see design-families-fixture.ts.
 */

import { describe, it, expect } from 'vitest';
import { designRunStore } from '../../store/design-run.svelte';
import { DESIGN_FAMILIES, totalsOf } from '../../engine/design/design-families';
import { ready, familyOf } from './design-families-fixture';
import { ROLLED_BEAMS } from '../../engine/detailing/__tests__/helpers/workspace-scene';

// ─── The report ──────────────────────────────────────────────────

describe('the run reports what happened, family by family', () => {
  it('counts processed, designed, refused and not-modelled members', async () => {
    await ready('pro-edificio-7p', ROLLED_BEAMS);
    const report = designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']);

    // The corrected shell drilling term removes the committed building's spurious
    // biaxial refusals. Roll five beams to exercise real secondary-axis refusals.
    const beams = familyOf(report, 'beam');
    expect(beams.processed).toBeGreaterThan(100);
    expect(beams.refused, 'refusals are counted, not swallowed').toBeGreaterThan(0);
    expect(beams.refused).toBeLessThanOrEqual(ROLLED_BEAMS.rollBeams.ids.length);
    expect(beams.designed, 'and the beams that DID design are counted too').toBeGreaterThan(100);
    expect(beams.designed + beams.refused + beams.notModelled).toBe(beams.processed);

    const totals = totalsOf(report);
    expect(totals.processed).toBeGreaterThan(beams.processed);
    expect(totals.refused).toBeGreaterThanOrEqual(beams.refused);
  }, 300_000);

  it('lists the families in selector order, whatever order they ran in', async () => {
    await ready('rc-qa-diagnostic');
    const report = designRunStore.designFamilies(['slab', 'column']);
    expect(report.families.map((f) => f.family)).toEqual([...DESIGN_FAMILIES]);
  }, 300_000);
});
