import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import exclusions from './frozen-exclusions.json';
import inputs from './frozen-inputs.json';
import { assertFrozenModelAllowed } from '../../../scripts/results-snapshot/frozen.mjs';

const dir = new URL('../../../results-frozen/', import.meta.url);

for (const [issue, models] of Object.entries(exclusions)) {
  for (const model of models) {
    it(`rejects freezing ${model} while #${issue} is open`, () => {
      expect(() => assertFrozenModelAllowed(model, exclusions)).toThrow(`known wrong result: #${issue}`);
    });

    it(`known wrong result: #${issue} excludes input ${model}`, () => {
      expect(inputs.map(input => input.model)).not.toContain(model);
    });

    it(`known wrong result: #${issue} excludes output ${model}`, () => {
      expect(existsSync(new URL(model, dir))).toBe(false);
    });
  }
}

it('permits every retained frozen input', () => {
  expect(inputs.length).toBeGreaterThan(0);
  for (const input of inputs) expect(() => assertFrozenModelAllowed(input.model, exclusions)).not.toThrow();
});

it('keeps the exclusion inventory nonempty and unambiguous', () => {
  const models = Object.values(exclusions).flat();
  expect(models.length).toBeGreaterThan(0);
  expect(new Set(models).size).toBe(models.length);
  for (const [issue, names] of Object.entries(exclusions)) {
    expect(issue).toMatch(/^[1-9][0-9]*$/);
    expect(names.length).toBeGreaterThan(0);
  }
});

for (const model of ['solve_arc_length-0015ab84c3baa36f.json', 'solve_arc_length-022317310499426d.json']) {
  it.skip(`known wrong result: #1952 restores corrected frozen coverage for ${model}`, () => {
    const entry = inputs.find(input => input.model === model);
    expect(entry, model).toBeDefined();
    expect(entry?.analysis).toBe('solve_arc_length');
    const original = JSON.parse(readFileSync(new URL(`../../../../engine/tests/fixtures/${model}`, import.meta.url), 'utf8'));
    expect(entry?.input).toEqual([original]);
    expect(() => assertFrozenModelAllowed(model, exclusions)).not.toThrow();
    const output = JSON.parse(readFileSync(new URL(model, dir), 'utf8'));
    expect(output.features).toEqual(['plane2D', 'members', 'analysis:nonlinear', 'pathAnalysis']);
    expect(output.values['nonlinear.converged']).toBe(true);
    expect(output.values['nonlinear.results.reactions.length']).toBe(Object.keys(original.solver.supports).length);
    expect(output.values['nonlinear.results.reactions.length']).toBeGreaterThan(0);
  });
}
