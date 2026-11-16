import { beforeAll, afterAll, expect, it } from 'vitest';
import { createResponsiveFixtureRenderer } from '../responsive-fixture';

let renderer: Awaited<ReturnType<typeof createResponsiveFixtureRenderer>>;
beforeAll(async () => { renderer = await createResponsiveFixtureRenderer(); }, 120_000);
afterAll(async () => { await renderer?.close(); });

it.each([390, 820])('the RC-NM-PAIRING explanation is shown, readable and inside the viewport at %ipx', async width => {
  const stdout = await renderer.render('nm-pairing-responsive', width);
  const raw = stdout.match(/<pre id="checks">(.*?)<\/pre>/s)?.[1];
  expect(raw, stdout.slice(-3000)).toBeTruthy();
  const [check] = JSON.parse(raw!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  expect(check.width).toBe(width);
  expect(check.shown).toBe(true);
  expect(check.text).toContain('(#1316)');
  expect(check.text).not.toContain('knownIssue.');
  expect(check.text).toContain('1.2D+1.6L');
  expect(check.smallText).toEqual([]);
  expect(check.outside).toEqual([]);
  expect(check.scrollWidth).toBeLessThanOrEqual(width);
}, 60_000);
