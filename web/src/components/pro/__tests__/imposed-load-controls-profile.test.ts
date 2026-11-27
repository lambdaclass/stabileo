import { render } from 'svelte/server';
import { expect, it, vi } from 'vitest';
import { defaultRoofConfig } from '../auto-loads-sections';
import { roofLrRange } from '../ProRoofLoadSection.svelte';
import DeadLoads from '../ProDeadLoadBuilder.svelte';
import { roofLiveLoad } from '../../../lib/codes/cirsoc101/roof-live';
import type { ImposedLoadCode } from '../../../lib/codes/families/load-codes';

it.skip('known wrong result: #1928 the roof readout uses only a generator offered in its build', () => {
  const config = defaultRoofConfig();
  const standard = roofLrRange(config, 1, 0);
  const alternate = vi.fn((input: Parameters<typeof roofLiveLoad>[0]) => ({ ...roofLiveLoad(input), lr: 17 }));
  const code = { family: 'test', roofLive: alternate } as unknown as ImposedLoadCode;
  const actual = roofLrRange(config, 1, 0, undefined, code);
  expect(actual).toEqual(__PUBLIC_FEATURES__.proPlatesUnified ? { lo: 17, hi: 17 } : standard);
  expect(alternate).toHaveBeenCalledTimes(__PUBLIC_FEATURES__.proPlatesUnified ? 2 : 0);
});

it.skip('known wrong result: #1928 the published dead-load table remains available when a hidden catalogue override is forwarded', () => {
  const props = { rows: [], liveLo: 1 };
  expect(render(DeadLoads, { props }).body).toContain('dead-add-table');
  const html = render(DeadLoads, { props: { ...props, catalogue: false, codeHint: 'Alternate authority' } }).body;
  expect(html.includes('dead-add-table')).toBe(!__PUBLIC_FEATURES__.proPlatesUnified);
  expect(html.includes('dead-code-hint')).toBe(Boolean(__PUBLIC_FEATURES__.proPlatesUnified));
});
