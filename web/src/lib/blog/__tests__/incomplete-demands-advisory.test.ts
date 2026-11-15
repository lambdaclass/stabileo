import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findPost } from '..';
import type { PublicLocale } from '../../i18n/store.svelte';
import notice from '../../provenance/result-changes/shared-demand-completeness.json';
import witness from '../../../../../docs/results-changes/2096-main-partial-witnesses.json';

const filename = 'SA-2026-071-incomplete-concurrent-demands.md';
const advisory = readFileSync(new URL(`../../../../../docs/advisories/${filename}`, import.meta.url), 'utf8');
const status = 'Draft 2026-11-15; fixed in PR #2173, pending merge and release';

it.each<[PublicLocale, string, string]>([
  ['en', 'High', status],
  ['es', 'Alta', 'Borrador 2026-11-15; corregido en PR #2173, pendiente de integración y publicación'],
  ['pt', 'Alta', 'Rascunho 2026-11-15; corrigido no PR #2173, aguardando integração e lançamento'],
  ['de', 'Hoch', 'Entwurf 2026-11-15; in PR #2173 behoben, Zusammenführung und Veröffentlichung ausstehend'],
  ['fr', 'Élevée', 'Brouillon 2026-11-15 ; corrigé dans la PR #2173, fusion et publication en attente'],
  ['tr', 'Yüksek', 'Taslak 2026-11-15; PR #2173 ile düzeltildi, birleştirme ve yayın bekleniyor'],
])('#2096 %s lists the incomplete-demand advisory and pending fix', (locale, severity, translatedStatus) => {
  const blocks = findPost('safety-advisories')!.i18n[locale]!.blocks;
  const table = blocks.find(b => b.k === 'table');
  if (table?.k !== 'table') throw new Error('Missing advisory table');
  const rows = table.rows.filter(r => r[0] === 'SA-2026-071');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.slice(2)).toEqual([severity, translatedStatus]);
  expect(rows[0]![1]).toContain('#2096');
  expect(blocks.filter(b => b.k === 'note' && b.t === `SA-2026-071 — ${translatedStatus}.`)).toHaveLength(1);
  expect(blocks.filter(b => b.k === 'ext' && b.label === 'SA-2026-071' && b.href.endsWith(`/docs/advisories/${filename}`))).toHaveLength(1);
  expect(notice.explanation[locale]).toContain('SA-2026-071, #2096; PR #2173');
});

it('#2096 retains the advisory structure, status, catalog and results registry', () => {
  const template = readFileSync(new URL('../../../../../docs/advisories/SA-2026-068-provided-torsion-stirrups.md', import.meta.url), 'utf8');
  expect(advisory.match(/^## .+$/gm)).toEqual(template.match(/^## .+$/gm));
  expect(advisory).toContain(`| Status | ${status} |`);
  expect(advisory).toContain(`| Affected versions | Confirmed on main \`${witness.main}\``);
  expect(advisory).toContain('| Fixed release | Pending |');
  const catalog = readFileSync(new URL('../../../../../docs/advisories/README.md', import.meta.url), 'utf8');
  expect(catalog).toContain(`| [SA-2026-071](${filename}) |`);
  expect(catalog).toContain(`| Pending | ${status} |`);
  const index = readFileSync(new URL('../../../../../docs/SAFETY_ADVISORIES.md', import.meta.url), 'utf8');
  expect(index).toContain(`[SA-2026-071](advisories/${filename})`);
  expect(notice.prs).toEqual([2173]);
});

it('#2096 quotes the committed silent-main witnesses without claiming a release replay', () => {
  expect(witness.missingMember.map(v => v.elementId)).toEqual([1]);
  expect(witness.missingStations.map(v => v.t)).toEqual([0, 0.5, 1]);
  for (const record of witness.missingStations) {
    const complete = record.complete.find(v => v.elementId === 2)!;
    const partial = record.returned.find(v => v.elementId === 2)!;
    expect(complete.overallStatus).toBe('fail');
    expect(partial.overallStatus).toBe('ok');
    expect(advisory).toContain(`Mu = ${complete.Mu} kN·m`);
    expect(advisory).toContain(`Mu = ${partial.Mu} kN·m`);
    expect(advisory).toContain(`ratio ${complete.flexure.ratio}`);
    expect(advisory).toContain(`ratio ${partial.flexure.ratio}`);
  }
  expect(advisory).toContain('not a historical release binary replay');
  expect(advisory).toContain('2096-main-partial-witnesses.json');
  expect(advisory).toContain('2096-complete-reference.json');
});
