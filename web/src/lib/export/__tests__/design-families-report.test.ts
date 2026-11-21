/**
 * The design run reports what happened, family by family. Split from
 * design-families.test.ts so it runs on its own worker — see design-families-fixture.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import { DEFAULT_RUN_MS } from '../../engine/design/candidate-search';
import { designRunStore } from '../../store/design-run.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { verificationStore } from '../../store/verification.svelte';
import { DESIGN_FAMILIES, totalsOf, type DesignFamily } from '../../engine/design/design-families';
import { ready, familyOf, designFamiliesWithWorkerYields } from './design-families-fixture';
import { ROLLED_BEAMS } from '../../engine/detailing/__tests__/helpers/workspace-scene';

function designOutput() {
  const summary = verificationStore.runSummary;
  expect(summary).toMatchObject({ aborted: false, notReached: 0 });
  const doc = detailingStore.buildDocument({ author: 'test', at: '2026-10-11T00:00:00Z' });
  expect(doc).toBeTruthy();
  return {
    outcomes: [...summary!.outcomes.values()].map(({ elementId, outcome, accepted, provisional, limiting, reasons }) =>
      ({ elementId, outcome, accepted, provisional, limiting, reasons })),
    assemblies: doc!.assemblies.map(({ id, state, bars }) => ({ id, state, bars })),
  };
}

// ─── The report ──────────────────────────────────────────────────

describe('the run reports what happened, family by family', () => {
  it('handles a worker message between frame detailing and floor design', async () => {
    await ready('rc-qa-diagnostic');
    const { port1, port2 } = new MessageChannel();
    let received = false;
    let receivedBeforeFloors = false;
    port1.once('message', () => { received = true; });

    const generate = detailingStore.generate.bind(detailingStore);
    const generateFloors = detailingStore.generateFloors.bind(detailingStore);
    const frame = vi.spyOn(detailingStore, 'generate').mockImplementation((options) => {
      port2.postMessage('progress reply');
      return generate(options);
    });
    const floors = vi.spyOn(detailingStore, 'generateFloors').mockImplementation((options) => {
      receivedBeforeFloors = received;
      return generateFloors(options);
    });

    try {
      await designFamiliesWithWorkerYields(['column', 'beam']);
      await designFamiliesWithWorkerYields(['slab']);
      expect(frame).toHaveBeenCalledTimes(1);
      expect(floors).toHaveBeenCalledTimes(1);
      expect(receivedBeforeFloors).toBe(true);
    } finally {
      frame.mockRestore();
      floors.mockRestore();
      port1.close();
      port2.close();
    }
  }, 300_000);

  it('#2338: concurrent worker scheduling preserves the full design and detailing', async () => {
    const frame: DesignFamily[] = ['column', 'beam'];
    const floors: DesignFamily[] = ['slab'];
    await ready('rc-qa-diagnostic-shells');
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { port1, port2 } = new MessageChannel();

    try {
      const synchronous = designRunStore.designFamilies([...frame, ...floors]);
      expect(synchronous.ok).toBe(true);
      expect(familyOf(synchronous, 'beam').designed).toBeGreaterThan(0);
      expect(familyOf(synchronous, 'slab').processed).toBeGreaterThan(0);
      const expected = designOutput();

      await ready('rc-qa-diagnostic-shells');
      let posted = false;
      let received = false;
      port1.once('message', () => {
        received = true;
        clock.mockReturnValue(DEFAULT_RUN_MS + 1);
      });

      const adapter = designRunStore.currentAdapter()!;
      const verify = adapter.verify.bind(adapter);
      const verifier = vi.spyOn(adapter, 'verify').mockImplementation((context, rebar) => {
        if (!posted && designRunStore.phase === 'autoDesign') {
          port2.postMessage('progress reply');
          posted = true;
        }
        return verify(context, rebar);
      });

      try {
        const frameReport = await designFamiliesWithWorkerYields(frame);
        expect(received).toBe(true);
        const floorReport = await designFamiliesWithWorkerYields(floors);
        expect(designOutput()).toEqual(expected);
        expect(frameReport.ok).toBe(synchronous.ok);
        expect(floorReport.ok).toBe(synchronous.ok);
        for (const family of frame) expect(familyOf(frameReport, family)).toEqual(familyOf(synchronous, family));
        for (const family of floors) expect(familyOf(floorReport, family)).toEqual(familyOf(synchronous, family));
      } finally {
        verifier.mockRestore();
      }
    } finally {
      clock.mockRestore();
      port1.close();
      port2.close();
    }
  }, 300_000);

  it('counts processed, designed, refused and not-modelled members', async () => {
    await ready('pro-edificio-7p', ROLLED_BEAMS);
    const report = await designFamiliesWithWorkerYields(['column', 'beam', 'slab', 'wall']);

    // The corrected shell drilling term removes the committed building's spurious
    // biaxial refusals. Roll five beams to exercise real secondary-axis refusals.
    const beams = familyOf(report, 'beam');
    expect(beams.processed).toBeGreaterThan(100);
    expect(beams.refused, 'refusals are counted, not swallowed').toBeGreaterThan(0);
    // The rolled beams' biaxial refusals, and since the design reads the column cages the beams
    // no layout of whose bars passes the 35 cm columns' bars, or anchors in them where one does:
    // refused on congestion or anchorage (41 of the building's 119, rolled or not). Before:
    // refused ≤ 5, the rolled ones; after: those and the 41, each counted.
    const onTheCage = [...(verificationStore.runSummary?.outcomes.values() ?? [])]
      .filter((o) => o.elementType === 'beam' && o.outcome !== 'VERIFIED' && o.outcome !== 'PROVISIONAL_BIAXIAL'
        && o.limiting.some((l) => l === 'congestion' || l === 'anchorage')).length;
    expect(onTheCage).toBe(41);
    expect(beams.refused - onTheCage).toBeLessThanOrEqual(ROLLED_BEAMS.rollBeams.ids.length);
    // 73 of 119 design (before: more than 100): the 41 refused on the cages and the rolled ones.
    expect(beams.designed, 'and the beams that DID design are counted too').toBe(beams.processed - beams.refused - beams.notModelled);
    expect(beams.designed).toBe(73);
    expect(beams.designed + beams.refused + beams.notModelled).toBe(beams.processed);

    const totals = totalsOf(report);
    expect(totals.processed).toBeGreaterThan(beams.processed);
    expect(totals.refused).toBeGreaterThanOrEqual(beams.refused);
  }, 300_000);

  it('lists the families in selector order, whatever order they ran in', async () => {
    await ready('rc-qa-diagnostic');
    const report = await designFamiliesWithWorkerYields(['slab', 'column']);
    expect(report.families.map((f) => f.family)).toEqual([...DESIGN_FAMILIES]);
  }, 300_000);
});
