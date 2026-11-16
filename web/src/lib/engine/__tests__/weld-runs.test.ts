import { expect, it } from 'vitest';
import fixture from '../../../../../engine/tests/integration/fixtures/weld-runs.json';
import { checkWeldGroups } from '../wasm-solver';

function expectWeldValue(actual: unknown, expected: number, key: string) {
  expect(Math.abs((actual as number) - expected), key).toBeLessThanOrEqual(1e-12 * Math.max(Math.abs(expected), 1e-12));
}

const invalidReferenceTest = process.env.RUN_KNOWN_WRONG === '2258' ? it : it.skip;

for (const [name, actual] of [
  ['null', null],
  ['serialized nonfinite unity ratio', JSON.parse(JSON.stringify({ unityRatio: Infinity })).unityRatio],
  ['numeric string', '0'],
  ['boolean', false],
] as const) {
  invalidReferenceTest(`known wrong result: #2258 rejects ${name} for a zero weld reference`, () => {
    expect(() => expectWeldValue(actual, 0, 'unityRatio')).toThrow();
  });
}

it.each([undefined, NaN, Infinity, -Infinity])('rejects the nonfinite weld reference %s', (value) => {
  expect(() => expectWeldValue(value, 0, 'unityRatio')).toThrow();
});

it('rejects a finite weld value outside the reference tolerance', () => {
  expect(() => expectWeldValue(1, 0, 'unityRatio')).toThrow();
});

it.each([0, -0, 1, -1, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE])('accepts the finite weld reference %s', (value) => {
  expectWeldValue(value, value, 'unityRatio');
});

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
      expectWeldValue(actual[key], expected, key);
    }
  });
}
