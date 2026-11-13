import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findPost } from '..';
import type { PublicLocale } from '../../i18n/store.svelte';

it.each(['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu'] as PublicLocale[])('%s lists and links SA-2026-065 with a pending local correction', locale => {
  const blocks = findPost('safety-advisories')!.i18n[locale]!.blocks;
  const table = blocks.find(b => b.k === 'table');
  if (table?.k !== 'table') throw new Error('Missing advisory table');
  const rows = table.rows.filter(r => r[0] === 'SA-2026-065');
  expect(rows).toHaveLength(1);
  expect(rows[0]![3]).toContain('#2081');
  expect(blocks.some(b => b.k === 'note' && b.t.includes('SA-2026-065') && b.t.includes('#2081'))).toBe(true);
  expect(blocks.some(b => b.k === 'ext' && b.href.endsWith('/SA-2026-065-snow-drift-roof-step.md'))).toBe(true);
});

it('records source-confirmed release boundaries without claiming a fixed release', () => {
  const text = readFileSync(new URL('../../../../../docs/advisories/SA-2026-065-snow-drift-roof-step.md', import.meta.url), 'utf8');
  for (const tag of ['v0.4.0', 'v0.5.0', 'desktop-v0.1.0-alpha.1', 'alpha.2', 'alpha.3']) expect(text).toContain(tag);
  expect(text).toContain('pending review and release');
  expect(text).toContain('1.1817');
  expect(text).toContain('not a replay of historical release binaries');
  const replay = JSON.parse(readFileSync(new URL('../../../../../docs/advisories/replays/SA-2026-065.json', import.meta.url), 'utf8'));
  expect(replay.mainObservation.planOutcome).toBe('READY');
  expect(replay.mainObservation.blockedKeys).toEqual([]);
  expect(replay.mainObservation.maximumGeneratedPressure).toBe(1);
  expect(replay.requiredPeak).toBe(1.1817);
  for (const source of replay.sourceTags) {
    expect(source.flatBalancedReference).toBe(true);
    expect(source.levelStepHeight).toBe(true);
    expect(source.meanElevationBandFilter).toBe(true);
  }
});
