import { afterEach, expect, it } from 'vitest';
import published from '../pro-steel-building-slabs.stabileo.txt?raw';
import generated from '../pro-steel-building-slabs-generated.stabileo.txt?raw';
import { CODE_EXAMPLES, codeExampleText, loadCodeExample } from '../index';
import { codeToModel } from '../../../model/code/format';
import { modelStore } from '../../../store';

afterEach(() => modelStore.clear());

it('known wrong result: #1928 the direct text and model readers open the steel building offered by this profile', async () => {
  const text = __PUBLIC_FEATURES__.proPlatesUnified ? generated : published;
  expect(generated).not.toBe(published);
  expect(await codeExampleText('pro-steel-building-slabs')).toBe(text);
  await loadCodeExample('pro-steel-building-slabs');
  const expected = codeToModel(text).snapshot!;
  expect([...modelStore.nodes.keys()]).toEqual(expected.nodes.map(([id]) => id));
  expect([...modelStore.elements.keys()]).toEqual(expected.elements.map(([id]) => id));
  expect('pro-rc-house' in CODE_EXAMPLES).toBe(__PUBLIC_FEATURES__.proPlatesUnified === true);
  expect('pro-plane-frame-seismic' in CODE_EXAMPLES).toBe(true);
});
