import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import { applyGrowth, designChecksPass, plannedGrowth, rectSection } from '../design-resize';
import type { DeskReport } from '../design-desk';
import type { MemberContext } from '../../engine/design/member-context';
import type { MemberDesignOutcome } from '../../engine/design/outcome';

afterEach(() => vi.restoreAllMocks());

function passingReport(): DeskReport {
  return {
    concrete: { ok: true, selection: ['beam', 'column'],
      families: [{ family: 'beam', state: 'designed', processed: 1, designed: 1, refused: 0, notModelled: 0 }] },
    steel: null, skipped: { locked: 0, edited: 0 },
    levels: [{ name: 'P1', z: 3, counts: { ok: 1, warn: 0, fail: 0, provisional: 0, unavailable: 0, stale: 0 },
      steelOk: 0, failing: [], unchecked: [], stale: [] }],
  };
}

describe('a sizing run is verified only when its final checks pass', () => {
  it('accepts checked members, including nonblocking warnings', () => {
    const report = passingReport();
    expect(designChecksPass(report)).toBe(true);
    report.levels[0].counts = { ...report.levels[0].counts, ok: 0, warn: 1 };
    expect(designChecksPass(report)).toBe(true);
  });

  it.each(['fail', 'provisional', 'unavailable', 'stale'] as const)('does not hide %s behind no resize proposal', status => {
    const report = passingReport();
    report.levels[0].counts[status] = 1;
    expect(designChecksPass(report)).toBe(false);
  });

  it('does not certify an empty, refused, incomplete or failed run', () => {
    const empty = passingReport(); empty.levels = [];
    const refused = passingReport(); refused.concrete!.families[0].refused = 1;
    const partial = passingReport(); partial.concrete!.families[0].processed = 2;
    const failed = passingReport(); failed.concrete!.ok = false;
    const noBars = passingReport(); noBars.concrete!.families[0].notModelled = 1;
    for (const report of [empty, refused, partial, failed, noBars]) expect(designChecksPass(report)).toBe(false);
  });
});

describe('section growth needs an evaluated failure and never shrinks a dimension', () => {
  it.each(['searchBudget', 'memberOrientationSuspect'])('does not enlarge for %s', limiting => {
    modelStore.clear();
    // The early exit must precede any mutation or dependence on a model element.
    vi.spyOn(verificationStore, 'contexts', 'get').mockReturnValue(new Map([[1, { elementId: 1, elementType: 'column' } as MemberContext]]));
    vi.spyOn(verificationStore, 'outcomeFor').mockReturnValue({ outcome: 'SEARCH_EXHAUSTED', limiting: [limiting] } as MemberDesignOutcome);
    expect(plannedGrowth()).toEqual([]);
  });

  it('preserves a dimension above the cap and the precision of an unchanged dimension', () => {
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    const elementId = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(elementId, { sectionId: rectSection(1.234, 0.333) });
    const change = applyGrowth([{ elementIds: [elementId], member: 'C1', kind: 'column', db: 0.05, dh: 0.05, reason: 'column' }], 1);
    expect(change[0].to).toEqual({ b: 1.234, h: 0.38 });
    const section = modelStore.sections.get(modelStore.elements.get(elementId)!.sectionId)!;
    expect(section.b).toBe(1.234);
    expect(section.h).toBe(0.38);
    modelStore.updateElement(elementId, { sectionId: rectSection(0.333, 0.4) });
    applyGrowth([{ elementIds: [elementId], member: 'C1', kind: 'column', db: 0, dh: 0.05, reason: 'column' }], 2);
    expect(modelStore.sections.get(modelStore.elements.get(elementId)!.sectionId)!.b).toBe(0.333);
  });
});
