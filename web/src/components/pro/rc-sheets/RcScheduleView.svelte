<script lang="ts">
  /** The project's bending schedule: every piece the sheets place, a sketch per row, the summary by diameter with waste and by family. */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { MARK_SCOPES, type MarkScope } from '../../../lib/rc-sheets/types';
  import { kindKey } from '../../../lib/rc-sheets/schedule/exports';
  import { downloadSchedule, scheduleSettings, setScheduleSettings, sheetsSchedule } from '../../../lib/store/rc-sheets-schedule';
  import type { SheetRows } from '../../../lib/store/rc-sheets.svelte';
  import { modelStore } from '../../../lib/store';
  import RcBarSketch from './RcBarSketch.svelte';

  let { rows }: { rows: SheetRows } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const settings = $derived.by(() => { void modelStore.designData; return scheduleSettings(); });
  const s = $derived.by(() => { void settings; return sheetsSchedule(rows); });
  const pct = $derived(fmt(settings.waste * 100, 0));

  function onWaste(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(v)) setScheduleSettings({ waste: v / 100 });
  }
</script>

<section class="rcs-bbs" data-testid="rc-schedule-view">
  <div class="bar">
    <label>{t('rcSheets.bbs.scope')}
      <select value={settings.scope} onchange={(e) => setScheduleSettings({ scope: e.currentTarget.value as MarkScope })} data-testid="rc-bbs-scope">
        {#each MARK_SCOPES as sc (sc)}<option value={sc}>{t(`rcSheets.bbs.scope.${sc}`)}</option>{/each}
      </select>
    </label>
    <label>{t('rcSheets.bbs.waste')}
      <input type="number" min="0" max="50" step="1" value={Math.round(settings.waste * 1000) / 10} onchange={onWaste} data-testid="rc-bbs-waste" />
    </label>
    <button type="button" class="rcs-btn" title={t('rcSheets.bbs.csvTitle')} onclick={() => downloadSchedule(rows, 'csv', t)} disabled={!s.rows.length} data-testid="rc-bbs-csv">{t('rcSheets.bbs.csv')}</button>
    <button type="button" class="rcs-btn" title={t('rcSheets.bbs.bvbsTitle')} onclick={() => downloadSchedule(rows, 'bvbs', t)} disabled={!s.rows.length} data-testid="rc-bbs-bvbs">{t('rcSheets.bbs.bvbs')}</button>
  </div>
  {#if !s.rows.length}
    <p class="dim" data-testid="rc-bbs-empty">{t('rcSheets.bbs.empty')}</p>
  {:else}
    <table class="tbl" data-testid="rc-bbs-table">
      <thead><tr>
        <th>{t('rcSheets.bbs.element')}</th><th>{t('rcSheets.col.level')}</th><th>{t('rcSheets.bbs.mark')}</th><th>Ø</th><th>{t('rcSheets.bbs.kind')}</th>
        <th class="n">{t('rcSheets.bbs.perElement')}</th><th class="n">{t('rcSheets.bbs.equal')}</th><th class="n">{t('rcSheets.bbs.total')}</th>
        <th>{t('rcSheets.bbs.shape')}</th><th class="n">{t('rcSheets.bbs.unitLength')}</th><th class="n">{t('rcSheets.bbs.totalLength')}</th><th class="n">kg</th>
      </tr></thead>
      <tbody>
        {#each s.rows as r, i (i)}
          <tr data-testid="rc-bbs-row" data-family={r.family}>
            <td class="nm">{r.element}</td><td>{r.level ?? ''}</td>
            <td class="mk">{r.mark}{#if r.elevation.length}<small> = {r.elevation.filter((m) => m !== r.mark).join(' = ')}</small>{/if}</td>
            <td>{r.dia}</td><td>{t(kindKey(r.kind))}</td>
            <td class="n">{r.perElement}</td><td class="n">{r.equal}</td><td class="n">{r.total}</td>
            <td class="sk"><RcBarSketch shape={r.shape} /></td>
            <td class="n">{fmt(r.unitLength, 2)}{#if r.long}<span class="warn" title={t('rcSheets.bbs.long')}> ⚠</span>{/if}</td>
            <td class="n">{fmt(r.totalLength, 2)}</td><td class="n">{fmt(r.kg, 1)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="sums">
      <table class="tbl" data-testid="rc-bbs-by-dia">
        <caption>{t('rcSheets.bbs.byDiameter')}</caption>
        <thead><tr><th>Ø</th><th class="n">{t('rcSheets.bbs.totalLength')}</th><th class="n">{t('rcSheets.bbs.stockBars')}</th><th class="n">kg</th><th class="n">kg + {pct} %</th></tr></thead>
        <tbody>
          {#each s.byDiameter as d (d.dia)}
            <tr><td>Ø{d.dia}</td><td class="n">{fmt(d.length, 1)}</td><td class="n">{d.stockBars}</td><td class="n">{fmt(d.kg, 1)}</td><td class="n">{fmt(d.withWaste, 1)}</td></tr>
          {/each}
          <tr class="tot" data-testid="rc-bbs-total"><td>{t('rcSheets.bbs.sum')}</td><td class="n">{fmt(s.total.length, 1)}</td><td></td><td class="n">{fmt(s.total.kg, 1)}</td><td class="n">{fmt(s.total.withWaste, 1)}</td></tr>
        </tbody>
      </table>
      <table class="tbl" data-testid="rc-bbs-by-family">
        <caption>{t('rcSheets.bbs.byFamily')}</caption>
        <thead><tr><th></th><th class="n">kg</th><th class="n">kg + {pct} %</th></tr></thead>
        <tbody>
          {#each s.byFamily as f (f.family)}
            <tr><td>{t(`rcSheets.family.${f.family}`)}</td><td class="n">{fmt(f.kg, 1)}</td><td class="n">{fmt(f.withWaste, 1)}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="dim">{tp('rcSheets.bbs.legsNote', { clause: s.clause })}</p>
    {#if s.confirm}<p class="dim warn" data-testid="rc-bbs-confirm">{t(s.confirm)}</p>{/if}
  {/if}
</section>

<style>
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 0.72rem; color: var(--st-text-2); }
  .bar label { display: flex; align-items: center; gap: 4px; }
  .bar select, .bar input { font-size: 0.72rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 4px; }
  .bar input { width: 4.5em; }
  .rcs-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
  .rcs-btn:disabled { opacity: 0.5; cursor: default; }
  .tbl { border-collapse: collapse; font-size: 0.72rem; margin-bottom: 10px; }
  caption { text-align: left; font-weight: 600; color: var(--st-text-2); padding: 2px 0 4px; }
  th { position: sticky; top: 0; background: var(--st-surface-2); text-align: left; font-weight: 600; color: var(--st-text-2); padding: 4px 6px; border-bottom: 1px solid var(--st-hair); white-space: nowrap; }
  td { padding: 2px 6px; border-bottom: 1px solid var(--st-hair); white-space: nowrap; vertical-align: middle; }
  .n { text-align: right; font-family: var(--st-mono); }
  .nm { font-weight: 600; }
  .mk { font-weight: 600; font-family: var(--st-mono); }
  .mk small { font-weight: 400; color: var(--st-text-3); }
  .sk { padding: 1px 4px; }
  .tot td { font-weight: 600; }
  .sums { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  .dim { font-size: 0.7rem; color: var(--st-text-3); max-width: 90ch; margin: 4px 0; }
  .warn { color: var(--st-warn); }
</style>
