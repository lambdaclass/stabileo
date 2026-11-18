import { afterEach, expect, it, vi } from 'vitest';
import * as engine from '../../engine/wasm-solver';
import { slab } from '../../../components/examples/slab';
import { defaults } from '../../../components/examples/define';
import columns from '../../../../results-frozen/gallery-slab-columns.json';
import walls from '../../../../results-frozen/gallery-slab-walls.json';
import { compareFrozen, freezeValues } from '../../../../scripts/results-snapshot/frozen.mjs';

afterEach(() => vi.unstubAllGlobals());

for (const tools of ['0', '1', undefined]) {
  for (const supports of [0, 1]) {
    it(`slab supports=${supports} retains main's analysis with tools=${tools}`, () => {
      vi.stubGlobal('__PUBLIC_FEATURES__', { accounts: tools === '1', research: tools === '1', tools: tools === '1', diagramGame: tools === '1' });
      const values = { ...defaults(slab.params), supports };
      const result = slab.analyses(slab.build(values), values, engine);
      expect(result.status).toBe('ok');
      expect(compareFrozen((supports === 0 ? columns : walls).values, freezeValues(result, 'gallery')))
        .toEqual({ changed: [], removed: [], added: [], differs: false });
    });
  }
}

for (const supports of [0, 1]) {
  it(`the gallery worker preserves main's slab output with supports=${supports}`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', { accounts: false, research: false, tools: false, diagramGame: false });
    const worker = { onmessage: null as null | ((event: { data: unknown }) => Promise<void>), postMessage: vi.fn() };
    vi.stubGlobal('self', worker);
    try {
      vi.resetModules();
      await import('../../../components/examples/run.worker');
      const values = { ...defaults(slab.params), supports };
      await worker.onmessage!({ data: { id: slab.id, values, token: 7 } });
      expect(worker.postMessage).toHaveBeenCalledTimes(1);
      const response = worker.postMessage.mock.calls[0][0];
      expect(response.token).toBe(7);
      expect(compareFrozen((supports === 0 ? columns : walls).values, freezeValues(response.outcome, 'gallery')))
        .toEqual({ changed: [], removed: [], added: [], differs: false });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it(`the slab fallback solver preserves the gallery views with supports=${supports}`, () => {
    const values = { ...defaults(slab.params), supports };
    const result = slab.analyses(slab.build(values), values, { ...engine, hasCertifyExport: () => false });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error(result.code);
    expect(result.certificate).toEqual({ status: 'unavailable', kind: 'linear', code: 'noExport' });
    const baseline = Object.fromEntries(Object.entries((supports === 0 ? columns : walls).values).filter(([path]) => path.startsWith('gallery.views.')));
    expect(compareFrozen(baseline, freezeValues(result.views, 'gallery.views')))
      .toEqual({ changed: [], removed: [], added: [], differs: false });
  });
}
