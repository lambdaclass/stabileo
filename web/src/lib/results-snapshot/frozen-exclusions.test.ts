import { existsSync } from 'node:fs';
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
