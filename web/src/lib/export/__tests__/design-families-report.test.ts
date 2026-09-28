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

    // 5 of this building's 119 beams are refused by the secondary-axis refusal. It was 117
    // while the fixture's transposed iy/iz went straight to the solver; the canonical-section
    // work that arrived with the merge derives them from geometry instead, which removed the
    // spurious secondary moments. See beam-reinforcement-audit.test.ts for the full account.
    // A refusal is a design outcome either way, and the report must say so rather than
    // presenting a silent zero.
    const beams = familyOf(report, 'beam');
    expect(beams.processed).toBeGreaterThan(100);
    expect(beams.refused, 'refusals are counted, not swallowed').toBe(5);
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
