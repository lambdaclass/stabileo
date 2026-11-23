<script lang="ts">
  /** The project's bending schedule in the view chosen at its top, groups folding, every element a link to its sheet, then the sums by diameter with waste and by family. */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { MARK_SCOPES, type MarkScope } from '../../../lib/rc-sheets/types';
  import { kindKey } from '../../../lib/rc-sheets/schedule/exports';
  import { SCHEDULE_VIEWS, scheduleView, type BarUse, type ElementRef, type ScheduleView, type ViewGroup, type ViewRow } from '../../../lib/rc-sheets/schedule/views';
  import { downloadSchedule, scheduleSettings, scheduleViewChoice, setScheduleSettings, setScheduleViewChoice, sheetsSchedule } from '../../../lib/store/rc-sheets-schedule';
  import type { SheetRows } from '../../../lib/store/rc-sheets.svelte';
  import { modelStore } from '../../../lib/store';
  import RcBarSketch from './RcBarSketch.svelte';
  import RcExportLog from './RcExportLog.svelte';
  import { sheetsStale } from '../../../lib/store/rc-sheets-view.svelte';

  let { rows, onopen = () => {} }: { rows: SheetRows; onopen?: (el: ElementRef, marks: string[]) => void } = $props();
  const COMPACT = 3;
  const stale = $derived(sheetsStale());
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const settings = $derived.by(() => { void modelStore.designData; return scheduleSettings(); });
  const s = $derived.by(() => { void settings; return sheetsSchedule(rows); });
  const pct = $derived(fmt(settings.waste * 100, 0));
  let view = $state<ScheduleView>(scheduleViewChoice());
  const v = $derived(scheduleView(s, view));
  const grouped = $derived(view !== 'unified');
  const perElement = $derived(view === 'element');
  let folded = $state<Set<string>>(new Set());
  let unfolded = $state<Set<string>>(new Set());
  let barH = $state(34);

  function choose(next: ScheduleView) {
    view = next;
    folded = new Set();
    unfolded = new Set();
    setScheduleViewChoice(next);
  }
  function toggle(id: string) {
    const n = new Set(folded);
    if (n.has(id)) n.delete(id); else n.add(id);
    folded = n;
  }
  function showAll(id: string) {
    const n = new Set(unfolded);
    if (n.has(id)) n.delete(id); else n.add(id);
    unfolded = n;
  }
  function onWaste(e: Event) {
    const x = Number((e.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(x)) setScheduleSettings({ waste: x / 100 });
  }
  const groupTitle = (g: ViewGroup) => (g.family && view === 'family' ? t(`rcSheets.family.${g.family}`) : g.title || '—');
  const openUse = (u: BarUse) => onopen(u, u.elevation);
  const rowId = (g: ViewGroup, r: ViewRow) => `${g.id}#${r.key}#${r.marks.join()}`;
  const levelOf = (u: ElementRef) => (view !== 'level' && u.level && u.level !== u.name ? u.level : '');
</script>

<section class="rcs-bbs" style="--bbs-bar: {Math.max(0, barH - 8)}px" data-testid="rc-schedule-view" data-view={view}>
  <div class="bar" bind:offsetHeight={barH}>
    <div class="views" role="tablist" aria-label={t('rcSheets.bbs.view')}>
      {#each SCHEDULE_VIEWS as sv (sv)}
        <button type="button" role="tab" aria-selected={view === sv} class:on={view === sv} onclick={() => choose(sv)} data-testid={`rc-bbs-view-${sv}`}>{t(`rcSheets.bbs.view.${sv}`)}</button>
      {/each}
    </div>
    <label>{t('rcSheets.bbs.scope')}
      <select value={settings.scope} onchange={(e) => setScheduleSettings({ scope: e.currentTarget.value as MarkScope })} data-testid="rc-bbs-scope">
        {#each MARK_SCOPES as sc (sc)}<option value={sc}>{t(`rcSheets.bbs.scope.${sc}`)}</option>{/each}
      </select>
    </label>
    <label>{t('rcSheets.bbs.waste')}
      <input type="number" min="0" max="50" step="1" value={Math.round(settings.waste * 1000) / 10} onchange={onWaste} data-testid="rc-bbs-waste" />
    </label>
    {#if grouped}
      <button type="button" class="rcs-btn" onclick={() => (folded = new Set())} data-testid="rc-bbs-unfold-all">{t('rcSheets.bbs.expandAll')}</button>
      <button type="button" class="rcs-btn" onclick={() => (folded = new Set(v.groups.map((g) => g.id)))} data-testid="rc-bbs-fold-all">{t('rcSheets.bbs.collapseAll')}</button>
    {/if}
    <button type="button" class="rcs-btn" title={t('rcSheets.bbs.csvTitle')} onclick={() => downloadSchedule(rows, 'csv', t, view)} disabled={stale || !s.rows.length} data-testid="rc-bbs-csv">{t('rcSheets.bbs.csv')}</button>
    <button type="button" class="rcs-btn" title={t('rcSheets.bbs.bvbsTitle')} onclick={() => downloadSchedule(rows, 'bvbs', t, view)} disabled={stale || !s.rows.length} data-testid="rc-bbs-bvbs">{t('rcSheets.bbs.bvbs')}</button>
  </div>
  {#if stale}<p class="dim warn" role="status" data-testid="rc-bbs-stale">{t('rcSheets.exportStale')}</p>{/if}
  {#if !s.rows.length}
    <p class="dim" data-testid="rc-bbs-empty">{t('rcSheets.bbs.empty')}</p>
  {:else}
    <table class="tbl main" data-testid="rc-bbs-table">
      <thead><tr>
        <th>{t('rcSheets.bbs.mark')}</th><th>Ø</th><th>{t('rcSheets.bbs.kind')}</th>
        {#if perElement}
          <th class="n">{t('rcSheets.bbs.perElement')}</th><th class="n">{t('rcSheets.bbs.equal')}</th>
        {:else}
          <th>{t('rcSheets.bbs.elements')}</th>
        {/if}
        <th class="n">{t('rcSheets.bbs.total')}</th>
        <th>{t('rcSheets.bbs.shape')}</th><th class="n">{t('rcSheets.bbs.unitLength')}</th><th class="n">{t('rcSheets.bbs.totalLength')}</th><th class="n">kg</th><th class="n">kg + {pct} %</th>
      </tr></thead>
      {#each v.groups as g (g.id)}
        {@const open = !folded.has(g.id)}
        <tbody data-testid="rc-bbs-group" data-group={g.id}>
          {#if grouped}
            <tr class="gh" data-testid="rc-bbs-group-head">
              <td colspan={perElement ? 5 : 4}>
                <button type="button" class="fold" aria-expanded={open} aria-label={t('rcSheets.bbs.foldGroup')} onclick={() => toggle(g.id)} data-testid="rc-bbs-fold">{open ? '▾' : '▸'}</button>
                {#if perElement && g.elements}
                  {#each g.elements.slice(0, unfolded.has(g.id) ? undefined : COMPACT) as el, k (el.key)}
                    {#if k}<span class="eq">=</span>{/if}
                    <button type="button" class="link gt" title={tp('rcSheets.bbs.openElement', { name: el.name })} onclick={() => onopen(el, [])} data-testid="rc-bbs-element">{el.name}{#if levelOf(el)}<small>{levelOf(el)}</small>{/if}</button>
                  {/each}
                  {#if g.elements.length > COMPACT}
                    <button type="button" class="more" title={t(unfolded.has(g.id) ? 'rcSheets.bbs.showLess' : 'rcSheets.bbs.showAll')} onclick={() => showAll(g.id)}>{unfolded.has(g.id) ? '−' : `+${g.elements.length - COMPACT}`}</button>
                  {/if}
                {:else}
                  <button type="button" class="gt" onclick={() => toggle(g.id)}>{groupTitle(g)}</button>
                {/if}
                <small class="dim">({g.rows.length})</small>
                {#if g.stockBars}<small class="dim"> · {g.stockBars} × {t('rcSheets.bbs.stockBars')}</small>{/if}
              </td>
              <td class="n">{g.count}</td><td></td><td></td>
              <td class="n">{fmt(g.length, 1)}</td><td class="n">{fmt(g.kg, 1)}</td><td class="n">{fmt(g.withWaste, 1)}</td>
            </tr>
          {/if}
          {#if open}
            {#each g.rows as r (rowId(g, r))}
              {@const id = rowId(g, r)}
              <tr data-testid="rc-bbs-row" data-family={perElement ? g.family : undefined} data-key={r.key}>
                <td class="mk">
                  {#if perElement && r.uses[0]}
                    <button type="button" class="link" title={tp('rcSheets.bbs.openElement', { name: r.uses[0].name })} onclick={() => openUse(r.uses[0]!)} data-testid="rc-bbs-mark">{r.marks[0]}</button>{#if r.uses[0].elevation.length > 1}<small> = {r.uses[0].elevation.filter((m) => m !== r.marks[0]).join(' = ')}</small>{/if}
                  {:else}
                    {r.marks.join(', ')}
                  {/if}
                </td>
                <td>{r.dia}</td><td>{r.kinds.map((k) => t(kindKey(k))).join(', ')}</td>
                {#if perElement}
                  <td class="n">{r.perElement}</td><td class="n">{r.equal}</td>
                {:else}
                  <td class="els">
                    {#each r.uses.slice(0, unfolded.has(id) ? undefined : COMPACT) as u (u.key)}
                      <button type="button" class="link chip" title={`${tp('rcSheets.bbs.openElement', { name: u.name })} · ${u.mark} × ${u.count}`} onclick={() => openUse(u)} data-testid="rc-bbs-use" data-family={u.family}>{u.name}{#if levelOf(u)}<small>{levelOf(u)}</small>{/if}</button>
                    {/each}
                    {#if r.uses.length > COMPACT}
                      <button type="button" class="more" title={t(unfolded.has(id) ? 'rcSheets.bbs.showLess' : 'rcSheets.bbs.showAll')} onclick={() => showAll(id)} data-testid="rc-bbs-more">{unfolded.has(id) ? '−' : `+${r.uses.length - COMPACT}`}</button>
                    {/if}
                  </td>
                {/if}
                <td class="n">{r.count}</td>
                <td class="sk"><RcBarSketch shape={r.shape} /></td>
                <td class="n">{fmt(r.unitLength, 2)}{#if r.long}<span class="warn" title={t('rcSheets.bbs.long')}> ⚠</span>{/if}</td>
                <td class="n">{fmt(r.totalLength, 2)}</td><td class="n">{fmt(r.kg, 1)}</td><td class="n">{fmt(r.withWaste, 1)}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      {/each}
      <tfoot>
        <tr class="tot" data-testid="rc-bbs-grand">
          <td colspan={perElement ? 5 : 4}>{t('rcSheets.bbs.grandTotal')}</td>
          <td class="n">{v.total.count}</td><td></td><td></td>
          <td class="n">{fmt(v.total.length, 1)}</td><td class="n">{fmt(v.total.kg, 1)}</td><td class="n">{fmt(v.total.withWaste, 1)}</td>
        </tr>
      </tfoot>
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
    <RcExportLog />
  {/if}
</section>

<style>
  .rcs-bbs { --bbs-head: 25px; }
  .bar { position: sticky; top: -8px; z-index: 3; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 4px 0 6px; background: var(--st-surface); font-size: 0.72rem; color: var(--st-text-2); }
  .bar label { display: flex; align-items: center; gap: 4px; }
  .bar select, .bar input { font-size: 0.72rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 4px; }
  .bar input { width: 4.5em; }
  .views { display: flex; flex-wrap: wrap; gap: 2px; }
  .views button { border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text-2); border-radius: 4px; padding: 3px 10px; font-size: 0.74rem; cursor: pointer; }
  .views button.on { background: var(--st-accent, var(--st-surface-3)); color: var(--st-on-accent, var(--st-text)); }
  .rcs-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
  .rcs-btn:disabled { opacity: 0.5; cursor: default; }
  .tbl { border-collapse: separate; border-spacing: 0; font-size: 0.72rem; margin-bottom: 10px; }
  caption { text-align: left; font-weight: 600; color: var(--st-text-2); padding: 2px 0 4px; }
  th { position: sticky; top: 0; background: var(--st-surface-2); text-align: left; font-weight: 600; color: var(--st-text-2); padding: 4px 6px; border-bottom: 1px solid var(--st-hair); white-space: nowrap; }
  .main th { top: var(--bbs-bar); z-index: 2; height: var(--bbs-head); box-sizing: border-box; }
  td { padding: 2px 6px; border-bottom: 1px solid var(--st-hair); white-space: nowrap; vertical-align: middle; }
  .gh td { position: sticky; top: calc(var(--bbs-bar) + var(--bbs-head)); z-index: 1; background: var(--st-surface-3, var(--st-surface-2)); font-weight: 600; padding: 3px 6px; }
  .fold { border: none; background: none; color: var(--st-text-2); cursor: pointer; width: 1.4em; padding: 0; font-size: 0.8rem; }
  .gt { border: none; background: none; color: var(--st-text); font: inherit; font-weight: 600; cursor: pointer; padding: 0 2px; }
  .gt small, .chip small { font-weight: 400; color: var(--st-text-3); margin-left: 3px; }
  .eq { color: var(--st-text-3); margin: 0 2px; }
  .link { color: var(--st-text); text-decoration: underline dotted var(--st-text-3); text-underline-offset: 2px; }
  .link:hover { text-decoration-style: solid; }
  .mk .link { border: none; background: none; font: inherit; font-weight: 600; cursor: pointer; padding: 0; }
  .els { white-space: normal; max-width: 26em; }
  .chip { border: 1px solid var(--st-hair); background: var(--st-surface-2); border-radius: 3px; padding: 0 4px; margin: 1px 2px 1px 0; font-size: 0.7rem; cursor: pointer; }
  .more { border: 1px solid var(--st-hair); background: var(--st-surface); color: var(--st-text-2); border-radius: 3px; padding: 0 4px; font-size: 0.68rem; cursor: pointer; }
  .n { text-align: right; font-family: var(--st-mono); }
  .mk { font-weight: 600; font-family: var(--st-mono); }
  .mk small { font-weight: 400; color: var(--st-text-3); }
  .sk { padding: 1px 4px; }
  .tot td { font-weight: 600; }
  tfoot td { position: sticky; bottom: -16px; background: var(--st-surface-2); border-top: 1px solid var(--st-hair); }
  .sums { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  .dim { font-size: 0.7rem; color: var(--st-text-3); max-width: 90ch; margin: 4px 0; font-weight: 400; }
  .warn { color: var(--st-warn); }
</style>
