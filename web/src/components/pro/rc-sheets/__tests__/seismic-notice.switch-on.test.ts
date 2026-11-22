import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import RcSeismicNotice from '../RcSeismicNotice.svelte';
import { modelStore } from '../../../../lib/store';
import { setRcOption, setSheetCode } from '../../../../lib/store/rc-sheets.svelte';

afterEach(() => { modelStore.clear(); });
const notice = () => render(RcSeismicNotice).body;

it('the sheets ask to turn chapter 18 on where a seismic case carries loads, and to reconsider it where none does', () => {
  modelStore.clear();
  setSheetCode('cirsoc201-2025');
  expect(notice()).not.toContain('rc-seismic-advice');
  setRcOption('seismic', true);
  expect(notice()).toContain('data-advice="withoutLoads"');
  const quake = modelStore.model.loadCases.find((c) => c.type === 'E')!.id;
  modelStore.addNodalLoad3D(modelStore.addNode(0, 0, 3), 50, 0, 0, 0, 0, 0, quake);
  expect(notice()).not.toContain('rc-seismic-advice');
  setRcOption('seismic', false);
  const html = notice();
  expect(html).toContain('data-advice="recommend"');
  expect(html).toContain('data-testid="rc-seismic-advice-apply"');
});
