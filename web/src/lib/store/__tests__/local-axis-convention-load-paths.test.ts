// PR [10] review fix — the pre-metadata local-axis convention note must fire on
// EVERY load path (not only .ded open), and the convention tag must survive URL
// sharing so the note doesn't false-fire for new models shared via a link.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { uiStore } from '../ui.svelte';
import { noteAxisConventionMigrationIfNeeded } from '../file';
import { compressSnapshot, decompressSnapshot } from '../../utils/url-sharing';
import type { ModelSnapshot } from '../history.svelte';

const legacy3D = { elements: [[1, {}]] }; // no localAxisConvention; mode passed separately
const noteRe = /local-axis convention/i;

afterEach(() => vi.restoreAllMocks());

describe('noteAxisConventionMigrationIfNeeded — shared across all load paths', () => {
  it('fires for a legacy 3D/PRO model with members', () => {
    const toast = vi.spyOn(uiStore, 'toast');
    noteAxisConventionMigrationIfNeeded(legacy3D, 'pro');
    const calls = toast.mock.calls.filter((c) => noteRe.test(String(c[0])));
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toBe('info');
  });

  it('does NOT fire for a 2D model, an empty model, or a model that carries the tag', () => {
    const toast = vi.spyOn(uiStore, 'toast');
    noteAxisConventionMigrationIfNeeded({ elements: [[1, {}]] }, '2d');
    noteAxisConventionMigrationIfNeeded({ elements: [] }, 'pro');
    noteAxisConventionMigrationIfNeeded({ elements: [[1, {}]], localAxisConvention: 'zUpStrongAxis' }, 'pro');
    noteAxisConventionMigrationIfNeeded(undefined, 'pro');
    expect(toast.mock.calls.filter((c) => noteRe.test(String(c[0]))).length).toBe(0);
  });
});

describe('localAxisConvention survives URL share round-trip', () => {
  function snap(withTag: boolean): ModelSnapshot {
    return {
      analysisMode: 'pro',
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 5, z: 0 }]],
      materials: [[1, { id: 1, name: 'C', e: 30000000, nu: 0.2, rho: 2400 }]],
      sections: [], elements: [], supports: [], loads: [], loadCases: [], combinations: [],
      ...(withTag ? { localAxisConvention: 'zUpStrongAxis' } : {}),
      nextId: { node: 3, material: 2, section: 1, element: 1, support: 1, load: 1, loadCase: 1, combination: 1 },
    } as unknown as ModelSnapshot;
  }

  it('carries the tag for a new model (so the note never false-fires on URL load)', () => {
    const out = decompressSnapshot(compressSnapshot(snap(true)));
    expect(out!.localAxisConvention).toBe('zUpStrongAxis');
  });

  it('a legacy shared model decodes without the tag (note will fire)', () => {
    const out = decompressSnapshot(compressSnapshot(snap(false)));
    expect(out!.localAxisConvention).toBeUndefined();
  });
});
