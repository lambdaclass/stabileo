/**
 * The design run reports what happened, family by family. Split from
 * design-families.test.ts so it runs on its own worker — see design-families-fixture.ts.
 */

import { describe, it, expect } from 'vitest';
import { designRunStore } from '../../store/design-run.svelte';
import { DESIGN_FAMILIES, totalsOf } from '../../engine/design/design-families';
import { ready, familyOf } from './design-families-fixture';

// ─── The report ──────────────────────────────────────────────────

describe('the run reports what happened, family by family', () => {
  it('counts processed, designed, refused and not-modelled members', async () => {
    await ready('pro-edificio-7p');
    const report = designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']);

    // None of this building's 119 beams is refused since self-weight became a member load:
    // it bends them about their strong axis, and the five that the secondary-axis refusal held
    // back fell under its threshold. See beam-reinforcement-audit.test.ts for the account.
    const beams = familyOf(report, 'beam');
    expect(beams.processed).toBeGreaterThan(100);
    expect(beams.refused).toBe(0);
    expect(beams.designed, 'and the beams that DID design are counted too').toBeGreaterThan(100);
    expect(beams.designed + beams.refused + beams.notModelled).toBe(beams.processed);

    const totals = totalsOf(report);
    expect(totals.processed).toBeGreaterThan(beams.processed);
    expect(totals.refused).toBeGreaterThanOrEqual(beams.refused);

    // A refusal is a design outcome, and the report must say so rather than presenting a
    // silent zero. The 408-member frame still has 13, from its wind.
    await ready('rc-design-frame');
    const frame = familyOf(designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']), 'beam');
    expect(frame.refused, 'refusals are counted, not swallowed').toBe(13);
    expect(frame.designed + frame.refused + frame.notModelled).toBe(frame.processed);
  }, 300_000);

  it('lists the families in selector order, whatever order they ran in', async () => {
    await ready('rc-qa-diagnostic');
    const report = designRunStore.designFamilies(['slab', 'column']);
    expect(report.families.map((f) => f.family)).toEqual([...DESIGN_FAMILIES]);
  }, 300_000);
});
