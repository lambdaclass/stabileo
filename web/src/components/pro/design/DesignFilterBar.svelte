<script lang="ts">
  /**
   * Row filters, sorting, search and the DERIVED group pickers.
   *
   * Grouping is labelled as derived everywhere: the model stores no storeys, grid
   * lines or user groups, only node coordinates and connectivity. A grouping the
   * geometry cannot support honestly is offered as disabled with the reason.
   */
  import { t, tp } from '../../../lib/i18n';
  import type { RowFilter, SortKey } from './design-view';
  import type {
    ElevationGrouping, PlaneGrouping, FrameLineGrouping,
  } from '../../../lib/engine/design/member-grouping';

  interface Props {
    filter: RowFilter;
    search: string;
    sortKey: SortKey;
    sortAsc: boolean;
    counts: Record<RowFilter, number>;
    elevation: ElevationGrouping;
    planes: PlaneGrouping;
    frameLines: FrameLineGrouping;
    sections: Array<{ id: number; name: string; count: number }>;
    materials: Array<{ id: number; name: string; count: number }>;
    hasSelection: boolean;
    onFilter: (f: RowFilter) => void;
    onSearch: (s: string) => void;
    onSort: (k: SortKey) => void;
    onSelectIds: (ids: number[], label: string) => void;
    onSelectConnected: () => void;
    onSelectKind: (kind: 'beam' | 'column') => void;
  }
  let {
    filter, search, sortKey, sortAsc, counts,
    elevation, planes, frameLines, sections, materials, hasSelection,
    onFilter, onSearch, onSort, onSelectIds, onSelectConnected, onSelectKind,
  }: Props = $props();

  const FILTERS: RowFilter[] = ['all', 'selected', 'undesigned', 'fail', 'warn', 'ok', 'edited', 'stale', 'provisional'];
  const SORTS: SortKey[] = ['element', 'utilization', 'status', 'elevation', 'section'];
</script>

