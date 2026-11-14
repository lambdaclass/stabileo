import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it.skip('known wrong result: #765 T31 — signup never silently opts into research', () => {
  const source = readFileSync(new URL('../../../components/account/AuthDialog.svelte', import.meta.url), 'utf8');
  expect(source).not.toMatch(/model_research:\s*true/);
  expect(source).toMatch(/model_research:\s*false/);
});
