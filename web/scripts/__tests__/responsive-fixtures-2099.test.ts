import { afterAll, beforeAll, expect, it } from 'vitest';
import { createResponsiveFixtureRenderer } from '../responsive-fixture';

let renderer: Awaited<ReturnType<typeof createResponsiveFixtureRenderer>>;
beforeAll(async () => { renderer = await createResponsiveFixtureRenderer(); }, 120_000);
afterAll(async () => { await renderer?.close(); });

it.skipIf(process.env.RUN_KNOWN_WRONG !== '1').each([
  ['nm-pairing-responsive', 1],
  ['containment-responsive', 2],
] as const)('known wrong result: #2099: %s finishes its browser probe before returning', async (fixture, count) => {
  const html = await renderer.render(fixture, 390);
  const raw = html.match(/<pre id="checks">(.*?)<\/pre>/s)?.[1];
  expect(raw, html).toBeTruthy();
  const checks = JSON.parse(raw!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  expect(checks).toHaveLength(count);
  for (const check of checks) expect(check.width).toBe(390);
}, 60_000);
