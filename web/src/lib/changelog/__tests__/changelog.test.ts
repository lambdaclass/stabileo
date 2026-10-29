import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHANGELOG,
  CHANGELOG_AREAS,
  AREA_LABELS,
  changeStamp,
  formatChangeWhen,
  changelogByMonth,
  entryAreas,
  formatChangeDate,
  formatChangeMonth,
  itemsByArea,
} from '..';
import { findStandingPage } from '../../blog/pages';

const LOCALES = ['es', 'en', 'pt', 'de', 'fr', 'tr'] as const;
const changelogPage = findStandingPage('/changelog')!;
const SCREENSHOTS = resolve(__dirname, '../../../../public/screenshots');

describe('the changelog', () => {
  it('runs newest first: a month at a time from February to May, then one entry per weekly report on its Friday', () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
    expect(CHANGELOG.at(-1)!.date).toBe('2026-02-01');
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [y, m, d] = entry.date.split('-').map(Number);
      if (entry.period === 'month') {
        expect(d, entry.date).toBe(1);
        expect(entry.date < '2026-06-01', entry.date).toBe(true);
      } else {
        expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay(), entry.date).toBe(5);
        expect(entry.date >= '2026-06-01', entry.date).toBe(true);
      }
    }
  });

  it('says the same in every language: one item per area, with a title and no empty line', () => {
    for (const entry of CHANGELOG) {
      expect(entry.areas.length, entry.date).toBeGreaterThan(0);
      for (const area of entry.areas) expect(CHANGELOG_AREAS).toContain(area);
      for (const l of LOCALES) {
        const body = entry.i18n[l];
        expect(body.title.trim(), `${entry.date} ${l}`).not.toBe('');
        expect(body.items, `${entry.date} ${l}`).toHaveLength(entry.areas.length);
        for (const item of body.items) expect(item.trim().length, `${entry.date} ${l}`).toBeGreaterThan(10);
      }
    }
  });

  it('follows the editorial style: no dashes as asides and no angle quotes', () => {
    const text = JSON.stringify(CHANGELOG);
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/[«»]/);
  });

  it('points only at screenshots that exist, at both widths and in both formats, with alt text', () => {
    for (const entry of CHANGELOG) {
      if (!entry.shot) continue;
      for (const w of [800, 1600]) {
        for (const ext of ['avif', 'webp']) {
          const file = `${entry.shot.base}-${w}.${ext}`;
          expect(existsSync(resolve(SCREENSHOTS, file)), file).toBe(true);
        }
      }
      for (const l of LOCALES) expect(entry.shot.alt[l].trim(), `${entry.date} ${l}`).not.toBe('');
    }
  });

  it('labels every area in every language', () => {
    for (const l of LOCALES) for (const area of CHANGELOG_AREAS) expect(AREA_LABELS[l][area].trim()).not.toBe('');
  });

  it('formats a calendar day without moving it across time zones', () => {
    expect(formatChangeDate('2026-10-23', 'es')).toBe('23 de octubre de 2026');
    expect(formatChangeDate('2026-10-23', 'en')).toBe('October 23, 2026');
    expect(formatChangeDate('2026-10-23', 'de')).toBe('23. Oktober 2026');
    expect(formatChangeDate('2026-10-23', 'fr')).toBe('23 octobre 2026');
    expect(formatChangeDate('2026-10-23', 'tr')).toBe('23 Ekim 2026');
  });
});

describe('the changelog page', () => {
  it('is dated with the newest entry, so the sitemap moves with it', () => {
    expect(changelogPage.updated).toBe(CHANGELOG[0].date);
  });

  it('is drawn by its own view, with no article blocks or questions to keep in step', () => {
    expect(changelogPage.view).toBe('changelog');
    for (const l of LOCALES) {
      expect(changelogPage.i18n[l]!.blocks).toEqual([]);
      expect(changelogPage.i18n[l]!.faq).toEqual([]);
    }
  });
});

describe('the changelog helpers', () => {
  const entry = CHANGELOG.find((e) => e.date === '2026-09-25')!;

  it('groups the items under their areas, in the order the areas first appear, losing none', () => {
    expect(entryAreas(entry)).toEqual(['site', 'basic', 'edu', 'pro', 'engine']);
    for (const l of LOCALES) {
      const groups = itemsByArea(entry, l);
      expect(groups.map((g) => g.area)).toEqual(entryAreas(entry));
      expect(groups.flatMap((g) => g.items)).toEqual(entry.i18n[l].items);
      expect(groups[1].items).toEqual(entry.i18n[l].items.slice(2, 5));
    }
  });

  it('splits the history into months, newest first, keeping every week', () => {
    const months = changelogByMonth(CHANGELOG);
    expect(months.map((m) => m.key)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-04', '2026-03', '2026-02']);
    expect(months.flatMap((m) => m.entries)).toEqual(CHANGELOG);
    expect(months[0].entries.map((e) => e.date)).toEqual(['2026-10-23', '2026-10-16', '2026-10-09', '2026-10-02']);
  });

  it('names the day and the month for a week, and the month alone for a monthly entry', () => {
    const week = CHANGELOG.find((e) => e.date === '2026-10-02')!;
    const month = CHANGELOG.find((e) => e.date === '2026-03-01')!;
    expect(changeStamp(week, 'es')).toEqual({ big: '2', small: 'oct' });
    expect(changeStamp(month, 'en')).toEqual({ big: 'Mar', small: null });
    expect(formatChangeWhen(week, 'es')).toBe('2 de octubre de 2026');
    expect(formatChangeWhen(month, 'es')).toBe('Marzo de 2026');
    expect(formatChangeMonth('2026-10-01', 'en')).toBe('October 2026');
    expect(formatChangeMonth('2026-10-01', 'pt')).toBe('Outubro de 2026');
    expect(formatChangeMonth('2026-02-01', 'es', { capitalize: false })).toBe('febrero de 2026');
    expect(changeStamp(week, 'fr')).toEqual({ big: '2', small: 'oct' });
    expect(changeStamp(week, 'de')).toEqual({ big: '2', small: 'Okt' });
    expect(changeStamp(month, 'tr')).toEqual({ big: 'Mar', small: null });
    expect(formatChangeMonth('2026-10-01', 'fr')).toBe('Octobre 2026');
    expect(formatChangeMonth('2026-02-01', 'fr', { capitalize: false })).toBe('février 2026');
    expect(formatChangeMonth('2026-02-01', 'tr')).toBe('Şubat 2026');
    expect(formatChangeMonth('2026-10-01', 'de')).toBe('Oktober 2026');
  });
});
