import { expect, it } from 'vitest';
import { modelStore, type Load } from '../../store/model.svelte';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { fingerprintDifference, modelFingerprint, reset } from '../legacy';

const loads: Load[] = [
  { type: 'distributed', data: { id: 1, elementId: 1, caseId: 1, qI: -1, qJ: -2 } },
  { type: 'distributed3d', data: { id: 1, elementId: 1, caseId: 1, qYI: 0, qYJ: 0, qZI: -1, qZJ: -2 } },
  { type: 'surface3d', data: { id: 1, quadId: 1, caseId: 1, q: -1 } },
];

for (const mode of ['2d', '3d', 'pro'] as const) for (const load of loads) {
  it(`known wrong result: #2219 ${mode}/${load.type} provenance stamps preserve the physical fingerprint`, () => {
    reset(mode);
    modelStore.replaceLoads([structuredClone(load)]);
    const before = modelFingerprint();
    const current = RESULT_CHANGES.currentResultsVersion;
    const versions = [undefined, 0, current - 1, current, current + 1];
    const stamped = (memberLoadsVersion: number | undefined, floorLoadsVersion: number | undefined): Load => {
      const result = structuredClone(load);
      Object.assign(result.data, { memberLoadsVersion, floorLoadsVersion });
      return result;
    };
    for (const memberVersion of versions) for (const floorVersion of versions) {
      modelStore.replaceLoads([stamped(memberVersion, floorVersion)]);
      expect.soft(modelFingerprint(), `${memberVersion}/${floorVersion}`).toEqual(before);
      expect.soft(fingerprintDifference('same physical load', before, modelFingerprint())).toBeNull();
      expect.soft(fingerprintDifference('same physical load reversed', modelFingerprint(), before)).toBeNull();
    }
    const restored = stamped(current, current);
    for (const [field, value] of Object.entries(load.data)) {
      if (field === 'id' || typeof value !== 'number') continue;
      for (const delta of [-1, 1]) {
        const changed = structuredClone(restored);
        Object.assign(changed.data, { [field]: value + delta });
        modelStore.replaceLoads([changed]);
        expect(fingerprintDifference(`changed ${field}`, before, modelFingerprint())).not.toBeNull();
        expect(fingerprintDifference(`changed ${field} reversed`, modelFingerprint(), before)).not.toBeNull();
      }
    }
    modelStore.replaceLoads([structuredClone(load)]);
    expect(modelFingerprint()).toEqual(before);
  });
}
