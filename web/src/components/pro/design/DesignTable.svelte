<script lang="ts">
  /**
   * The design table.
   *
   * The table NEVER unmounts on a reinforcement edit: rows are keyed by element id
   * and the scroll container persists, so expansion, selection, filters and scroll
   * position all survive editing and re-verification.
   */
  import { t, tp } from '../../../lib/i18n';
  import OutcomeBadge from './OutcomeBadge.svelte';
  import type { DesignRow, SortKey } from './design-view';

  interface Props {
    rows: DesignRow[];
    checked: Set<number>;
    expandedId: number | null;
    focusedId: number | null;
    sortKey: SortKey;
    sortAsc: boolean;
    onToggleCheck: (id: number, shiftKey: boolean) => void;
    onToggleAll: () => void;
    onExpand: (id: number) => void;
    onSort: (k: SortKey) => void;
    onFocus: (id: number) => void;
    detail?: import('svelte').Snippet<[DesignRow]>;
  }
  let {
    rows, checked, expandedId, focusedId, sortKey, sortAsc,
    onToggleCheck, onToggleAll, onExpand, onSort, onFocus, detail,
  }: Props = $props();

  const allChecked = $derived(rows.length > 0 && rows.every(r => checked.has(r.elementId)));

  function ariaSort(k: SortKey): 'ascending' | 'descending' | 'none' {
    return sortKey === k ? (sortAsc ? 'ascending' : 'descending') : 'none';
  }

  /** Keyboard navigation: j/k move, Enter expands, Space toggles the checkbox. */
  function onKeydown(e: KeyboardEvent) {
    if (rows.length === 0) return;
    // Ignore keys coming from the expanded row's editors — Enter/Space/arrows
    // are editing gestures there (a bubbled Enter used to collapse the row
    // being edited).
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
    const idx = focusedId === null ? -1 : rows.findIndex(r => r.elementId === focusedId);
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      onFocus(rows[Math.min(idx + 1, rows.length - 1)]?.elementId ?? rows[0].elementId);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      onFocus(rows[Math.max(idx - 1, 0)]?.elementId ?? rows[0].elementId);
    } else if (e.key === 'Enter' && focusedId !== null) {
      e.preventDefault();
      onExpand(focusedId);
    } else if (e.key === ' ' && focusedId !== null) {
      e.preventDefault();
      onToggleCheck(focusedId, e.shiftKey);
    }
  }

  function fmtUtil(u: number | null): string {
    if (u === null) return '—';
    if (!Number.isFinite(u)) return '∞';
    return u.toFixed(2);
  }
  function barWidth(u: number | null): string {
    if (u === null || !Number.isFinite(u)) return '0%';
    return `${Math.min(u * 100, 100)}%`;
  }
  function barColor(row: DesignRow): string {
    switch (row.status) {
      case 'fail': return 'var(--st-accent)';
      case 'warn': return 'var(--st-warn)';
      case 'stale': return 'repeating-linear-gradient(45deg,var(--st-text-3) 0 3px,var(--st-text-3) 3px 6px)';
      case 'unavailable': return 'var(--st-text-3)';
      default: return 'var(--st-ok)';
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="table-scroll" data-testid="design-table-scroll" tabindex="-1" onkeydown={onKeydown}>
  <table data-testid="design-table">
    <caption class="sr-only">{t('design.table.governing')}</caption>
    <thead>
      <tr>
        <th class="col-chk" scope="col">
          <input type="checkbox" data-testid="select-all"
                 checked={allChecked} onchange={onToggleAll}
                 aria-label={t('design.table.selectAll')} />
        </th>
        <th class="col-id" scope="col" aria-sort={ariaSort('element')}>
          <button class="sort-btn" onclick={() => onSort('element')}>{t('design.table.element')}</button>
        </th>
        <th class="col-type" scope="col">{t('design.table.type')}</th>
        <th class="col-elev" scope="col" aria-sort={ariaSort('elevation')}
            title={t('design.group.derivedNote')}>
          <button class="sort-btn" onclick={() => onSort('elevation')}>{t('design.table.elevation')}</button>
        </th>
        <th class="col-section" scope="col" aria-sort={ariaSort('section')}>
          <button class="sort-btn" onclick={() => onSort('section')}>{t('design.table.section')}</button>
        </th>
        <th class="col-check" scope="col">{t('design.table.governing')}</th>
        <th class="col-ratio" scope="col" aria-sort={ariaSort('utilization')}>
          <button class="sort-btn" onclick={() => onSort('utilization')}>{t('design.table.utilization')}</button>
        </th>
        <th class="col-status" scope="col" aria-sort={ariaSort('status')}>
          <button class="sort-btn" onclick={() => onSort('status')}>{t('design.table.status')}</button>
        </th>
        <th class="col-flags" scope="col">{t('design.table.flags')}</th>
        <th class="col-combo" scope="col">{t('design.table.combo')}</th>
      </tr>
    </thead>
    <tbody data-testid="design-tbody">
      {#each rows as row (row.elementId)}
        <tr class="row row-{row.status}" class:focused={focusedId === row.elementId}
            class:expanded={expandedId === row.elementId}
            data-testid={`design-row-${row.elementId}`}
            data-status={row.status}
            data-outcome={row.outcome ?? ''}
            data-util={row.utilization ?? ''}>
          <td class="col-chk">
            <input type="checkbox" data-testid={`row-checkbox-${row.elementId}`}
                   checked={checked.has(row.elementId)}
                   onclick={(e) => { e.stopPropagation(); onToggleCheck(row.elementId, e.shiftKey); }}
                   aria-label={tp('design.table.selectRow', { elementId: row.elementId })} />
          </td>
          <td class="col-id">
            <button class="expand-btn" data-testid={`row-expand-${row.elementId}`}
                    aria-expanded={expandedId === row.elementId}
                    aria-label={tp('design.table.expandRow', { elementId: row.elementId })}
                    onclick={() => { onFocus(row.elementId); onExpand(row.elementId); }}>
              <span class="caret" aria-hidden="true">{expandedId === row.elementId ? '▾' : '▸'}</span>{row.elementId}
            </button>
          </td>
          <td class="col-type">{row.elementType}</td>
          <td class="col-elev" data-testid={`row-elevation-${row.elementId}`}>{row.elevationLabel}</td>
          <td class="col-section">{row.sectionName}</td>
          <td class="col-check">{row.governingCheck}</td>
          <td class="col-ratio" data-testid={`row-util-${row.elementId}`}>
            <div class="ratio-cell">
              <span class="ratio-value">{fmtUtil(row.utilization)}</span>
              <div class="ratio-bar">
                <div class="ratio-fill" style="width:{barWidth(row.utilization)};background:{barColor(row)}"></div>
              </div>
            </div>
          </td>
          <td class="col-status" data-testid={`row-status-${row.elementId}`}>
            <OutcomeBadge status={row.status} compact />
          </td>
          <td class="col-flags" data-testid={`row-flags-${row.elementId}`}>
            {#if !row.hasReinforcement}<OutcomeBadge flag="noRebar" />{/if}
            {#if row.edited}<OutcomeBadge flag="edited" />{/if}
            {#if row.auto && !row.edited}<OutcomeBadge flag="auto" />{/if}
            {#if row.certified}<OutcomeBadge flag="certified" />{/if}
            {#if row.provisional}<OutcomeBadge flag="provisional" />{/if}
            {#if row.sloped}<OutcomeBadge flag="sloped" />{/if}
            {#if row.outcome && row.outcome !== 'VERIFIED'}<OutcomeBadge outcome={row.outcome} compact />{/if}
          </td>
          <td class="col-combo">{row.comboName || '—'}</td>
        </tr>
        {#if expandedId === row.elementId}
          <tr class="detail-row" data-testid={`design-detail-${row.elementId}`}>
            <td colspan="10">
              {#if detail}{@render detail(row)}{/if}
            </td>
          </tr>
        {/if}
      {/each}
      {#if rows.length === 0}
        <tr><td colspan="10" class="empty" data-testid="design-table-empty">{t('design.table.empty')}</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
    /*
     A floor, not just `min-height: 0`.
     ─────────────────────────────────
     In a flex column `min-height: 0` lets this box shrink to nothing, and the
     panel has been getting shorter — a ribbon of two rows, then a heading. Once
     the box is shorter than its own sticky header, the header covers the first
     row and a click aimed at row 1 lands on "select all". Below this floor the
     panel scrolls instead, which is the honest failure.
  */
  .table-scroll { flex: 1; overflow: auto; min-height: 9rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
  /*
     A sticky header hides the row you scrolled to.
     ─────────────────────────────────────────────
     `scrollIntoView` stops as soon as the row is inside the scroll box, which
     for anything near the top means underneath this header — so a click aimed
     at a row's control landed on the header instead. `scroll-margin-top` tells
     the browser the row needs that much clearance, and it is the header's own
     height. It matters more the shorter the panel gets.
  */
  tbody tr { scroll-margin-top: 2.2rem; }

  thead th { position: sticky; top: 0; z-index: 2; background: var(--st-surface-2);
    border-bottom: 1px solid var(--st-hair-strong); padding: 4px 6px; text-align: left;
    color: var(--st-info); font-weight: 600; white-space: nowrap; }
  .sort-btn { background: none; border: none; color: inherit; font: inherit;
    cursor: pointer; padding: 0; }
  .sort-btn:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  tbody td { padding: 3px 6px; border-bottom: 1px solid var(--st-surface-3); color: var(--st-text); vertical-align: middle; }
  .row:hover td { background: var(--st-surface-3); }
  .row.focused td { background: var(--st-surface-3); box-shadow: inset 2px 0 0 var(--st-value); }
  .row.expanded td { background: var(--st-surface-3); }
  .row-fail td { color: var(--st-danger); }
  .row-warn td { color: var(--st-warn); }
  .row-unavailable td { color: var(--st-text-2); }
  .row-stale td { color: var(--st-text); }
  .col-chk { width: 22px; }
  .col-id { width: 62px; font-family: monospace; }
  .col-type { width: 58px; }
  .col-elev { width: 92px; font-family: monospace; font-size: 0.68rem; }
  .col-ratio { width: 110px; }
  .col-status { width: 34px; }
  .col-flags { width: 190px; }
  .expand-btn { background: none; border: none; color: inherit; font: inherit;
    cursor: pointer; padding: 0; display: inline-flex; gap: 3px; align-items: center; }
  .expand-btn:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .caret { color: var(--st-text-3); width: 8px; display: inline-block; }
  .ratio-cell { display: flex; align-items: center; gap: 5px; }
  .ratio-value { font-family: monospace; min-width: 30px; }
  .ratio-bar { flex: 1; height: 5px; background: var(--st-surface-3); border-radius: 3px; overflow: hidden; }
  .ratio-fill { height: 100%; }
  .detail-row td { background: var(--st-surface); padding: 8px 10px; }
  .empty { text-align: center; color: var(--st-text-3); padding: 18px; font-style: italic; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0,0,0,0); white-space: nowrap; }
</style>
