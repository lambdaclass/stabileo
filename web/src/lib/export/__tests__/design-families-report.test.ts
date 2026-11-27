/**
 * The design run reports what happened, family by family. Split from
 * design-families.test.ts so it runs on its own worker — see design-families-fixture.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import { DEFAULT_RUN_MS } from '../../engine/design/candidate-search';
import type { FamilyCertificate, FamilyRevisionVector, FloorFamilyDesignRecord } from '../../engine/detailing/family-record';
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
  const demandRevision = verificationStore.demandRevision;
  const relativeRevisions = (revisions: FamilyRevisionVector) => ({
    ...revisions, entity: revisions.entity - demandRevision,
  });
  const normalizeCertificate = (certificate: FamilyCertificate) => ({
    ...certificate, revisions: relativeRevisions(certificate.revisions),
  });
  const normalizeRecord = (record: FloorFamilyDesignRecord) => ({
    ...record,
    revisions: relativeRevisions(record.revisions),
    certificate: normalizeCertificate(record.certificate),
  });
  return {
    outcomes: [...summary!.outcomes.values()].map(({ elementId, outcome, accepted, provisional, limiting, reasons }) =>
      ({ elementId, outcome, accepted, provisional, limiting, reasons })),
    assemblies: doc!.assemblies.map((assembly) => ({
      ...assembly,
      families: assembly.families.map(normalizeRecord),
      familyCertificates: assembly.familyCertificates.map((entry) => ({
        ...entry, certificate: normalizeCertificate(entry.certificate),
      })),
      source: {
        ...assembly.source,
        demandRevision: assembly.source.demandRevision - demandRevision,
        ...(assembly.source.families && { families: assembly.source.families.map(normalizeRecord) }),
        ...(assembly.source.familyCertificates && {
          familyCertificates: assembly.source.familyCertificates.map(normalizeCertificate),
        }),
      },
    })),
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

  it('handles a worker reply between frame search and detailing', async () => {
    await ready('rc-qa-diagnostic');
    const { port1, port2 } = new MessageChannel();
    let replyPosted = false;
    let replyReceived = false;
    let receivedAtDetailing = false;
    port1.once('message', () => { replyReceived = true; });

    const adapter = designRunStore.currentAdapter()!;
    const verify = adapter.verify.bind(adapter);
    const verifier = vi.spyOn(adapter, 'verify').mockImplementation((context, rebar) => {
      if (!replyPosted && designRunStore.phase === 'autoDesign') {
        port2.postMessage('progress reply');
        replyPosted = true;
      }
      return verify(context, rebar);
    });
    const generate = detailingStore.generate.bind(detailingStore);
    const detail = vi.spyOn(detailingStore, 'generate').mockImplementation((options) => {
      receivedAtDetailing = replyReceived;
      return generate(options);
    });

    try {
      const report = await designFamiliesWithWorkerYields(['column', 'beam']);
      expect(report.ok).toBe(true);
      expect(replyPosted).toBe(true);
      expect(detail).toHaveBeenCalledTimes(1);
      expect(receivedAtDetailing).toBe(true);
    } finally {
      detail.mockRestore();
      verifier.mockRestore();
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
        expect(designOutput()).toStrictEqual(expected);
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
    const report = await designFamiliesWithWorkerYields(['column', 'beam', 'slab', 'wall'], { maxRunMs: 180_000 });
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
    expect(onTheCage).toHaveLength(104);
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
    const report = await designFamiliesWithWorkerYields(['slab', 'column']);
    expect(report.families.map((f) => f.family)).toEqual([...DESIGN_FAMILIES]);
  }, 300_000);
});
