import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

function read(file: string): string {
  return readFileSync(new URL(`../../../../../${file}`, import.meta.url), 'utf8');
}

const locales = [
  { locale: 'en', file: 'docs/releases/v0.6.0.md', security: 'Security', trusted: /base branch.*pull request commits.*data.*never.*run/i },
  { locale: 'es', file: 'docs/releases/v0.6.0.es.md', security: 'Seguridad', trusted: /rama base.*commits.*datos.*nunca.*ejecutan/i },
  { locale: 'pt', file: 'docs/releases/v0.6.0.pt.md', security: 'Segurança', trusted: /branch base.*commits.*dados.*nunca.*executados/i },
  { locale: 'de', file: 'docs/releases/v0.6.0.de.md', security: 'Sicherheit', trusted: /Basisbranch.*Commits.*Daten.*niemals.*ausgeführt/i },
  { locale: 'fr', file: 'docs/releases/v0.6.0.fr.md', security: 'Sécurité', trusted: /branche de base.*commits.*données.*jamais.*exécutés/i },
  { locale: 'tr', file: 'docs/releases/v0.6.0.tr.md', security: 'Güvenlik', trusted: /taban dal.*commit.*veri.*asla.*çalıştırılmaz/i },
];

it.skip.each([{ file: 'CHANGELOG.md', security: 'Security', trusted: locales[0].trusted }, ...locales])(
  'known wrong result: #2086 $file retains dependency fixes and trusted Revert Check security',
  ({ file, security, trusted }) => {
    const text = file === 'CHANGELOG.md'
      ? read(file).split(/^## /m).find(section => section.startsWith('0.6.0 ('))!
      : read(file);
    const section = text.split(/^###? /m).find(section => section.startsWith(`${security}\n`));
    expect(section).toBeDefined();
    expect(section).toMatch(/quinn-udp[\s\S]*0\.5\.14[\s\S]*0\.5\.16[\s\S]*RUSTSEC-2026-0538/);
    expect(section).toMatch(/rustix[\s\S]*1\.1\.4[\s\S]*1\.1\.6[\s\S]*RUSTSEC-2026-0486/);
    expect(section).toContain('Revert Check (trusted)');
    expect(section).toMatch(trusted);
    if (file === 'CHANGELOG.md') expect(text.indexOf('### Security')).toBeLessThan(text.indexOf('### Added'));
  },
);

const notices = [
  { id: 'plastic-nightly-model-and-candidate-budgets', file: '2026-11-plastic-nightly-model-and-candidate-budgets.md', tr: 'Plastik denge çözülen modelin kimliklerini kullanır; sertifikalar gerçek adaylar için kaynak bütçesi uygular' },
  { id: 'nonlinear-reference-and-initial-shaft-stiffness', file: '2026-11-continuous-settlement-reference.md', tr: 'Oturma referansları ve başlangıç kazık gövdesi rijitliği sürekli kalır' },
  { id: 'planar-corotational-member-equilibrium', file: '2026-11-physical-stage-and-member-equilibrium.md', tr: 'Düzlemsel eleman kesmesi son uç noktaları birleştiren doğru parçasını (kordu) kullanır' },
];

it.skip.each(notices)('known wrong result: #2086 $id preserves engineering meaning in Turkish and shares titles across release locales', ({ id, file, tr }) => {
  const entry = JSON.parse(read(`web/src/lib/provenance/result-changes/${id}.json`));
  expect(entry.title.tr).toBe(tr);
  for (const { locale, file: release } of locales) {
    const rows = read(release).split('\n').filter(line => line.startsWith('|') && line.includes(`../results-changes/${file})`));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(`[${entry.title[locale]}]`);
  }
});

it.skip('known wrong result: #2086 separates the advisory draft history, publication and revision dates', () => {
  const text = read('docs/advisories/SA-2026-061-path-solver-reactions.md');
  expect(text).toMatch(/\| Status \| Draft 2026-11-12; fixed in PR #1952, pending release/);
  expect(text).toContain('| Publication | 2026-11-13; included in 0.6.0 |');
  expect(text).toMatch(/\| Revision \| 2026-11-13:/);
  expect(text).toContain('| Fixed release | 0.6.0 (2026-11-13) |');
});
