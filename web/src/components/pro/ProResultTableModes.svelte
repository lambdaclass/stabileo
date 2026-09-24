<script module lang="ts">
  export type TableMode = 'current' | 'all' | 'summary' | 'envelope' | 'maxType';
</script>

<script lang="ts">
  /**
   * The same result table read across combinations: all of them, a summary, an envelope, and —
   * for members — the governing demand of each type along the member.
   *
   * "On screen" is the table as it always was: the result set the viewport shows. The other
   * views read the ACTIVE combinations (`store/active-results.ts`), or the load cases when
   * nothing is combined, so they answer for the same set design reads. See
   * `engine/result-tables.ts` for what each view computes.
   */
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { activePerCombo3D, activeCombinations } from '../../lib/store/active-results';
  import { downloadText } from '../../lib/store/file';
  import { computeStationDemands } from '../../lib/engine/verification-service';
  import {
    COLUMNS, allRows, summaryRows, envelopeRows, maxByType, toCsv,
    type TableKind, type Source,
  } from '../../lib/engine/result-tables';
  import type { AnalysisResults3D } from '../../lib/engine/types-3d';

  let { kind, mode = $bindable('current') }: { kind: TableKind; mode?: TableMode } = $props();

  /** Rows drawn at most; the CSV always carries every row. */
  const ROW_CAP = 2000;

  const modes = $derived<TableMode[]>(kind === 'forces' ? ['current', 'all', 'summary', 'envelope', 'maxType'] : ['current', 'all', 'summary', 'envelope']);
  const cols = $derived(COLUMNS[kind]);
  const isNode = $derived(kind !== 'forces');

  /** What the across-combination views read: the active combinations, else the cases. */
  const sources = $derived.by<Source[]>(() => {
    const combos = activePerCombo3D();
    if (combos.size > 0) {
      const names = new Map(modelStore.combinations.map((c) => [c.id, c.name]));
      return [...combos].map(([id, results]) => ({ id, name: names.get(id) ?? `${t('pro.comboN')}${id}`, results }));
    }
    const names = new Map(modelStore.loadCases.map((c) => [c.id, c.name]));
    return [...resultsStore.perCase3D].map(([id, results]) => ({ id, name: names.get(id) ?? `${t('pro.caseN')}${id}`, results }));
  });
  const basis = $derived(activePerCombo3D().size > 0 ? 'combos' : 'cases');

  const all = $derived(mode === 'all' ? allRows(kind, sources) : []);
  const summary = $derived(mode === 'summary' ? summaryRows(kind, sources) : []);
  const envelope = $derived(mode === 'envelope' ? envelopeRows(kind, sources) : []);
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
    return maxByType(computeStationDemands(perCombo, combos, md as never).demands);
  });

  function fmt(n: number): string {
    if (!Number.isFinite(n)) return '—';
    if (n === 0) return '0';
    if (Math.abs(n) < 0.001) return n.toExponential(2);
    if (Math.abs(n) < 1) return n.toFixed(4);
    return n.toFixed(2);
  }
  const where = (entity: number, end?: 'i' | 'j') => (end ? `${entity}·${end}` : String(entity));

  function pick(entity: number) {
    if (isNode) { uiStore.selectMode = 'nodes'; uiStore.selectNode(entity, false); }
    else { uiStore.selectMode = 'elements'; uiStore.selectElement(entity, false); }
  }

  function csv() {
    const id = isNode ? t('pro.nodeLabel') : t('pro.elemLabel');
    const head = (c: { label: string; unit: string }) => `${c.label} (${c.unit})`;
    let text = '';
    if (mode === 'all') {
      text = toCsv([t('tables.source'), id, ...(isNode ? [] : [t('tables.end')]), ...cols.map(head)],
        all.map((r) => [r.source.name, r.entity, ...(isNode ? [] : [r.end!]), ...r.values]));
    } else if (mode === 'summary') {
      text = toCsv([t('tables.column'), t('tables.max'), id, t('tables.source'), t('tables.min'), id, t('tables.source')],
        summary.map((s) => [head(s.column), s.max?.value ?? '', s.max ? where(s.max.entity, s.max.end) : '', s.max?.source.name ?? '',
          s.min?.value ?? '', s.min ? where(s.min.entity, s.min.end) : '', s.min?.source.name ?? '']));
    } else if (mode === 'envelope') {
      text = toCsv([id, ...(isNode ? [] : [t('tables.end')]), ...cols.flatMap((c) => [`${head(c)} ${t('tables.max')}`, t('tables.source'), `${head(c)} ${t('tables.min')}`, t('tables.source')])],
        envelope.map((r) => [r.entity, ...(isNode ? [] : [r.end!]), ...cols.flatMap((_, c) => [r.max[c]!.value, r.max[c]!.source.name, r.min[c]!.value, r.min[c]!.source.name])]));
    } else if (mode === 'maxType') {
      const d = (g: typeof byType[number]['axial']) => (g ? [g.value, g.stationX, g.comboName] : ['', '', '']);
      text = toCsv([id, 'L (m)', 'N (kN)', 'x (m)', t('tables.source'), 'M (kN·m)', 'x (m)', t('tables.source'), 'V (kN)', 'x (m)', t('tables.source')],
        byType.map((r) => [r.elementId, r.length, ...d(r.axial), ...d(r.bending), ...d(r.shear)]));
    }
    downloadText(text, `${kind}-${mode}.csv`, 'text/csv;charset=utf-8');
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
    <span class="tm-basis">{basis === 'combos' ? tp('tables.basisCombos', { n: sources.length }) : tp('tables.basisCases', { n: sources.length })}</span>
    <button class="pk-btn tm-csv" onclick={csv} data-testid="tm-csv">CSV</button>
  {/if}
</div>

{#if mode === 'all'}
  <div class="pro-res-table-wrap">
    <table class="pro-res-table">
      <thead><tr><th>{t('tables.source')}</th><th>{isNode ? t('pro.nodeLabel') : t('pro.elemLabel')}</th>{#if !isNode}<th>Ext.</th>{/if}{#each cols as c (c.key)}<th>{c.label} ({c.unit})</th>{/each}</tr></thead>
      <tbody>
        {#each all.slice(0, ROW_CAP) as r, i (i)}
          <tr onclick={() => pick(r.entity)} style="cursor:pointer">
            <td class="tm-src">{r.source.name}</td><td class="col-id">{r.entity}</td>{#if !isNode}<td class="col-end">{r.end}</td>{/if}
            {#each r.values as v, c (c)}<td class="col-num">{fmt(v)}</td>{/each}
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
            <td class="col-id">{s.column.label} ({s.column.unit})</td>
            {#if s.max}<td class="col-num">{fmt(s.max.value)}</td><td class="col-id tm-link" onclick={() => pick(s.max!.entity)}>{where(s.max.entity, s.max.end)}</td><td class="tm-src">{s.max.source.name}</td>{:else}<td colspan="3">—</td>{/if}
            {#if s.min}<td class="col-num">{fmt(s.min.value)}</td><td class="col-id tm-link" onclick={() => pick(s.min!.entity)}>{where(s.min.entity, s.min.end)}</td><td class="tm-src">{s.min.source.name}</td>{:else}<td colspan="3">—</td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else if mode === 'envelope'}
  <div class="pro-res-table-wrap">
    <table class="pro-res-table">
      <thead><tr><th>{isNode ? t('pro.nodeLabel') : t('pro.elemLabel')}</th>{#if !isNode}<th>Ext.</th>{/if}<th></th>{#each cols as c (c.key)}<th>{c.label} ({c.unit})</th>{/each}</tr></thead>
      <tbody>
        {#each envelope.slice(0, ROW_CAP) as r, i (i)}
          <tr onclick={() => pick(r.entity)} style="cursor:pointer">
            <td class="col-id" rowspan="2">{r.entity}</td>{#if !isNode}<td class="col-end" rowspan="2">{r.end}</td>{/if}
            <td class="tm-mm">{t('tables.max')}</td>
            {#each r.max as m, c (c)}<td class="col-num" title={m.source.name}>{fmt(m.value)}</td>{/each}
          </tr>
          <tr>
            <td class="tm-mm">{t('tables.min')}</td>
            {#each r.min as m, c (c)}<td class="col-num" title={m.source.name}>{fmt(m.value)}</td>{/each}
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="tm-cap">{t('tables.envelopeHint')}</p>
  </div>
{:else if mode === 'maxType'}
  <div class="pro-res-table-wrap">
    <table class="pro-res-table" data-testid="tm-maxtype">
      <thead>
        <tr><th rowspan="2">{t('pro.elemLabel')}</th><th colspan="3">{t('tables.maxAxial')}</th><th colspan="3">{t('tables.maxBending')}</th><th colspan="3">{t('tables.maxShear')}</th></tr>
        <tr>{#each [0, 1, 2] as k (k)}<th>{k === 0 ? 'kN' : k === 1 ? 'kN·m' : 'kN'}</th><th>x (m)</th><th>{t('tables.source')}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each byType.slice(0, ROW_CAP) as r (r.elementId)}
          <tr onclick={() => pick(r.elementId)} style="cursor:pointer">
            <td class="col-id">{r.elementId}</td>
            {#each [r.axial, r.bending, r.shear] as g, k (k)}
              {#if g}<td class="col-num">{fmt(g.value)}</td><td class="col-num">{fmt(g.stationX)}</td><td class="tm-src">{g.comboName}{k === 1 ? ` · ${g.category.slice(0, 2)}` : ''}</td>{:else}<td colspan="3">—</td>{/if}
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
  .tm-basis { margin-left: auto; font-size: 0.6rem; color: var(--st-text-3); }
  .tm-src { font-size: 0.6rem; color: var(--st-text-3); white-space: nowrap; }
  .tm-mm { font-size: 0.6rem; color: var(--st-text-3); }
  .tm-link { cursor: pointer; text-decoration: underline; }
  .tm-cap { margin: 4px 0; font-size: 0.6rem; color: var(--st-text-3); }
</style>
