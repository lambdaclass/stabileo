import { readFileSync } from 'node:fs';
import { build } from 'vite';
import { expect, it } from 'vitest';
import { toolTranslations } from '../../src/components/tools/translations';
import { segments } from '../translation-gate';

it.skip('known wrong result: #2286 — the standalone viewer ships keyboard help for every offered locale', async () => {
  const result = await build({
    configFile: 'vite.research-viewer.config.ts',
    build: { write: false },
    logLevel: 'silent',
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(bundle => {
    if (!('output' in bundle)) throw new Error('Expected a viewer bundle');
    return bundle.output;
  });
  const code = outputs.flatMap(output => output.type === 'chunk' ? [output.code] : []).join('\n');
  const keyboard = 'scalarViewer.keyboard';
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu']) {
    expect(code.includes(toolTranslations[locale][keyboard]), locale).toBe(true);
  }
  expect(code.includes('tools.simply-supported-beam.subtitle')).toBe(false);
}, 30_000);

it.skip('known wrong result: #2286 — the translation gate skips Navier’s equations', () => {
  const source = readFileSync(new URL('../../src/components/research/navier1823/NavierPage.svelte', import.meta.url), 'utf8');
  const equations = source.match(/<p class="equation"[^>]*>[^\n]+<\/p>/g) ?? [];
  expect(equations).toHaveLength(2);
  for (const equation of equations) expect(segments(equation, 'hu')).toEqual([]);
});
