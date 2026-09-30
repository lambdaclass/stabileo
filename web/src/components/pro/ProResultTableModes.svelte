<script module lang="ts">
  export type TableMode = 'current' | 'all' | 'summary' | 'envelope' | 'maxType';
  /** Which result sets the across-set views read. */
  export type TableBasis = 'combos' | 'cases' | 'both';
</script>

<script lang="ts">
  import { resultCaseName } from '../../lib/engine/settlement-case';
  /**
   * The same result table read across result sets: all of them, a summary, an envelope, and, for
   * members, the governing demand of each type along the member.
   *
   * "On screen" is the table as it always was: the result set the viewport shows. The other views
   * read a basis of their own: the ACTIVE combinations (`store/active-results.ts`, the set design
   * reads), the load cases, or both the load cases and every combination. Each view can be
   * narrowed to the selection or to a group, add resultant columns, and, for members, read
   * stations along each member instead of its ends. See `engine/result-tables.ts`.
   */
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { activePerCombo3D, activeCombinations } from '../../lib/store/active-results';
  import { downloadText } from '../../lib/store/file';
  import { exportToExcel } from '../../lib/export/excel';
  import { computeStationDemands } from '../../lib/engine/verification-service';
  import {
    columnsOf, allRows, summaryRows, envelopeRows, maxByType, toCsv, whereOf, MAX_TYPES,
    type TableKind, type Source, type TableOptions,
  } from '../../lib/engine/result-tables';
  import type { AnalysisResults3D } from '../../lib/engine/types-3d';
  import { fmtQ, unitQ, toQ } from '../../lib/store/display-units.svelte';

  let { kind, mode = $bindable('current') }: { kind: TableKind; mode?: TableMode } = $props();

  /** Rows drawn at most; the exports always carry every row. */
  const ROW_CAP = 2000;
  const STATION_CHOICES = [2, 3, 5, 9];

  const modes = $derived<TableMode[]>(kind === 'forces' ? ['current', 'all', 'summary', 'envelope', 'maxType'] : ['current', 'all', 'summary', 'envelope']);
  const isNode = $derived(kind !== 'forces');

  let basis = $state<TableBasis>('combos');
  let range = $state<'all' | 'selection' | 'group'>('all');
  let groupId = $state<number | null>(null);
  let resultant = $state(false);
  let stations = $state(2);
  let byEntity = $state(false);

  const caseName = (id: number) => modelStore.loadCases.find((c) => c.id === id)?.name ?? resultCaseName(id, [], t('svc.settlementCase'), t('pro.caseN'));
  const comboName = (id: number) => modelStore.combinations.find((c) => c.id === id)?.name ?? `${t('pro.comboN')}${id}`;
  const caseSources = () => [...resultsStore.perCase3D].map(([id, results]) => ({ id, name: caseName(id), results }));

  const hasCombos = $derived(activePerCombo3D().size > 0);
  /** Combinations are asked for but none solved: the cases stand in, as they always did. */
  const effectiveBasis = $derived<TableBasis>(basis === 'combos' && !hasCombos ? 'cases' : basis);
  const sources = $derived.by<Source[]>(() => {
    if (effectiveBasis === 'combos') return [...activePerCombo3D()].map(([id, results]) => ({ id, name: comboName(id), results }));
    if (effectiveBasis === 'cases') return caseSources();
    return [...caseSources(), ...[...resultsStore.perCombo3D].map(([id, results]) => ({ id, name: comboName(id), results }))];
  });

  const groups = $derived([...modelStore.model.groups.values()].sort((a, b) => a.id - b.id));
  /** The nodes or members the views are narrowed to, or null for all. */
  const entities = $derived.by<Set<number> | null>(() => {
    if (range === 'all') return null;
    if (range === 'selection') return new Set(isNode ? uiStore.selectedNodes : uiStore.selectedElements);
    const g = groups.find((x) => x.id === groupId);
    if (!g) return new Set();
    if (!isNode) return new Set(g.members.elements ?? []);
    // A group of members narrows a node table to the members' nodes.
    const nodes = new Set(g.members.nodes ?? []);
    for (const id of g.members.elements ?? []) {
      const e = modelStore.elements.get(id);
      if (e) { nodes.add(e.nodeI); nodes.add(e.nodeJ); }
    }
    return nodes;
  });
  const opts = $derived<TableOptions>({ entities, resultant, stations: isNode ? 2 : stations });
  const withStations = $derived(!isNode && stations > 2);
  const cols = $derived(columnsOf(kind, opts));

  const all = $derived(mode === 'all' ? allRows(kind, sources, opts, byEntity ? 'entity' : 'source') : []);
  const summary = $derived(mode === 'summary' ? summaryRows(kind, sources, opts) : []);
  const envelope = $derived(mode === 'envelope' ? envelopeRows(kind, sources, opts) : []);
  const byType = $derived.by(() => {
    if (mode !== 'maxType') return [];
    const md = { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports };
    let perCombo: Map<number, AnalysisResults3D> = activePerCombo3D();
    let combos = activeCombinations();
    if (perCombo.size === 0 && resultsStore.results3D) {
      // Nothing combined: the result set on screen, named as what it is.
      perCombo = new Map([[0, resultsStore.results3D]]);
      combos = [{ id: 0, name: t('tables.shown'), factors: [] }] as never;
    }
    return maxByType(computeStationDemands(perCombo, combos, md as never).demands, entities);
  });

  function fmt(n: number): string {
    if (!Number.isFinite(n)) return '—';
    if (n === 0) return '0';
    if (Math.abs(n) < 0.001) return n.toExponential(2);
    if (Math.abs(n) < 1) return n.toFixed(4);
    return n.toFixed(2);
  }
  const where = (r: { entity: number; end?: 'i' | 'j'; x?: number }) => whereOf(r, withStations);

  function pick(entity: number) {
    if (isNode) { uiStore.selectMode = 'nodes'; uiStore.selectNode(entity, false); }
    else { uiStore.selectMode = 'elements'; uiStore.selectElement(entity, false); }
  }

  /** The table on screen as a header and rows, full precision in the units shown: what both exports write. */
  function table(): { header: string[]; rows: Array<Array<string | number>> } {
    const id = isNode ? t('pro.nodeLabel') : t('pro.elemLabel');
    const head = (c: { label: string; qty: import('../../lib/utils/units').Quantity }) => `${c.label} (${unitQ(c.qty)})`;
    const q = (v: number, c: number) => toQ(v, cols[c]!.qty);
    const at = isNode ? [] : withStations ? ['x (m)'] : [t('tables.end')];
    const atOf = (r: { end?: 'i' | 'j'; x?: number }) => (isNode ? [] : withStations ? [r.x ?? ''] : [r.end ?? '']);
    if (mode === 'all') {
      return { header: [t('tables.source'), id, ...at, ...cols.map(head)], rows: all.map((r) => [r.source.name, r.entity, ...atOf(r), ...r.values.map(q)]) };
    }
    if (mode === 'summary') {
      return {
        header: [t('tables.column'), t('tables.max'), id, t('tables.source'), t('tables.min'), id, t('tables.source')],
        rows: summary.map((s) => [head(s.column), s.max ? toQ(s.max.value, s.column.qty) : '', s.max ? where(s.max) : '', s.max?.source.name ?? '', s.min ? toQ(s.min.value, s.column.qty) : '', s.min ? where(s.min) : '', s.min?.source.name ?? '']),
      };
    }
    if (mode === 'envelope') {
      return {
        header: [id, ...at, ...cols.flatMap((c) => [`${head(c)} ${t('tables.max')}`, t('tables.source'), `${head(c)} ${t('tables.min')}`, t('tables.source')])],
        rows: envelope.map((r) => [r.entity, ...atOf(r), ...cols.flatMap((_, c) => [q(r.max[c]!.value, c), r.max[c]!.source.name, q(r.min[c]!.value, c), r.min[c]!.source.name])]),
      };
    }
    const d = (g: (typeof byType)[number]['axial'], m: (typeof MAX_TYPES)[number]) => (g ? [toQ(g.value, m.qty), g.stationX, g.comboName] : ['', '', '']);
    return {
      header: [id, 'L (m)', ...MAX_TYPES.flatMap((m) => [`${m.label} (${unitQ(m.qty)})`, 'x (m)', t('tables.source')])],
      rows: byType.map((r) => [r.elementId, r.length, ...MAX_TYPES.flatMap((m) => d(r[m.key], m))]),
    };
  }
  const stem = () => `${kind}-${mode}`;
  function csv() {
    const { header, rows } = table();
    downloadText(toCsv(header, rows), `${stem()}.csv`, 'text/csv;charset=utf-8');
  }
  function xlsx() {
    const { header, rows } = table();
    exportToExcel({ filename: `${stem()}.xlsx`, onlyExtras: true, extraSheets: [{ name: t(`tables.mode.${mode}`).slice(0, 31), rows: [header, ...rows] }] });
  }
