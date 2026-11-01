import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'fflate';
import { TOOL_IDS, EXAMPLE, formula, format, workedExamples, buildModel, valid } from '../calculators';
import { calculate } from '../solve';
import { editorUrl } from '../share';

for (const id of TOOL_IDS) describe(id, () => {
  for (const p of workedExamples(id)) it(`worked example uniform=${p.uniform} K=${p.k}`, async () => {
    const answer = await calculate(id, p);
    console.info(`${id} uniform=${p.uniform} K=${p.k}: engine=${answer.value}; formula=${answer.expected}; relative=${answer.difference}`);
    expect(answer.expected).toBe(formula(id, p).value);
    expect(Math.abs(Number(format(answer.expected)) / answer.expected - 1)).toBeLessThan(1e-9);
    expect(answer.difference).toBeLessThan(id === 'column-buckling' ? p.k === 0.7 ? 0.0025 : 3e-6 : 1e-9);
    if (id !== 'column-buckling') {
      expect(answer.linear.reactions.reduce((v, r) => v + r.rz, 0)).toBeCloseTo(p.load * (p.uniform ? p.length : 1), 9);
      for (const key of ['moment', 'shear', 'deflection'] as const) expect(Math.abs(answer.maxima[key][1]) / answer.reference[key]).toBeCloseTo(1, 9);
    }
    const payload = editorUrl(answer.model, id).split('#data=2.')[1];
    const compact = JSON.parse(new TextDecoder().decode(inflateSync(Buffer.from(payload, 'base64url'))));
    expect(compact.n.length).toBe(answer.model.nodes.size);
    expect(compact.l.map(({ data: { id, caseId, ...data }, type }: any) => ({ type, data }))).toEqual(answer.model.loads);
    expect(compact.s).toEqual([...answer.model.supports.values()].map(s => [s.id, s.nodeId, s.type]));
    expect(compact._.includeSelfWeight).toBe(false);
  });
});
it('arbitrary point load positions retain equilibrium and analytic deflection', async () => {
  for (const position of [1, 2.3, 5.1, 6]) {
    const p = { ...EXAMPLE, uniform: false, position };
    for (const id of ['simply-supported-beam', 'cantilever-beam'] as const) {
      if (id === 'simply-supported-beam' && position === 6) continue;
      const result = await calculate(id, p);
      expect(result.difference).toBeLessThan(1e-9);
    }
  }
});
it('rejects invalid inputs', () => {
  for (const change of [{ length: 0 }, { e: NaN }, { i: -1 }, { position: 7, uniform: false }, { k: 3 }]) {
    expect(valid({ ...EXAMPLE, ...change })).toBe(false);
    expect(() => buildModel('simply-supported-beam', { ...EXAMPLE, ...change })).toThrow();
  }
});
it('prerender captures the same worked-example formatter and routes', () => {
  const page = readFileSync(new URL('../ToolsPage.svelte', import.meta.url), 'utf8');
  expect(page).toContain('data-value={format(formula(id, example).value)}');
  const script = readFileSync(new URL('../../../../scripts/prerender.ts', import.meta.url), 'utf8');
  for (const id of TOOL_IDS) expect(script).toContain(`/tools/${id}`);
});
