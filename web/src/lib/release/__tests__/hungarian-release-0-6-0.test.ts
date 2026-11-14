import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import { releaseNotesUrl } from '../whats-new';

const read = (file: string) => readFileSync(new URL(`../../../../../${file}`, import.meta.url), 'utf8');
const hungarian = () => read('docs/releases/v0.6.0.hu.md');

it('known wrong result: #2081 links current Hungarian release notes and retains older-release fallbacks', () => {
  expect(releaseNotesUrl('hu')).toBe('https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.hu.md');
  expect(hungarian()).toContain('2026-11-13');
  for (const version of ['0.2.0', '0.3.0', '0.4.0', '0.5.0']) {
    expect(releaseNotesUrl('hu', version)).toBe(`https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v${version}.md`);
  }
  expect(releaseNotesUrl('it')).toBe('https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.md');
});

it('known wrong result: #2081 retains every released result notice with its registry Hungarian title', () => {
  const rows = (text: string) => [...text.matchAll(/^\| (\d+) \| \[([^\]]+)\]\(([^)]+)\)/gm)];
  const english = rows(read('docs/releases/v0.6.0.md'));
  const translated = rows(hungarian());
  expect(english.length).toBeGreaterThan(0);
  expect(translated.map((row) => [row[1], row[3]])).toEqual(english.map((row) => [row[1], row[3]]));
  const registry = readRegistry();
  for (const [index, row] of english.entries()) {
    const change = registry.changes.find((change) => change.title.en === row[2]);
    expect(change, row[2]).toBeDefined();
    expect(translated[index][2]).toBe(change!.title.hu);
    expect(translated[index][2]).not.toBe(row[2]);
  }
});

it('known wrong result: #2081 retains all CIRSOC rechecks and the separate buckling refusal condition in Hungarian', () => {
  const lines = hungarian().split('\n');
  const cb = lines.find((line) => line.startsWith('|') && line.includes('SA-2026-048]('))!;
  expect(cb).toContain('Mmax');
  expect(cb).toMatch(/minden olyan CIRSOC 301 rudat/);
  expect(cb).toMatch(/megadott Lb kisebb a rúd hosszánál/);
  expect(cb).toMatch(/U és T szelvények.*kettős görbület/);
  const buckling = lines.find((line) => line.startsWith('|') && line.includes('2026-11-buckling-round-off-member-kg.md)'))!;
  expect(buckling).toContain('nem adnak geometriai merevséget');
  expect(buckling).toMatch(/elutasítja.*lehetséges nyomóerejük.*több mint 1 %-kal csökkenthetné/);
});

it('known wrong result: #2081 retains security fixes and unresolved limitations in Hungarian', () => {
  const text = hungarian();
  const security = text.split(/^## /m).find((section) => section.startsWith('Biztonság\n'))!;
  expect(security).toMatch(/quinn-udp[\s\S]*0\.5\.14[\s\S]*0\.5\.16[\s\S]*RUSTSEC-2026-0538/);
  expect(security).toMatch(/rustix[\s\S]*1\.1\.4[\s\S]*1\.1\.6[\s\S]*RUSTSEC-2026-0486/);
  expect(security).toMatch(/Revert Check \(trusted\).*alapág.*commit.*adatként.*soha.*futtatja/);
  const limitations = text.split(/^## /m).find((section) => section.startsWith('Ismert korlátok\n'))!;
  expect(limitations).toContain('SA-2026-056 továbbra sincs javítva');
  expect(limitations).toContain('#758');
  expect(limitations).toContain('SA-2026-044');
  expect(limitations).toContain('teljes dinamikus támaszerőket');
  expect(limitations).toContain('független');
});