<div class="filter-bar" data-testid="design-filter-bar">
  <div class="row">
    <div class="chips" role="group" aria-label={t('design.filter.all')}>
      {#each FILTERS as f (f)}
        <button class="chip" class:active={filter === f} data-testid={`filter-${f}`}
                aria-pressed={filter === f} onclick={() => onFilter(f)}>
          {t(`design.filter.${f}`)}<span class="chip-count">{counts[f] ?? 0}</span>
        </button>
      {/each}
    </div>
    <input class="search" type="search" data-testid="design-search"
           placeholder={t('design.filter.search')} value={search}
           aria-label={t('design.filter.search')}
           oninput={(e) => onSearch(e.currentTarget.value)} />
  </div>

  <div class="row">
    <span class="lbl">{t('design.sort.label')}:</span>
    {#each SORTS as s (s)}
      <button class="chip chip-sm" class:active={sortKey === s} data-testid={`sort-${s}`}
              aria-pressed={sortKey === s}
              onclick={() => onSort(s)}>
        {t(`design.sort.${s}`)}{sortKey === s ? (sortAsc ? ' ▲' : ' ▼') : ''}
      </button>
    {/each}
  </div>

  <div class="row group-row">
    <span class="lbl" title={t('design.group.derivedNote')}>{t('design.group.label')}:</span>

    <!-- Elevation bands: derived from node Z, labelled "L3 +10.20 m". -->
    {#if elevation.available}
      <select class="picker" data-testid="group-picker-elevation"
              aria-label={t('design.group.elevation')}
              onchange={(e) => {
                const i = +e.currentTarget.value;
                if (Number.isNaN(i) || i < 0) return;
                const band = elevation.bands[i];
                onSelectIds([...band.beamIds, ...band.columnsRisingIds], band.label);
                e.currentTarget.selectedIndex = 0;
              }}>
        <option value="-1">{t('design.group.elevation')}</option>
        {#each elevation.bands as band, i (band.index)}
          <option value={i}>
            {band.label} — {band.beamIds.length} + {band.columnsRisingIds.length} {t('design.group.columnsRising')}
            {band.slopedBeamIds.length > 0 ? ` · ↗${band.slopedBeamIds.length}` : ''}
          </option>
        {/each}
      </select>
    {:else}
      <span class="refused" data-testid="group-elevation-refused">
        {t('design.group.elevation')}: {t(elevation.refusedKey ?? 'design.group.noNodes')}
      </span>
    {/if}

    <!-- Structural planes: constant-X / Y / Z, offered only for grid-like models. -->
    {#if planes.available}
      <select class="picker" data-testid="group-picker-plane"
              aria-label={t('design.group.plane')}
              onchange={(e) => {
                const i = +e.currentTarget.value;
                if (Number.isNaN(i) || i < 0) return;
                const p = planes.planes[i];
                onSelectIds(p.elementIds, `${t('design.group.plane')} ${p.label}`);
                e.currentTarget.selectedIndex = 0;
              }}>
        <option value="-1">{t('design.group.plane')}</option>
        {#each planes.planes as p, i (p.axis + p.coordinate)}
          <option value={i}>{p.label} — {p.elementIds.length}</option>
        {/each}
      </select>
    {:else}
      <span class="refused" data-testid="group-plane-refused">
        {t('design.group.plane')}: {t(planes.refusedKey ?? 'design.group.notGridLike')}
      </span>
    {/if}

    <!-- Frame lines: connectivity chains with a collinearity gate. -->
    {#if frameLines.available}
      <select class="picker" data-testid="group-picker-frameline"
              aria-label={t('design.group.frameLine')}
              onchange={(e) => {
                const i = +e.currentTarget.value;
                if (Number.isNaN(i) || i < 0) return;
                const l = frameLines.lines[i];
                onSelectIds(l.elementIds, `${t('design.group.frameLine')} ${l.label}`);
                e.currentTarget.selectedIndex = 0;
              }}>
        <option value="-1">{t('design.group.frameLine')}</option>
        {#each frameLines.lines as l, i (l.id)}
          <option value={i}>{l.label} — {l.elementIds.length}{l.ambiguous ? ' ⚠' : ''}</option>
        {/each}
      </select>
    {:else}
      <span class="refused" data-testid="group-frameline-refused">
        {t('design.group.frameLine')}: {t(frameLines.refusedKey ?? 'design.group.graphFailed')}
      </span>
    {/if}

    <select class="picker" data-testid="group-picker-section" aria-label={t('design.group.section')}
            onchange={(e) => {
              const id = +e.currentTarget.value;
              if (Number.isNaN(id) || id < 0) return;
              onSelectIds([], '');  // replaced by parent via section id below
              e.currentTarget.selectedIndex = 0;
            }}
            hidden></select>

    <select class="picker" data-testid="group-picker-attr" aria-label={t('design.group.section')}
            onchange={(e) => {
              const v = e.currentTarget.value;
              e.currentTarget.selectedIndex = 0;
              if (v === 'beam' || v === 'column') { onSelectKind(v); return; }
              if (v === 'connected') { onSelectConnected(); return; }
              const [kind, idStr] = v.split(':');
              const id = +idStr;
              if (Number.isNaN(id)) return;
              onSelectIds([], '');
              // Parent resolves attribute groups; emit through onSelectIds with a marker.
              if (kind === 'sec') onSelectIds([-1, id], `sec:${id}`);
              if (kind === 'mat') onSelectIds([-2, id], `mat:${id}`);
            }}>
      <option value="">{t('design.group.none')}</option>
      <option value="beam">{t('design.group.kindBeam')}</option>
      <option value="column">{t('design.group.kindColumn')}</option>
      <option value="connected" disabled={!hasSelection}>{t('design.group.connected')}</option>
      {#each sections as s (s.id)}
        <option value={`sec:${s.id}`}>{t('design.group.section')}: {s.name} ({s.count})</option>
      {/each}
      {#each materials as m (m.id)}
        <option value={`mat:${m.id}`}>{t('design.group.material')}: {m.name} ({m.count})</option>
      {/each}
    </select>
  </div>

  {#if frameLines.ambiguousCount > 0 || frameLines.totalSplits > 0}
    <div class="group-note" data-testid="group-note">
      {#if frameLines.ambiguousCount > 0}<span>⚠ {tp('design.group.ambiguous', { n: frameLines.ambiguousCount })}</span>{/if}
      {#if frameLines.totalSplits > 0}<span>{tp('design.group.splits', { n: frameLines.totalSplits })}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .filter-bar { display: flex; flex-direction: column; gap: 4px; padding: 5px 12px;
    background: var(--st-bg); border-bottom: 1px solid var(--st-surface-3); flex-shrink: 0; }
  .row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .chips { display: flex; gap: 3px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px;
    background: var(--st-surface-3); border: 1px solid var(--st-hair-strong); border-radius: 10px;
    color: var(--st-text-2); font-size: 0.7rem; cursor: pointer; }
  .chip:hover { background: var(--st-surface-3); }
  .chip.active { background: var(--st-surface-3); border-color: var(--st-info); color: var(--st-text); }
  .chip:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .chip-sm { border-radius: 3px; }
  .chip-count { font-family: monospace; font-size: 0.64rem; opacity: 0.8; }
  .search { flex: 1; min-width: 140px; padding: 3px 7px; background: var(--st-surface);
    border: 1px solid var(--st-hair-strong); border-radius: 3px; color: var(--st-text); font-size: 0.72rem; }
  .lbl { font-size: 0.7rem; color: var(--st-text-2); }
  .group-row { border-top: 1px dashed var(--st-surface-3); padding-top: 4px; }
  .picker { max-width: 260px; padding: 2px 5px; background: var(--st-surface);
    border: 1px solid var(--st-hair-strong); border-radius: 3px; color: var(--st-text); font-size: 0.7rem; }
  .refused { font-size: 0.66rem; color: var(--st-text-2); font-style: italic; }
  .group-note { display: flex; gap: 10px; flex-wrap: wrap; font-size: 0.66rem; color: var(--st-warn); }
</style>
