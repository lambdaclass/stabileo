import { afterEach, expect, it, vi } from 'vitest';
import * as engine from '../../engine/wasm-solver';
import { slab } from '../../../components/examples/slab';
import { defaults } from '../../../components/examples/define';
import columns from '../../../../results-frozen/gallery-slab-columns.json';
import walls from '../../../../results-frozen/gallery-slab-walls.json';
import { compareFrozen, freezeValues } from '../../../../scripts/results-snapshot/frozen.mjs';

afterEach(() => vi.unstubAllEnvs());

for (const tools of ['0', '1', undefined]) {
  for (const supports of [0, 1]) {
    it.skipIf(process.env.IGNORED !== '1')(`known wrong result: #2099 slab supports=${supports} retains main's analysis with tools=${tools}`, () => {
      for (const key of ['VITE_ACCOUNTS', 'VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME']) vi.stubEnv(key, tools);
      const values = { ...defaults(slab.params), supports };
      const result = slab.analyses(slab.build(values), values, engine);
      expect(result.status).toBe('ok');
      expect(compareFrozen((supports === 0 ? columns : walls).values, freezeValues(result, 'gallery')))
        .toEqual({ changed: [], removed: [], added: [], differs: false });
    });
  }
}
