import { readFileSync } from 'node:fs';
import { build } from 'vite';
import { expect, it } from 'vitest';
import { featuresForMode } from '../../config/public-features.mjs';
import * as viewerDictionaries from '../../src/components/viewport/scalar-viewer-translations';
import { segments } from '../translation-gate';

it('the standalone viewer ships keyboard help for every offered locale', async () => {
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
  const { research } = featuresForMode('production');
  for (const [locale, dictionary] of Object.entries(viewerDictionaries)) {
    expect(code.includes(dictionary[keyboard]), locale).toBe(locale !== 'hu' || research);
  }
  expect(code.includes('tools.simply-supported-beam.subtitle')).toBe(false);
}, 30_000);

it('the translation gate skips Navier’s equations', () => {
  const source = readFileSync(new URL('../../src/components/research/navier1823/NavierPage.svelte', import.meta.url), 'utf8');
  const equations = source.match(/<p class="equation"[^>]*>[^\n]+<\/p>/g) ?? [];
  expect(equations).toHaveLength(2);
  for (const equation of equations) expect(segments(equation, 'hu')).toEqual([]);
});
