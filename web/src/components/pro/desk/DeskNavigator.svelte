<script lang="ts">
  /** The desk's navigator: levels, the status and decision filters, the members, and the way through the failing ones. */
  import { modelStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import { sortedLevels } from '../../../lib/model/grid';
  import { deskUi, type DeskFilter } from '../../../lib/store/design-desk-ui.svelte';
  import { matches, onLevel, stepFailing, type DeskRow } from './desk-rows';

  let { rows }: { rows: DeskRow[] } = $props();
  const levels = $derived(sortedLevels(modelStore.grid));
  const FILTERS: DeskFilter[] = ['all', 'fail', 'warn', 'ok', 'unavailable', 'edited', 'locked', 'steel'];
  const shown = $derived(rows.filter((r) => onLevel(r, deskUi.levelZ) && matches(r, deskUi.filter)));
  const count = (f: DeskFilter) => rows.filter((r) => onLevel(r, deskUi.levelZ) && matches(r, f)).length;
  function go(step: 1 | -1) {
    const id = stepFailing(shown, deskUi.selected, step);
    if (id !== null) deskUi.selected = id;
  }

  /*
   * The current member's row is kept in view: on opening (the list mounts at its top) and when the
   * member changes from outside the list, a pick in the viewer or the plan. Only the list scrolls;
   * `scrollIntoView` would move every scrolled ancestor too.
   */
  let list = $state<HTMLUListElement | null>(null);
  $effect(() => {
    const id = deskUi.selected;
    void shown;
    if (!list || id === null) return;
    const row = list.querySelector<HTMLElement>(`[data-testid="desk-row-${id}"]`);
    if (!row) return;
    const r = row.getBoundingClientRect(), l = list.getBoundingClientRect();
    if (r.top < l.top) list.scrollTop -= l.top - r.top;
    else if (r.bottom > l.bottom) list.scrollTop += r.bottom - l.bottom;
  });
</script>

<nav class="dn" data-testid="desk-navigator">
  <label class="dn-level">{t('desk.level')}
    <select value={deskUi.levelZ ?? ''} onchange={(e) => (deskUi.levelZ = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} data-testid="desk-level">
      <option value="">{t('desk.allLevels')}</option>
      {#each levels as l (l.id)}<option value={l.z}>{l.name}</option>{/each}
    </select>
  </label>
  <div class="dn-filters" role="radiogroup" aria-label={t('desk.filter')}>
    {#each FILTERS as f}
      <button class:on={deskUi.filter === f} role="radio" aria-checked={deskUi.filter === f} onclick={() => (deskUi.filter = f)} data-testid="desk-filter-{f}">{t(`desk.f.${f}`)} {count(f)}</button>
    {/each}
  </div>
  <div class="dn-step">
    <button onclick={() => go(-1)} data-testid="desk-prev" title={t('design.nav.prevFailing')}>‹</button>
    <span>{t('design.nav.nextFailing')}</span>
    <button onclick={() => go(1)} data-testid="desk-next" title={t('design.nav.nextFailing')}>›</button>
  </div>
  <ul class="dn-list" bind:this={list}>
    {#each shown as r (r.id)}
      <li>
        <button class="dn-row" class:on={deskUi.selected === r.id} onclick={() => (deskUi.selected = r.id)} data-testid="desk-row-{r.id}">
          <span class="dot st-{r.status}" aria-hidden="true"></span>
          <span class="dn-name">{r.name}</span>
          <span class="dn-ratio">{r.ratio === null ? '—' : r.ratio.toFixed(2)}</span>
          {#if r.decision === 'locked'}<span class="dn-badge" title={t('desk.d.locked')}>🔒</span>{:else if r.decision === 'edited'}<span class="dn-badge" title={t('desk.d.edited')}>✎</span>{/if}
        </button>
      </li>
    {/each}
    {#if shown.length === 0}<li class="dn-empty">{t('desk.none')}</li>{/if}
  </ul>
</nav>

<style>
  .dn { display: flex; flex-direction: column; gap: 6px; min-height: 0; padding: 8px; border-right: 1px solid var(--st-hair); width: 17rem; }
  @media (max-width: 1100px) { .dn { width: 14rem; } }
  @media (max-width: 960px) { .dn { width: 12rem; } }
  .dn-level { display: flex; flex-direction: column; gap: 2px; font-size: 0.68rem; color: var(--st-text-2); }
  .dn-filters { display: flex; flex-wrap: wrap; gap: 3px; }
  .dn-filters button, .dn-step button { font-size: 0.64rem; padding: 1px 6px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text-2); border-radius: 10px; cursor: pointer; }
  .dn-filters .on { border-color: var(--st-accent); color: var(--st-text); }
  .dn-step { display: flex; align-items: center; gap: 6px; font-size: 0.66rem; color: var(--st-text-2); }
  .dn-list { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
  .dn-row { display: flex; align-items: center; gap: 6px; width: 100%; padding: 2px 4px; background: none; border: none; text-align: left; cursor: pointer; color: var(--st-text); font-size: 0.7rem; }
  .dn-row.on { background: var(--st-surface-3); }
  .dn-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dn-ratio { font-variant-numeric: tabular-nums; color: var(--st-text-2); }
  .dn-empty { font-size: 0.68rem; color: var(--st-text-3); padding: 4px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--st-text-3); flex: none; }
  .dot.st-ok { background: var(--st-ok); } .dot.st-warn { background: var(--st-warn); }
  .dot.st-fail, .dot.st-provisional { background: var(--st-danger); }
  /* A phone: as wide as the screen, and the list short enough to leave the canvas in view. */
  @media (max-width: 767px) {
    .dn { width: auto; padding: 6px 8px; }
    .dn-list { max-height: 18vh; }
  }
</style>
