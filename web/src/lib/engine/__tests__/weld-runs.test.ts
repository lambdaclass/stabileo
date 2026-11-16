import { expect, it } from 'vitest';
import fixture from '../../../../../engine/tests/integration/fixtures/weld-runs.json';
import { checkWeldGroups } from '../wasm-solver';

for (const test of fixture.cases) {
  const { name } = test;
  it(`${name} (${fixture.source})`, () => {
    const actual = checkWeldGroups(test.input)[0];
    if ('expectedUnevaluated' in test) {
      expect(actual.unityRatio).toBeNull();
      expect(actual.unevaluated).toEqual([test.expectedUnevaluated]);
      return;
    }
    if (!test.expected) throw new Error(`Missing reference result: ${name}`);
    expect(actual.unevaluated ?? []).toEqual([]);
    for (const [key, expected] of Object.entries(test.expected)) {
      expect(Math.abs(actual[key] - expected), key).toBeLessThanOrEqual(1e-12 * Math.max(Math.abs(expected), 1e-12));
    }
  });
}
