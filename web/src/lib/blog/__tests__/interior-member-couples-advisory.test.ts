import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findPost } from '..';
import notice from '../../provenance/result-changes/interior-member-couples.json';
import recoveryNotice from '../../provenance/result-changes/member-recovery-round4.json';
import huBody from '../translations/hu/safety-advisories';
import type { PublicLocale } from '../../i18n/store.svelte';

const advisoryFile = 'SA-2026-070-interior-member-couples.md';
const readAdvisory = (file: string) => readFileSync(new URL(`../../../../../docs/advisories/${file}`, import.meta.url), 'utf8');

describe('SA-2026-070 interior member recovery', () => {
  it.each<[PublicLocale, string, string]>([
    ['en', 'High', 'Fixed in 0.6.2'],
    ['es', 'Alta', 'Corregido en 0.6.2'],
    ['pt', 'Alta', 'Corrigido em 0.6.2'],
    ['de', 'Hoch', 'Behoben in 0.6.2'],
    ['fr', 'Élevée', 'Corrigé dans 0.6.2'],
    ['tr', 'Yüksek', '0.6.2 sürümünde düzeltildi'],
  ])('%s lists the released fix in the catalog, status, link and saved-project notice', checkAdvisory);

  it('known wrong result: #2099 — hu lists the interior recovery advisory and saved-project notice', () => {
    checkAdvisory('hu', 'Magas', 'Javítva a 0.6.2 verzióban');
  });

  function checkAdvisory(locale: PublicLocale, severity: string, status: string) {
    const post = findPost('safety-advisories')!;
    const blocks = (locale === 'hu' ? huBody : post.i18n[locale]!).blocks;
    const table = blocks.find(b => b.k === 'table');
    if (table?.k !== 'table') throw new Error('Missing advisory table');
    const rows = table.rows.filter(r => r[0] === 'SA-2026-070');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slice(2)).toEqual([severity, status]);
    expect(rows[0]![1]).toContain('#2143');
    expect(blocks.some(b => b.k === 'note' && b.t === `SA-2026-070 — ${status}.`)).toBe(true);
    expect(blocks.some(b => b.k === 'ext' && b.label === 'SA-2026-070' && b.href.endsWith(`/docs/advisories/${advisoryFile}`))).toBe(true);
    expect((notice.title as Record<string, string>)[locale]?.trim()).toBeTruthy();
    expect((notice.explanation as Record<string, string>)[locale]).toContain('SA-2026-070');
  }

  it('known wrong result: #2099 — Hungarian recovery wording preserves the engineering scope and actions', () => {
    const table = huBody.blocks.find(b => b.k === 'table');
    if (table?.k !== 'table') throw new Error('Missing advisory table');
    const row = table.rows.find(r => r[0] === 'SA-2026-070');
    expect(row).toBeDefined();
    const explanation = (notice.explanation as Record<string, string>).hu;
    expect(explanation).toBeDefined();
    for (const phrase of ['lehajlás', 'elfordulás', 'rúd belsejében ható koncentrált erőpárokat', 'deformált alak', 'használhatósági', 'teljes és részleges trapéz', 'EI']) {
      expect(row![1]).toContain(phrase);
    }
    for (const phrase of ['rúd belsejében ható koncentrált erőpárokat', 'deformált alak', 'elmozdulás és elfordulás', 'csomóponti elmozdulások és a rúdigénybevételek nem változnak', 'elutasítja', '#2143', 'SA-2026-070']) {
      expect(explanation).toContain(phrase);
    }
    expect((notice.title as Record<string, string>).hu).toContain('rúdon belüli lehajlás');
  });

  it('known wrong result: #2099 — Hungarian round-4 notice retains shear rigidity, spatial stiffness and review actions', () => {
    expect((recoveryNotice.title as Record<string, string>).hu?.trim()).toBeTruthy();
    const explanation = (recoveryNotice.explanation as Record<string, string>).hu;
    for (const phrase of ['nyírási merevség', 'véges pozitív hajlítási merevség', 'Rust', 'globális koordináták', 'lehajlásokat', 'elfordulásokat', 'használhatóságot', 'csomóponti megoldások', 'tanúsítvány korlátai', '#2143', '#2170']) {
      expect(explanation).toContain(phrase);
    }
  });

  it('retains the reference structure and records the fixed release without claiming a historical replay', () => {
    const text = readAdvisory(advisoryFile);
    const reference = readAdvisory('SA-2026-068-provided-torsion-stirrups.md');
    expect(text.match(/^## .+$/gm)).toEqual(reference.match(/^## .+$/gm));
    const fields = (s: string) => [...s.matchAll(/^\| ([^|]+) \|/gm)].map(m => m[1]);
    expect(fields(text)).toEqual(fields(reference));
    expect(text).toContain('| Severity | High |');
    expect(text).toContain('Published 2026-11-18; drafted 2026-11-15');
    expect(text).toContain('| Fixed release | 0.6.2 |');
    expect(text).toContain('44966b6e75f72ce268ec87798d5cd880a6dba144');
    expect(readAdvisory('README.md')).toContain(`[SA-2026-070](${advisoryFile})`);
    expect(notice.prs).toEqual([2170]);
    expect(notice.when).toEqual({ all: ['members', 'memberLoads'] });
  });

  it('discloses the witness, trapezoid and missing-EI behavior, and the check consumers', () => {
    const text = readAdvisory(advisoryFile);
    for (const evidence of [
      '−3.6e−6 m', 'partial trapezoid', 'full trapezoid', 'missing', 'nonfinite', '1e-6',
      'serviceability checks consumed', 'No strength design check consumed',
      'service-deflection.ts', 'serviceability.ts', '2D', '3D', 'education',
      'not a bound', 'historical release binaries',
    ]) expect(text).toContain(evidence);
  });
});
