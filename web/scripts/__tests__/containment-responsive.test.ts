import { beforeAll, afterAll, expect, it } from 'vitest';
import { createResponsiveFixtureRenderer } from '../responsive-fixture';

let renderer: Awaited<ReturnType<typeof createResponsiveFixtureRenderer>>;
beforeAll(async () => { renderer = await createResponsiveFixtureRenderer(); }, 120_000);
afterAll(async () => { await renderer?.close(); });

it.each([390, 810])('child panels and QuantityInput render accessibly at %ipx', async width => {
  const stdout = await renderer.render('containment-responsive', width);
  const raw = stdout.match(/<pre id="checks">(.*?)<\/pre>/s)?.[1];
  expect(raw, stdout.slice(-3000)).toBeTruthy();
  const checks = JSON.parse(raw!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  expect(checks).toHaveLength(2);
  for (const check of checks) {
    expect(check.width).toBe(width);
    expect(check.smallText, check.id).toEqual([]);
    expect(check.smallTargets, check.id).toEqual([]);
    expect(check.outside, check.id).toEqual([]);
    expect(check.runAccessible, check.id).toBe(true);
    expect(check.controls).toBeGreaterThan(3);
  }
}, 60_000);
