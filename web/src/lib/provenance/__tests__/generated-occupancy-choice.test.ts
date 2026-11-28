import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { stampSolve } from '../solve-stamp';
import { RESULTS_VERSION } from '../registry';

it('known wrong result: #1928 reopened load bases recognize only the fallback rows for the recorded use', () => {
  const check = (use: string, row: string, expected: boolean) => {
    const derivation = [{ key: 'loadPlan.derivation.' + use, params: { occupancy: { key: row } } }];
    const snapshot = { designData: { loadBasis: { derivation, resultsVersion: RESULTS_VERSION } } };
    for (const mode of ['2d', '3d', 'pro']) for (const analysis of ['linear', 'pdelta', 'plastic'] as const) {
      expect.soft(assessProject(snapshot, stampSolve(analysis, null), mode).changes.some(c => c.id === 'generated-occupancy-choice')).toBe(expected);
    }
  };
  for (const [floor, roof] of [
    ['loads.occupancy.archivos', 'loads.occupancy.azotea_publica'],
    ['loads.asce7.occ.accessOffice', 'loads.asce7.occ.roofAssembly'],
    ['loads.tr.occ.tr_attic_rooms', 'loads.tr.occ.tr_roof_occasional'],
    ['loads.ec.occ.uk_A1', 'loads.ec.occ.uk_A1'],
    ['loads.ec.occ.A_floor', 'loads.ec.occ.A_floor'],
  ] as const) {
    check('occupancy', floor, true);
    check('roofOccupancyCode', roof, true);
    if (roof !== floor) check('roofOccupancy', floor, false);
  }
  check('occupancyCode', 'loads.occupancy.vivienda', false);
  check('dead', 'loads.occupancy.archivos', false);
});

it('retains a manual case review only for an unreviewed first row or a qualifying TS 498 column reduction', async () => {
  const { needsManualOccupancyReview } = await import('../occupancy-selection');
  const saved = { ratio: 0.98, floorsSupported: 4, elementKind: 'interiorColumn', occupancyKey: 'tr_office' };
  const review = (changes: Partial<typeof saved> & { occupancyReviewed?: boolean } = {}) => needsManualOccupancyReview('ts498-1997-loads', 'L', { ...saved, ...changes });
  expect(review()).toBe(true);
  for (const change of [{ floorsSupported: 3 }, { elementKind: 'interiorBeam' }, { occupancyKey: 'tr_shop_small' }, { ratio: 1 }, { occupancyReviewed: true }]) expect(review(change)).toBe(false);
  for (const [adapter, key] of [['cirsoc101-2025-loads', 'archivos'], ['asce7-22-loads', 'accessOffice'], ['en1991-1-1', 'ec-A-floor'], ['en1991-1-1-uk', 'uk-A1'], ['ts498-1997-loads', 'tr_attic_rooms']]) {
    expect(needsManualOccupancyReview(adapter!, 'L', { ratio: 1, occupancyKey: key })).toBe(true);
    expect(needsManualOccupancyReview(adapter!, 'D', { ratio: 1, occupancyKey: key })).toBe(false);
    expect(needsManualOccupancyReview(adapter!, 'L', { ratio: 1, occupancyKey: key, occupancyReviewed: true })).toBe(false);
  }
});
