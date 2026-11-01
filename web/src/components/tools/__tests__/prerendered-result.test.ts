import { describe, it, expect, afterEach, vi } from 'vitest';
import { parsePrerenderedResult, prerenderedResult, recordPrerenderedResult, serializePrerenderedResult } from '../prerendered-result';

const params = { length: 6, e: 200000, uniform: true };
const result = {
  model: { nodes: new Map([[1, { id: 1, x: 0, z: -0 }], [2, { id: 2, x: 6, z: 0 }]]) },
  linear: { displacements: [{ nodeId: 2, uz: -0.010546875000000002, ry: Number.NaN }], extra: undefined, limit: Infinity },
  label: '</script><b>',
};

function fakeHead() {
  const scripts: { type: string; dataset: Record<string, string>; textContent: string; remove(): void }[] = [];
  const head = {
    querySelector: (selector: string) => scripts.find(s => selector === `script[data-prerendered-result="${s.dataset.prerenderedResult}"]`) ?? null,
    appendChild: (s: (typeof scripts)[number]) => { s.remove = () => scripts.splice(scripts.indexOf(s), 1); scripts.push(s); },
  };
  vi.stubGlobal('document', { head, createElement: () => ({ dataset: {}, textContent: '', type: '' }) });
  return scripts;
}

afterEach(() => vi.unstubAllGlobals());

describe('a tool result carried by the prerendered page', () => {
  it('comes back bit for bit: Maps, -0, NaN, Infinity, undefined and markup in strings', () => {
    const text = serializePrerenderedResult(params, result)!;
    expect(text).not.toContain('<');
    const back = parsePrerenderedResult<typeof result>(text, { uniform: true, e: 200000, length: 6 })!;
    expect(back.model.nodes).toBeInstanceOf(Map);
    expect([...back.model.nodes.keys()]).toEqual([1, 2]);
    expect(Object.is(back.model.nodes.get(1)!.z, -0)).toBe(true);
    expect(back.linear.displacements[0].uz).toBe(-0.010546875000000002);
    expect(back.linear.displacements[0].ry).toBeNaN();
    expect(back.linear.limit).toBe(Infinity);
    expect('extra' in back.linear && back.linear.extra === undefined).toBe(true);
    expect(back.label).toBe('</script><b>');
  });

  it('is not used for other parameters, nor read from damaged text', () => {
    const text = serializePrerenderedResult(params, result)!;
    expect(parsePrerenderedResult(text, { ...params, e: 100000 })).toBeNull();
    expect(parsePrerenderedResult('{not json', params)).toBeNull();
  });

  it('is not written for a value it could not give back exactly', () => {
    expect(serializePrerenderedResult(params, { values: new Float64Array([1, 2]) })).toBeNull();
    expect(serializePrerenderedResult(params, { $map: 1 })).toBeNull();
    expect(serializePrerenderedResult(params, [1, , 3])).toBeNull();
  });

  it('is written into <head> only during the prerender capture, once per tool', () => {
    const scripts = fakeHead();
    vi.stubGlobal('window', {});
    recordPrerenderedResult('beam', params, result);
    expect(scripts).toHaveLength(0);
    expect(prerenderedResult('beam', params)).toBeNull();
    vi.stubGlobal('window', { __stabileoPrerender: true });
    recordPrerenderedResult('beam', params, { value: 1 });
    recordPrerenderedResult('beam', params, { value: 2 });
    expect(scripts).toHaveLength(1);
    expect(scripts[0].type).toBe('application/json');
    expect(prerenderedResult('beam', params)).toEqual({ value: 2 });
    expect(prerenderedResult('column', params)).toBeNull();
  });
});
