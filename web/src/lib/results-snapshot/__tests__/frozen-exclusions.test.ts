import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import exclusions from '../frozen-exclusions.json';
import inputs from '../frozen-inputs.json';

const dir = new URL('../../../../results-frozen/', import.meta.url);

for (const [issue, models] of Object.entries(exclusions)) {
  for (const model of models) {
    it.skip(`known wrong result: #${issue} excludes input ${model}`, () => {
      expect(inputs.map(input => input.model)).not.toContain(model);
    });

    it.skip(`known wrong result: #${issue} excludes output ${model}`, () => {
      expect(existsSync(new URL(model, dir))).toBe(false);
    });
  }
}
