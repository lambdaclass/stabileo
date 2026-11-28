import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';

it('known wrong result: #1928 only saved zone loads generated from unavailable rows need review', () => {
  const applicable = (use: Record<string, unknown>, def: Record<string, unknown>) => {
    const snapshot: FeatureSnapshot = { groups: [
      [1, { kind: 'loadZone', data: { use } }],
      [2, { kind: 'floorLoad', data: def }],
    ] };
    return assessProject(snapshot, undefined, 'pro').changes.some(c => c.id === 'unpublished-zone-occupancies');
  };
  const foreign = { occupancy: 'ec-A-floor', provenance: 'confirmed' };
  const live = { fromZone: 1, role: 'live' };
  expect(applicable(foreign, live)).toBe(!__PUBLIC_FEATURES__.proPlatesUnified);
  expect(applicable(foreign, { fromZone: 1 })).toBe(!__PUBLIC_FEATURES__.proPlatesUnified);
  for (const use of [{ ...foreign, none: true }, { ...foreign, manualQ: 0 }, { ...foreign, provenance: 'suggested' }, { occupancy: 'vivienda' }]) {
    expect(applicable(use, live)).toBe(false);
  }
  for (const def of [{}, { fromZone: 7 }, { fromZone: 1, role: 'finish' }]) expect(applicable(foreign, def)).toBe(false);
});
