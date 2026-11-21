/**
 * The design run reports what happened, family by family. Split from
 * design-families.test.ts so it runs on its own worker — see design-families-fixture.ts.
 */

import { describe, it, expect } from 'vitest';
import { designRunStore } from '../../store/design-run.svelte';
import { verificationStore } from '../../store/verification.svelte';
import { DESIGN_FAMILIES, totalsOf } from '../../engine/design/design-families';
import { ready, familyOf } from './design-families-fixture';
import { ROLLED_BEAMS } from '../../engine/detailing/__tests__/helpers/workspace-scene';

// ─── The report ──────────────────────────────────────────────────

describe('the run reports what happened, family by family', () => {
  it('counts processed, designed, refused and not-modelled members', async () => {
    await ready('pro-edificio-7p', ROLLED_BEAMS);
    const report = designRunStore.designFamilies(['column', 'beam', 'slab', 'wall'], { maxRunMs: 180_000 });
    expect(verificationStore.runSummary?.aborted).toBe(false);

    // The corrected shell drilling term removes the committed building's spurious
    // biaxial refusals. Roll five beams to exercise real secondary-axis refusals.
    const beams = familyOf(report, 'beam');
    expect(beams.processed).toBeGreaterThan(100);
    expect(beams.refused, 'refusals are counted, not swallowed').toBeGreaterThan(0);
    const outcomes = [...(verificationStore.runSummary?.outcomes ?? [])]
      .filter(([, outcome]) => outcome.elementType === 'beam');
    const onTheCage = outcomes.filter(([, o]) => o.outcome !== 'VERIFIED' && o.outcome !== 'PROVISIONAL_BIAXIAL'
      && o.limiting.some(l => l === 'congestion' || l === 'anchorage'));
    const provisional = outcomes.filter(([, o]) => o.outcome === 'PROVISIONAL_BIAXIAL');
    expect(onTheCage).toHaveLength(96);
    expect(provisional).toHaveLength(3);
    for (const [id] of provisional) expect(ROLLED_BEAMS.rollBeams.ids).toContain(id);
    expect(beams).toMatchObject({ processed: 168, refused: 109, designed: 59, notModelled: 0 });
    expect(beams.designed, 'and the beams that DID design are counted too').toBe(beams.processed - beams.refused - beams.notModelled);
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
