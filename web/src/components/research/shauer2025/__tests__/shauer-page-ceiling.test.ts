import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ShauerPage decomposition (#794)', () => {
  it('ShauerPage.svelte stays below the 600-LOC component ceiling', () => {
    const file = resolve(__dirname, '../ShauerPage.svelte');
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n').length;
    expect(lines, `ShauerPage.svelte has ${lines} lines, exceeding the 600-line ceiling`).toBeLessThan(600);
  });

  it('delegates to decomposed subcomponents', () => {
    expect(existsSync(resolve(__dirname, '../ShauerArticle.svelte'))).toBe(true);
    expect(existsSync(resolve(__dirname, '../ShauerResultsPanels.svelte'))).toBe(true);
    expect(existsSync(resolve(__dirname, '../ShauerParamsPanel.svelte'))).toBe(true);
  });
});
