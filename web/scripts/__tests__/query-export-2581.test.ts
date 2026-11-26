import { afterAll, beforeAll, expect, it } from 'vitest';
import { createResponsiveFixtureRenderer } from '../responsive-fixture';

let renderer: Awaited<ReturnType<typeof createResponsiveFixtureRenderer>>;
beforeAll(async () => { renderer = await createResponsiveFixtureRenderer(); }, 120_000);
afterAll(async () => { await renderer?.close(); });

it.skip('known wrong result: #2581 the spatial query CSV refuses with the table error', async () => {
  const html = await renderer.render('query-export-2581', 900);
  const raw = html.match(/<pre id="checks">(.*?)<\/pre>/s)?.[1];
  expect(raw).toBeTruthy();
  const { missing, unbound, validEnabled, member, files, message } = JSON.parse(raw!);
  expect.soft(missing).toEqual({ table: message, disabled: true, export: message });
  expect.soft(unbound).toEqual({ table: message, disabled: true, export: message });
  expect.soft(validEnabled).toBe(true);
  expect.soft(files).toHaveLength(1);
  const loaded = files.find((file: string[]) => file.length === 3);
  expect(loaded?.slice(1).map((line: string) => line.split(',').slice(8))).toEqual([
    [String(member), 'i', '10', 'kN'], [String(member), 'j', '10', 'kN'],
  ]);
}, 60_000);
