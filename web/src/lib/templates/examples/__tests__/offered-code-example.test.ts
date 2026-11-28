import { afterEach, expect, it } from 'vitest';
import published from '../pro-steel-building-slabs.stabileo.txt?raw';
import generated from '../pro-steel-building-slabs-generated.stabileo.txt?raw';
import { CODE_EXAMPLES, codeExampleText, loadCodeExample } from '../index';
import { codeToModel } from '../../../model/code/format';
import en from '../../../i18n/locales/en';
import { PRO_EXAMPLES, publishedBuildingExamples, unifiedBuildingExamples } from '../../../data/pro-examples';
import { modelStore } from '../../../store';

afterEach(() => modelStore.clear());

it('known wrong result: #1928 the direct text and model readers open the steel building offered by this profile', async () => {
  const text = __PUBLIC_FEATURES__.proPlatesUnified ? generated : published;
  expect(generated).not.toBe(published);
  expect(await codeExampleText('pro-steel-building-slabs')).toBe(text);
  await loadCodeExample('pro-steel-building-slabs');
  const expected = codeToModel(text).snapshot;
  if (!expected?.nodes?.length || !expected.elements?.length) throw new Error('Referenced steel building is missing its structure');
  expect([...modelStore.nodes.keys()]).toEqual(expected.nodes.map(([id]) => id));
  expect([...modelStore.elements.keys()]).toEqual(expected.elements.map(([id]) => id));
  expect('pro-rc-house' in CODE_EXAMPLES).toBe(__PUBLIC_FEATURES__.proPlatesUnified === true);
  expect('pro-plane-frame-seismic' in CODE_EXAMPLES).toBe(true);
});

it('describes the loads supplied by each steel gallery card', () => {
  const id = 'pro-steel-building-slabs';
  const published = publishedBuildingExamples.find(card => card.id === id)!;
  expect(published.loads).toBe('model');
  expect(en[published.descKey]).toBe('A three-story steel frame with concrete slabs meshed as shells and a core of walls. The beams sit under the slab, their axis offset.');
  const offered = PRO_EXAMPLES.find(card => card.id === id);
  if (__PUBLIC_FEATURES__.proPlatesUnified) {
    const generated = unifiedBuildingExamples().find(card => card.id === id)!;
    expect(generated.loads).toBe('generator');
    expect(en[generated.descKey]).toContain('loads and the wind come from the code load generator');
    expect(offered?.descKey).toBe(generated.descKey);
  } else {
    expect(unifiedBuildingExamples()).toEqual([]);
    expect(offered?.descKey).toBe(published.descKey);
  }
});