</script>

<div class="tm-bar" role="tablist" data-testid="table-modes-{kind}"><div class="pk-tabs tm-tabs">
  {#each modes as m (m)}
    <button class:on={mode === m} role="tab" aria-selected={mode === m}
      disabled={m !== 'current' && m !== 'maxType' && sources.length === 0}
      onclick={() => (mode = m)} data-testid="tm-{kind}-{m}">{t(`tables.mode.${m}`)}</button>
  {/each}
  </div>
  {#if mode !== 'current'}
    <button class="pk-btn tm-csv" onclick={csv} data-testid="tm-csv">CSV</button>
    <button class="pk-btn tm-csv" onclick={xlsx} data-testid="tm-xlsx">Excel</button>
  {/if}
</div>

{#if mode !== 'current'}
  <div class="tm-opts" data-testid="tm-opts">
    {#if mode !== 'maxType'}
      <label>{t('tables.basis')}
        <select bind:value={basis} data-testid="tm-basis">
          <option value="combos" disabled={!hasCombos}>{t('tables.basis.combos')}</option>
          <option value="cases">{t('tables.basis.cases')}</option>
          <option value="both">{t('tables.basis.both')}</option>
        </select>
      </label>
    {/if}
    <label>{t('tables.range')}
      <select bind:value={range} data-testid="tm-range">
        <option value="all">{t('tables.range.all')}</option>
        <option value="selection">{t('tables.range.selection')}</option>
        <option value="group" disabled={groups.length === 0}>{t('tables.range.group')}</option>
      </select>
    </label>
    {#if range === 'group'}
      <select bind:value={groupId} data-testid="tm-group" aria-label={t('tables.range.group')}>
        {#each groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
      </select>
    {/if}
    {#if mode !== 'maxType'}
      <label><input type="checkbox" bind:checked={resultant} data-testid="tm-resultant" /> {t('tables.resultant')}</label>
      {#if !isNode}
        <label>{t('tables.stations')}
          <select bind:value={stations} data-testid="tm-stations">
            {#each STATION_CHOICES as n (n)}<option value={n}>{n === 2 ? t('tables.stations.ends') : n}</option>{/each}
          </select>
        </label>
      {/if}
      {#if mode === 'all'}
        <label><input type="checkbox" bind:checked={byEntity} data-testid="tm-by-entity" /> {isNode ? t('tables.byNode') : t('tables.byMember')}</label>
      {/if}
      <span class="tm-basis">{effectiveBasis === 'combos' ? tp('tables.basisCombos', { n: sources.length }) : tp('tables.basisSets', { n: sources.length })}</span>
    {/if}
  </div>
{/if}

{#if mode === 'all'}
  <div class="pro-res-table-wrap">
    <table class="pro-res-table" data-testid="tm-all">
      <thead><tr><th>{t('tables.source')}</th><th>{isNode ? t('pro.nodeLabel') : t('pro.elemLabel')}</th>{#if !isNode}<th>{withStations ? 'x (m)' : 'Ext.'}</th>{/if}{#each cols as c (c.key)}<th>{c.label} ({unitQ(c.qty)})</th>{/each}</tr></thead>
      <tbody>
        {#each all.slice(0, ROW_CAP) as r, i (i)}
          <tr onclick={() => pick(r.entity)} style="cursor:pointer" class:tm-first={byEntity && (i === 0 || all[i - 1]!.entity !== r.entity)}>
            <td class="tm-src">{r.source.name}</td><td class="col-id">{r.entity}</td>{#if !isNode}<td class="col-end">{withStations ? fmt(r.x ?? 0) : r.end}</td>{/if}
            {#each r.values as v, c (c)}<td class="col-num">{fmtQ(v, cols[c]!.qty)}</td>{/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if all.length > ROW_CAP}<p class="tm-cap">{tp('tables.capped', { shown: ROW_CAP, total: all.length })}</p>{/if}
  </div>
{:else if mode === 'summary'}
  <div class="pro-res-table-wrap">
    <table class="pro-res-table" data-testid="tm-summary">
      <thead><tr><th></th><th>{t('tables.max')}</th><th>{isNode ? t('pro.nodeLabel') : t('pro.elemLabel')}</th><th>{t('tables.source')}</th><th>{t('tables.min')}</th><th>{isNode ? t('pro.nodeLabel') : t('pro.elemLabel')}</th><th>{t('tables.source')}</th></tr></thead>
      <tbody>
        {#each summary as s (s.column.key)}
          <tr>
            <td class="col-id">{s.column.label} ({unitQ(s.column.qty)})</td>
            {#if s.max}<td class="col-num">{fmtQ(s.max.value, s.column.qty)}</td><td class="col-id tm-link" onclick={() => pick(s.max!.entity)}>{where(s.max)}</td><td class="tm-src">{s.max.source.name}</td>{:else}<td colspan="3">—</td>{/if}
            {#if s.min}<td class="col-num">{fmtQ(s.min.value, s.column.qty)}</td><td class="col-id tm-link" onclick={() => pick(s.min!.entity)}>{where(s.min)}</td><td class="tm-src">{s.min.source.name}</td>{:else}<td colspan="3">—</td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else if mode === 'envelope'}
  <div class="pro-res-table-wrap">
    <table class="pro-res-table" data-testid="tm-envelope">
      <thead><tr><th>{isNode ? t('pro.nodeLabel') : t('pro.elemLabel')}</th>{#if !isNode}<th>{withStations ? 'x (m)' : 'Ext.'}</th>{/if}<th></th>{#each cols as c (c.key)}<th>{c.label} ({unitQ(c.qty)})</th>{/each}</tr></thead>
      <tbody>
        {#each envelope.slice(0, ROW_CAP) as r, i (i)}
          <tr onclick={() => pick(r.entity)} style="cursor:pointer">
            <td class="col-id" rowspan="2">{r.entity}</td>{#if !isNode}<td class="col-end" rowspan="2">{withStations ? fmt(r.x ?? 0) : r.end}</td>{/if}
            <td class="tm-mm">{t('tables.max')}</td>
            {#each r.max as m, c (c)}<td class="col-num" title={m.source.name}>{fmtQ(m.value, cols[c]!.qty)}</td>{/each}
          </tr>
          <tr>
            <td class="tm-mm">{t('tables.min')}</td>
            {#each r.min as m, c (c)}<td class="col-num" title={m.source.name}>{fmtQ(m.value, cols[c]!.qty)}</td>{/each}
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="tm-cap">{withStations ? t('tables.envelopeHintStations') : t('tables.envelopeHint')}</p>
  </div>
{:else if mode === 'maxType'}
  <div class="pro-res-table-wrap">
    <table class="pro-res-table" data-testid="tm-maxtype">
      <thead>
        <tr><th rowspan="2">{t('pro.elemLabel')}</th>{#each MAX_TYPES as m (m.key)}<th colspan="3">{m.label}</th>{/each}</tr>
        <tr>{#each MAX_TYPES as m (m.key)}<th>{unitQ(m.qty)}</th><th>x (m)</th><th>{t('tables.source')}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each byType.slice(0, ROW_CAP) as r (r.elementId)}
          <tr onclick={() => pick(r.elementId)} style="cursor:pointer">
            <td class="col-id">{r.elementId}</td>
            {#each MAX_TYPES as m (m.key)}
              {@const g = r[m.key]}
              {#if g}<td class="col-num">{fmtQ(g.value, m.qty)}</td><td class="col-num">{fmt(g.stationX)}</td><td class="tm-src">{g.comboName}</td>{:else}<td colspan="3">—</td>{/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="tm-cap">{t('tables.maxTypeHint')}</p>
  </div>
{/if}

<style>
  .tm-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 4px 0 6px; }
  .tm-tabs { flex: 0 1 auto; }
  .tm-tabs button:disabled { opacity: 0.35; cursor: not-allowed; }
  .tm-csv { min-height: 22px; padding: 0.1rem 0.5rem; font-size: 0.62rem; }
  .tm-opts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 6px; font-size: 0.62rem; color: var(--st-text-2); }
  .tm-opts label { display: inline-flex; gap: 4px; align-items: center; }
  .tm-basis { margin-left: auto; font-size: 0.6rem; color: var(--st-text-3); }
  .tm-src { font-size: 0.6rem; color: var(--st-text-3); white-space: nowrap; }
  .tm-mm { font-size: 0.6rem; color: var(--st-text-3); }
  .tm-link { cursor: pointer; text-decoration: underline; }
  .tm-cap { margin: 4px 0; font-size: 0.6rem; color: var(--st-text-3); }
  .tm-first td { border-top: 1px solid var(--st-surface-3); }
</style>
