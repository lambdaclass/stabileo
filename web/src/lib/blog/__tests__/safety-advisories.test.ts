import mergedValueAudit from '../../../../../docs/results-changes/1952-main-merge-values.json';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findPost } from '..';
import type { PublicLocale } from '../../i18n/store.svelte';

const advisoryUrl = new URL('../../../../../docs/advisories/SA-2026-061-path-solver-reactions.md', import.meta.url);
const replayUrl = new URL('../../../../../docs/advisories/replays/SA-2026-061.json', import.meta.url);

describe('safety-advisories SA-2026-061', () => {
  it.each<[PublicLocale, string, string]>([
    ['en', 'High', 'Fixed in PR #1952, pending release'],
    ['es', 'Alta', 'Corregido en PR #1952, pendiente de publicación'],
    ['pt', 'Alta', 'Corrigido no PR #1952, aguardando publicação'],
    ['de', 'Hoch', 'Behoben in PR #1952, Veröffentlichung ausstehend'],
    ['fr', 'Élevée', 'Corrigé dans PR #1952, publication en attente'],
    ['tr', 'Yüksek', 'PR #1952 içinde düzeltildi, yayın bekleniyor'],
  ])('%s lists the high-severity pending fix in both summary and status', (locale, severity, status) => {
    const post = findPost('safety-advisories')!;
    const blocks = post.i18n[locale]!.blocks;
    const summary = blocks.find((b) => b.k === 'table');
    expect(summary?.k).toBe('table');
    if (summary?.k !== 'table') throw new Error('Missing advisory table');
    const rows = summary.rows.filter((r) => r[0] === 'SA-2026-061');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slice(2)).toEqual([severity, status]);
    expect(blocks.some((b) => b.k === 'note' && b.t === `SA-2026-061 — ${status}.`)).toBe(true);
    expect(post.updated).toBe('2026-11-12');
  });

  it('retains silent main path omissions and a correct linear control in the replay', () => {
    const replay = JSON.parse(readFileSync(replayUrl, 'utf8'));
    expect(replay.advisory).toBe('SA-2026-061');
    expect(replay.fixingPr).toBe(1952);
    const record = (id: string) => replay.records.find((r: { id: string }) => r.id === id);
    for (const id of ['frozen-arch-0015ab84c3baa36f', 'frozen-arch-022317310499426d', 'arc-member-loads', 'displacement-member-loads']) {
      const r = record(id);
      expect(r.before.converged).toBe(true);
      expect(r.before.reactions).toEqual([]);
      expect(r.before.notices.every((n: { value: unknown[] }) => n.value.length === 0)).toBe(true);
      expect(r.after.reactions.length).toBeGreaterThan(0);
      const audited = mergedValueAudit.artifacts
        .filter(a => a.file === 'docs/advisories/replays/SA-2026-061.json' && a.record === id)
        .flatMap(a => a.changes).filter(c => c.path === '$.finalLoadFactor');
      if (id === 'displacement-member-loads') {
        expect(audited).toHaveLength(1);
        expect(r.before.finalLoadFactor).toBe(audited[0]!.before);
        expect(r.after.finalLoadFactor).toBe(audited[0]!.after);
      } else {
        expect(audited).toEqual([]);
        expect(r.after.finalLoadFactor).toBe(r.before.finalLoadFactor);
      }
    }
    const control = record('linear-member-loads');
    expect(control.before.elementForces).toEqual(control.after.elementForces);
    expect(control.before.reactions).toEqual(control.after.reactions);
    for (const id of ['arc-member-loads', 'displacement-member-loads']) {
      const r = record(id);
      const before = r.before.elementForces.find((f: { elementId: number }) => f.elementId === 1000);
      const after = r.after.elementForces.find((f: { elementId: number }) => f.elementId === 1000);
      expect(Math.abs(r.before.finalLoadFactor - 1)).toBeGreaterThan(0.1);
      expect(before.vStart).not.toBe(after.vStart);
      for (const [key, value] of Object.entries(r.oracle.unitLoadEndForces)) {
        expect(Math.abs(after[key] - (value as number) * r.after.finalLoadFactor)).toBeLessThan(1e-9);
      }
    }
  });

  it('documents release boundaries, unavailable dynamic quantities and the fixing PR', () => {
    const text = readFileSync(advisoryUrl, 'utf8');
    expect(text).toContain('Draft 2026-11-12; fixed in PR #1952, pending release');
    expect(text).toContain('1d4a76138');
    expect(text).toContain('3fc207b60');
    expect(text).toContain('0.2.0–0.5.0');
    expect(text).toContain('not uniformly diagnostic-free');
    expect(text).toContain('not recovery of total dynamic forces');
    expect(text).toContain('replays/SA-2026-061.json');
  });
});
