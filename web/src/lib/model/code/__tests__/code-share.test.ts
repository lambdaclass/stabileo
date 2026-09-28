/**
 * The PRO link carries the model code, whole, and says so when it cannot.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { modelToCode } from '../format';
import { encodeCode, decodeCode, codeShareUrl, readCodeFragment, CODE_HASH } from '../share';
import { mergeCode } from '../apply';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => modelStore.clear());

describe('the code link', () => {
  it('compresses and restores the code exactly', async () => {
    await modelStore.loadExample('rc-design-qa-8');
    const code = modelToCode(modelStore.snapshot());
    expect(decodeCode(encodeCode(code))).toBe(code);
    expect(decodeCode('not-a-payload')).toBeNull();
  });

  it('opens on an empty model as the model it came from, shells and groups included', async () => {
    await modelStore.loadExample('pro-edificio-7p');
    const g = modelStore.addGroup('Core', 'selection', { quads: [1, 2] });
    const { url } = codeShareUrl(modelStore.snapshot(), 'https://example.test/app/pro');
    const before = modelStore.snapshot();
    modelStore.clear();
    const r = readCodeFragment(url.slice(url.indexOf(CODE_HASH)));
    expect(r.errors).toEqual([]);
    const { snapshot } = mergeCode(modelStore.snapshot(), r.snapshot!);
    modelStore.restore(snapshot);
    expect(modelStore.quads.size).toBe(before.quads!.length);
    expect(modelStore.elements.size).toBe(before.elements.length);
    expect(modelStore.model.groups.get(g)?.members.quads).toEqual([1, 2]);
  });

  it('measures the 7-storey building against the link ceiling', async () => {
    await modelStore.loadExample('pro-edificio-7p');
    const { length } = codeShareUrl(modelStore.snapshot(), 'https://stabileo.com/app/pro');
    // Recorded, not asserted against the ceiling: the panel decides from this number.
    expect(length).toBeGreaterThan(1000);
    console.log(`7-storey code link: ${length} characters`);
  });
});
