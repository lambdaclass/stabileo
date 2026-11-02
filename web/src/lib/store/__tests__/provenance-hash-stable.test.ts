import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore, uiStore } from '..';
import { regulationsStore } from '../regulations.svelte';
import { serializeProject, deserializeProject } from '../file';
import { patchDesignData } from '../design-data';
import { modelHash } from '../../provenance/result-provenance';

function frame(): void {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  modelStore.addElement(a, b);
  modelStore.addSupport(a, 'fixed3d' as never);
}

describe('a model fingerprint a report can be checked against', () => {
  beforeEach(frame);

  it('is the same after save and open with a seismic regulation bound', () => {
    const r = regulationsStore.requestChange('seismic', 'inpres103-2018');
    if (r.kind === 'confirm') regulationsStore.applyPending(r.consequence?.kind ?? 'loadRegulation');
    expect(modelStore.model.regulations?.roles.seismic.adapterId).toBe('inpres103-2018');
    const before = modelHash(modelStore.snapshot());
    expect(deserializeProject(serializeProject())).toBe(true);
    expect(modelHash(modelStore.snapshot())).toBe(before);
  });

  it('does not change when the generator runs again at another time', () => {
    patchDesignData({ loadBasis: { at: '2026-11-01T10:00:00.000Z', factors: {}, levels: [], derivation: [], assumptions: [], refs: [] } as never });
    const first = modelHash(modelStore.snapshot());
    patchDesignData({ loadBasis: { at: '2026-11-02T18:30:00.000Z', factors: {}, levels: [], derivation: [], assumptions: [], refs: [] } as never });
    expect(modelHash(modelStore.snapshot())).toBe(first);
  });
});
