import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createResponsiveFixtureRenderer } from '../responsive-fixture';

let renderer: Awaited<ReturnType<typeof createResponsiveFixtureRenderer>>;
beforeAll(async () => { renderer = await createResponsiveFixtureRenderer(); }, 120_000);
afterAll(async () => { await renderer?.close(); });

it.each([
  ['containment-responsive', 2],
] as const)('%s finishes its browser probe before returning', async (fixture, count) => {
  const html = await renderer.render(fixture, 390);
  const raw = html.match(/<pre id="checks">(.*?)<\/pre>/s)?.[1];
  expect(raw, html).toBeTruthy();
  const checks = JSON.parse(raw!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  expect(checks).toHaveLength(count);
  for (const check of checks) expect(check.width).toBe(390);
}, 60_000);

it.each(['browser', 'Node'] as const)('%s locale initialization handles absent, disabled and enabled research', async runtime => {
  for (const flag of [undefined, '0', '1']) {
    const env = flag === undefined ? {} : { VITE_RESEARCH: flag };
    const built = await build({
      entryPoints: ['src/lib/i18n/offered.ts'], bundle: true, write: false,
      format: 'iife', globalName: 'offering', platform: 'neutral',
      define: { 'import.meta.env': runtime === 'browser' ? JSON.stringify(env) : 'undefined' },
    });
    const offering = runInNewContext(`${built.outputFiles[0].text}\noffering`, runtime === 'Node' ? { process: { env } } : {}) as typeof import('../../src/lib/i18n/offered');
    const expected = ['en', 'es', 'pt', 'de', 'fr', 'tr', ...(flag === '1' ? ['hu'] : [])].sort();
    expect([...offering.OFFERED_LOCALES].sort(), `${runtime}: ${flag}`).toEqual(expected);
    expect([...offering.PUBLIC_LOCALES].sort(), `${runtime}: ${flag}`).toEqual(expected);
    expect(offering.isComplete('hu'), `${runtime}: ${flag}`).toBe(flag === '1');
    expect(offering.isComplete('en')).toBe(true);
  }
});
