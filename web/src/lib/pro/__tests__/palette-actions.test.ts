import { describe, it, expect } from 'vitest';
import { paletteEntries, searchPalette } from '../command-search';
import { paletteActions } from '../palette-actions';
import { proNav } from '../../store/pro-nav.svelte';
import { uiStore } from '../../store';
import { viewState } from '../../store/view-state.svelte';
import { viewCategories } from '../../store/view-categories.svelte';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';

const tr = (d: Record<string, string>) => (k: string) => d[k] ?? k;

describe('the command search beyond the ribbon', () => {
  it('finds the Project tab, view and settings actions by their names, in each language', () => {
    for (const [dict, q, id] of [[es, 'reporte', 'act-report'], [en, 'report', 'act-report'], [es, 'partida', 'act-split'], [en, 'help under', 'act-inline-help'], [es, 'guardar', 'act-save']] as const) {
      const entries = paletteEntries([], tr(dict as Record<string, string>), paletteActions());
      expect(searchPalette(entries, q).map((e) => e.cmd.id), `${q}`).toContain(id);
    }
  });

  it('names every action in the six languages', async () => {
    for (const lang of ['es', 'en', 'pt', 'de', 'fr', 'tr']) {
      const d = (await import(`../../i18n/locales/${lang}.ts`)).default as Record<string, string>;
      for (const a of paletteActions()) {
        expect(d[a.cmd.labelKey], `${lang}: ${a.cmd.labelKey}`).toBeTruthy();
        expect(d[a.pathKey], `${lang}: ${a.pathKey}`).toBeTruthy();
      }
    }
  });

  it('lists a command once, the ribbon first', () => {
    const extra = paletteActions();
    const entries = paletteEntries([{ id: 's', labelKey: 'x', groups: [{ id: 'g', labelKey: 'y', cmds: [extra[0]!.cmd] }] }] as never, (k) => k, extra);
    expect(entries.filter((e) => e.cmd.id === extra[0]!.cmd.id)).toHaveLength(1);
    expect(entries[0]!.path).toBe('x › y');
  });

  it('runs as the buttons do', () => {
    const run = (id: string) => paletteActions().find((a) => a.cmd.id === id)!.cmd.action!();
    run('act-save');
    expect(proNav.request).toBe('save');
    expect(uiStore.proActiveTab).toBe('project');
    expect(proNav.takeRequest()).toBe('save');
    expect(proNav.request).toBeNull();
    run('act-split');
    expect(viewState.split).toBe(true);
    run('act-split');
    viewCategories.set('loads', 'hidden');
    run('act-show-all');
    expect(viewCategories.anyChanged).toBe(false);
  });
});
