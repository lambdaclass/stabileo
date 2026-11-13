import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findPost } from '..';
import notice from '../../provenance/result-changes/steel-cb-combination.json';
import type { PublicLocale } from '../../i18n/store.svelte';

const text = readFileSync(new URL('../../../../../docs/advisories/SA-2026-064-steel-cb-combination.md', import.meta.url), 'utf8');
const replay = JSON.parse(readFileSync(new URL('../../../../../docs/advisories/replays/SA-2026-064.json', import.meta.url), 'utf8'));

describe('SA-2026-064 steel combination Cb', () => {
  it.each<[PublicLocale, string, string]>([
    ['en', 'High', 'Fixed in PR #2080, pending release'],
    ['es', 'Alta', 'Corregido en PR #2080, pendiente de publicación'],
    ['pt', 'Alta', 'Corrigido no PR #2080, aguardando lançamento'],
    ['de', 'Hoch', 'In PR #2080 behoben, Veröffentlichung ausstehend'],
    ['fr', 'Élevée', 'Corrigé dans PR #2080, publication en attente'],
    ['tr', 'Yüksek', 'PR #2080 içinde düzeltildi, yayın bekleniyor'],
  ])('%s retains the high-severity pending fix in summary, status and saved-project notice', (locale, severity, status) => {
    const post = findPost('safety-advisories')!;
    const blocks = post.i18n[locale]!.blocks;
    const summary = blocks.find(b => b.k === 'table');
    if (summary?.k !== 'table') throw new Error('Missing advisory table');
    const rows = summary.rows.filter(r => r[0] === 'SA-2026-064');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slice(2)).toEqual([severity, status]);
    expect(rows[0]![1]).toContain('Cb');
    expect(blocks.some(b => b.k === 'note' && b.t === `SA-2026-064 — ${status}.`)).toBe(true);
    expect(notice.explanation[locale]).toContain('SA-2026-064');
    expect(post.updated).toBe('2026-11-13');
  });

  it('retains a silent certified understatement and distinguishes the warned failure-side case', () => {
    expect(replay.advisory).toBe('SA-2026-064');
    expect(replay.fixingPr).toBe(2080);
    expect(replay.mainSource).toBe('b6f13f2500d700adecc48a974d7298f527e3388b');
    expect(replay.fixedSource).toBe('8a28989f34e11bc7fe7118471e4027d51a50bfeb');
    expect(replay.records).toHaveLength(2);
    const [silent, warned] = replay.records;
    expect(silent.oracle).toEqual({ axialFraction: 0.4, momentFraction: 0.5, utilization: 0.4 + (8 / 9) * 0.5 });
    expect(silent.before.interaction.ratio).toBe(0.6864197530864198);
    expect(silent.before.overallStatus).toBe('ok');
    expect(silent.before).not.toHaveProperty('diagnostics');
    expect(silent.before.engineRecheck).toMatchObject({ certified: true, certifiedOk: true, disagrees: false, unavailable: false });
    expect(silent.after.interaction.ratio).toBe(silent.oracle.utilization);
    expect(silent.after.overallStatus).toBe('ok');
    expect(warned.oracle).toEqual({ axialFraction: 0.4, momentFraction: 0.7, utilization: 0.4 + (8 / 9) * 0.7 });
    expect(warned.before.interaction.ratio).toBe(0.812);
    expect(warned.before.overallStatus).toBe('ok');
    expect(warned.before.diagnostics).toContainEqual(expect.objectContaining({ code: 'VERIF_STEEL_FAIL_INTERACTION', severity: 'error' }));
    expect(warned.after.interaction.ratio).toBe(warned.oracle.utilization);
    expect(warned.after.overallStatus).toBe('fail');
    expect(warned.after.engineRecheck.certifiedOk).toBe(false);
    expect(text).toContain('**not silent**');
    for (const record of replay.records) {
      expect(text).toContain(String(record.before.interaction.ratio));
      expect(text).toContain(String(record.after.interaction.ratio));
      expect(record.singleCombinationControls.after.map((r: { interaction: { ratio: number } }) => r.interaction.ratio))
        .toEqual(record.singleCombinationControls.before.map((r: { interaction: { ratio: number } }) => r.interaction.ratio));
      expect(record.singleCombinationControls.before[0].interaction.ratio).toBe(record.oracle.utilization);
    }
  });

  it('retains commit evidence for every available release tag without claiming historical binary replays', () => {
    expect(replay.introductionCommit).toBe('bb15c29416539c95c05ec1f478993eff577e2dc1');
    expect(text).toContain(replay.introductionCommit);
    expect(replay.releaseTags.map((tag: { tag: string }) => tag.tag).sort()).toEqual([
      'desktop-v0.1.0-alpha.1', 'desktop-v0.1.0-alpha.2', 'desktop-v0.1.0-alpha.3',
      'v0.2.0', 'v0.3.0', 'v0.4.0', 'v0.5.0',
    ]);
    for (const tag of replay.releaseTags) {
      expect(tag.containsIntroduction).toBe(true);
      expect(text).toContain(tag.commit);
      for (const lines of Object.values(tag.sourceEvidence)) expect(lines).not.toEqual([]);
    }
    expect(text).toContain('not a replay of historical release binaries');
    expect(text).toContain('Draft 2026-11-13; fixed in PR #2080, pending release');
  });

  it('limits the saved-project notice to CIRSOC 301 steel interaction checks', () => {
    expect(notice.area).toBe('design');
    expect(notice.when).toEqual({ any: ['steelCirsoc301'] });
    expect(notice.prs).toEqual([2080]);
    expect(notice.date).toBe('2026-11-13');
    expect(text).toContain('**re-run steel design checks**');
    expect(text).toContain('replays/SA-2026-064.json');
  });
});
