import mergedValueAudit from '../../../../../docs/results-changes/1952-main-merge-values.json';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findPost } from '..';
import type { PublicLocale } from '../../i18n/store.svelte';

const advisoryUrl = new URL('../../../../../docs/advisories/SA-2026-061-path-solver-reactions.md', import.meta.url);
const replayUrl = new URL('../../../../../docs/advisories/replays/SA-2026-061.json', import.meta.url);

describe('safety-advisories SA-2026-061', () => {
  it('known wrong result: #1952 — distinguishes the advisory draft date from the post revision', () => {
    const text = readFileSync(advisoryUrl, 'utf8');
    const draftDate = text.match(/\| Status \| Draft (\d{4}-\d{2}-\d{2});/)?.[1];
    expect(draftDate).toBe('2026-11-12');
    expect(findPost('safety-advisories')!.updated).toBe('2026-11-21');
  });

  it.each<[PublicLocale, string, string]>([
    ['en', 'High', 'Fixed in PR #1952, pending release'],
    ['es', 'Alta', 'Corregido en PR #1952, pendiente de publicación'],
    ['pt', 'Alta', 'Corrigido no PR #1952, aguardando publicação'],
    ['de', 'Hoch', 'Behoben in PR #1952, Veröffentlichung ausstehend'],
    ['fr', 'Élevée', 'Corrigé dans PR #1952, publication en attente'],
    ['tr', 'Yüksek', 'PR #1952 içinde düzeltildi, yayın bekleniyor'],
  ])('known wrong result: #1952 — %s lists the high-severity pending fix in both summary and status', (locale, severity, status) => {
    const post = findPost('safety-advisories')!;
    const blocks = post.i18n[locale]!.blocks;
    const summary = blocks.find((b) => b.k === 'table');
    expect(summary?.k).toBe('table');
    if (summary?.k !== 'table') throw new Error('Missing advisory table');
    const rows = summary.rows.filter((r) => r[0] === 'SA-2026-061');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slice(2)).toEqual([severity, status]);
    expect(blocks.some((b) => b.k === 'note' && b.t === `SA-2026-061 — ${status}.`)).toBe(true);
  });

  it.each([2, 3])('known wrong result: #1952 — %iD determined replay retains answers without withholding notices', dim => {
    const replay = JSON.parse(readFileSync(replayUrl, 'utf8'));
    const record = replay.records.find((r: { id: string }) => r.id === `staged-${dim}d-determined`);
    expect(record.after.reactions).toHaveLength(1);
    expect(record.after.displacements).toHaveLength(2);
    expect(record.after.elementForces).toEqual([]);
    expect(record.after.notices).toEqual([]);
  });

  it('known wrong result: #1952 — documents the replay scalar count from the value audit', () => {
    const artifacts = mergedValueAudit.artifacts
      .filter(a => a.file === 'docs/advisories/replays/SA-2026-061.json');
    for (const artifact of artifacts) {
      expect(new Set(artifact.changes.map(c => c.path)).size).toBe(artifact.changes.length);
      for (const change of artifact.changes) expect(change.before).not.toBe(change.after);
    }
    const counts = artifacts.map(a => a.changes.length);
    const count = counts.reduce((sum, n) => sum + n, 0);
    const text = readFileSync(new URL('../../../../../docs/results-changes/2026-11-merged-nonlinear-recovery.md', import.meta.url), 'utf8');
    expect(text).toContain(`and ${count} replay scalars (${counts.join(' + ')} = ${count}).`);
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

describe('safety-advisories SA-2026-092', () => {
  it.each<[PublicLocale, string, string, string]>([
    ['en', '4.5697 MPa total shear and 7.9149 MPa von Mises', 'signed shear sum is 6.4625 MPa', 'von Mises stress is 11.1934 MPa, which exceeds the 9 MPa yield strength'],
    ['es', '4,5697 MPa de corte total y 7,9149 MPa de tensión de von Mises', 'suma con signo de las tensiones de corte es de 6,4625 MPa', 'tensión de von Mises correspondiente es de 11,1934 MPa y supera el límite de fluencia de 9 MPa'],
    ['pt', '4,5697 MPa de tensão de cisalhamento total e 7,9149 MPa de tensão de von Mises', 'soma com sinal das tensões de cisalhamento é de 6,4625 MPa', 'tensão de von Mises correspondente é de 11,1934 MPa e supera o limite de escoamento de 9 MPa'],
    ['de', '4,5697 MPa Gesamtschubspannung und 7,9149 MPa von-Mises-Spannung', 'vorzeichenrichtige Summe der Schubspannungen 6,4625 MPa', 'zugehörige von-Mises-Spannung von 11,1934 MPa überschreitet die Streckgrenze von 9 MPa'],
    ['fr', '4,5697 MPa de cisaillement total et 7,9149 MPa de contrainte de von Mises', 'somme algébrique des contraintes de cisaillement vaut 6,4625 MPa', 'contrainte de von Mises correspondante vaut 11,1934 MPa et dépasse la limite d’élasticité de 9 MPa'],
    ['tr', 'toplam kayma gerilmesini 4,5697 MPa, von Mises gerilmesini 7,9149 MPa', 'kayma gerilmelerinin işaretli toplamı 6,4625 MPa', 'karşılık gelen von Mises gerilmesi 11,1934 MPa olup 9 MPa akma sınırını aşar'],
    ['hu', 'eredő nyírófeszültség 4,5697 MPa, a von Mises-feszültség 7,9149 MPa', 'nyírófeszültségek előjeles összege 6,4625 MPa', 'hozzá tartozó 11,1934 MPa-os von Mises-feszültség meghaladja a 9 MPa-os folyáshatárt'],
    ['zh', '总剪应力为 4.5697 MPa，von Mises 等效应力为 7.9149 MPa', '剪应力的带符号和为 6.4625 MPa', '对应的 von Mises 等效应力为 11.1934 MPa，超过 9 MPa 的屈服强度'],
  ])('known wrong result: #2366 — %s compares von Mises stress with yield strength', (locale, oldStresses, signedShear, vonMisesVersusYield) => {
    const post = findPost('safety-advisories')!;
    const workedExample = post.i18n[locale]?.blocks.find(b => b.k === 'ext' && b.label === 'SA-2026-092');
    if (workedExample?.k !== 'ext') throw new Error(`${locale}: missing thin-tube example`);
    expect(workedExample.t).toContain(signedShear);
    expect(workedExample.t).toContain(vonMisesVersusYield);
    expect(workedExample.t).toContain(oldStresses);
  });
});

const releaseRangeLocales = ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'zh'] as const;

it.skip('known wrong result: #2595 — release range checks cover every published advisory translation', () => {
  expect([...releaseRangeLocales].sort()).toEqual(Object.keys(findPost('safety-advisories')!.i18n).sort());
});

it.each(releaseRangeLocales)('known wrong result: #2595 — %s dates the first two advisory ranges to their releases', locale => {
  const blocks = findPost('safety-advisories')!.i18n[locale]!.blocks;
  const note = blocks.find(block => block.k === 'note')!;
  expect(note.t).toMatch(/SA-2026-001.{1,12}004.{1,60}0\.2\.0.{1,30}SA-2026-005.{1,12}020.{1,60}0\.3\.0/);
});
