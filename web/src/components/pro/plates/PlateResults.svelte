<script lang="ts">
  /**
   * The results of the plate selected whole, read as one object (`engine/plate-results.ts`): each
   * quantity's largest and smallest value over its mesh, the element or node where it occurs and
   * the result set, in the plate's own axes. "Show" selects that element.
   */
  import { modelStore, resultsStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { plateEntry, plateShellKeys } from '../../../lib/store/physical-plates';
  import { plateGeometry, plateLoops } from '../../../lib/model/physical/plate';
  import { plateSummary, type PlateQuantity } from '../../../lib/engine/plate-results';
  import { activePerCombo3D } from '../../../lib/store/active-results';
  import { discretizationStore } from '../../../lib/store/discretization.svelte';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import type { Quantity } from '../../../lib/utils/units';

  const id = $derived(uiStore.selectedPlates.size === 1 ? [...uiStore.selectedPlates][0]! : null);
  const entry = $derived.by(() => { void modelStore.model.groups; return id !== null ? plateEntry(id) : null; });

  const sets = $derived.by(() => {
    const r = resultsStore.results3D;
    if (!r) return [];
    if (resultsStore.activeView === 'envelope') {
      return [...activePerCombo3D()].map(([cid, res]) => ({ name: modelStore.combinations.find((c) => c.id === cid)?.name ?? `${t('pro.comboN')}${cid}`, result: res }));
    }
    const name = resultsStore.activeView === 'combo' && resultsStore.activeComboId !== null
      ? modelStore.combinations.find((c) => c.id === resultsStore.activeComboId)?.name ?? ''
      : resultsStore.activeView === 'single' && resultsStore.activeCaseId !== null
        ? modelStore.loadCases.find((c) => c.id === resultsStore.activeCaseId)?.name ?? ''
        : t('pro.queryAllLoads');
    return [{ name, result: r }];
  });

  const summary = $derived.by(() => {
    if (!entry || !sets.length) return null;
    const geo = plateGeometry(modelStore, entry.group);
    if (!geo) return null;
    const loops = plateLoops(entry.group);
    return {
      s: plateSummary(sets, { nodes: modelStore.nodes, quads: modelStore.quads, plates: modelStore.plates }, plateShellKeys(entry.id), [...loops.outer, ...loops.holes.flat(), ...loops.owned], geo.frame),
      first: [loops.outer[0], loops.outer[1]],
    };
  });

  /** The discretization-error estimate of the plate's elements (`store/discretization.svelte.ts`), worst first. */
  const error = $derived.by(() => {
    const s = discretizationStore.estimate as { status?: string; estimate?: { elements: Array<{ kind: string; elementId: number; localPercent?: number | null }>; threshold: number } } | null;
    if (!entry || s?.status !== 'done' || !s.estimate) return null;
    const keys = new Set(plateShellKeys(entry.id));
    const mine = s.estimate.elements.filter((e) => keys.has(`${e.kind === 'plate' ? 'p' : 'q'}${e.elementId}`) && Number.isFinite(e.localPercent ?? NaN));
    if (!mine.length) return null;
    const worst = mine.reduce((a, b) => ((b.localPercent ?? 0) > (a.localPercent ?? 0) ? b : a));
    return { pct: worst.localPercent!, at: `${worst.kind === 'plate' ? 'p' : 'q'}${worst.elementId}`, threshold: s.estimate.threshold };
  });

  const QTY: Record<PlateQuantity, { label: string; q: Quantity }> = {
    muu: { label: 'Muu', q: 'moment' }, mvv: { label: 'Mvv', q: 'moment' }, muv: { label: 'Muv', q: 'moment' },
    nuu: { label: 'Nuu', q: 'distributedLoad' }, nvv: { label: 'Nvv', q: 'distributedLoad' }, nuv: { label: 'Nuv', q: 'distributedLoad' },
    w: { label: 'w', q: 'displacement' },
  };
  const unitOf = (q: PlateQuantity) => (q === 'w' ? unitQ('displacement') : q.startsWith('m') ? `${unitQ('moment')}/m` : unitQ('distributedLoad'));
  const fmt = (q: PlateQuantity, v: number) => (q.startsWith('m') ? fmtQ(v, 'force') : fmtQ(v, QTY[q].q));
  function show(at: string) {
    if (at.startsWith('N')) { uiStore.selectNode(Number(at.slice(1))); return; }
    if (uiStore.shellPickScope !== 'element') uiStore.toast(t('plates.scopeNowElement'), 'info');
    uiStore.shellPickScope = 'element';
    uiStore.selectMode = 'shells';
    uiStore.selectShell(at, false);
  }
</script>

{#if entry && summary}
  <section class="pr" data-testid="plate-results">
    <header>
      <strong>{tp('plates.resultsTitle', { name: entry.name })}</strong>
      <span class="pr-dim">{sets.length > 1 ? tp('plates.resultsEnvelope', { n: sets.length }) : sets[0]!.name}</span>
    </header>
    {#if summary.s.elements === 0}
      <p class="pr-dim">{t('plates.resultsNoMesh')}</p>
    {:else}
      <p class="pr-dim">{tp('plates.resultsAxes', { a: summary.first[0] ?? '', b: summary.first[1] ?? '' })}</p>
      <table>
        <thead><tr><th></th><th>{t('plates.max')}</th><th></th><th>{t('plates.min')}</th><th></th></tr></thead>
        <tbody>
          {#each summary.s.rows as r (r.quantity)}
            <tr data-testid="plate-result-{r.quantity}">
              <td>{QTY[r.quantity].label} <span class="pr-dim">{unitOf(r.quantity)}</span></td>
              {#if r.max && r.min}
                <td class="num">{fmt(r.quantity, r.max.value)}</td>
                <td><button class="pr-at" onclick={() => show(r.max!.at)} title={r.max.source}>{r.max.at}{sets.length > 1 ? ` · ${r.max.source}` : ''}</button></td>
                <td class="num">{fmt(r.quantity, r.min.value)}</td>
                <td><button class="pr-at" onclick={() => show(r.min!.at)} title={r.min.source}>{r.min.at}{sets.length > 1 ? ` · ${r.min.source}` : ''}</button></td>
              {:else}
                <td colspan="4" class="pr-dim">—</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="pr-dim">{t('plates.resultsNote')}{summary.s.leftOut ? ' ' + tp('plates.resultsLeftOut', { n: summary.s.leftOut }) : ''}</p>
      {#if error}
        <p class:pr-warn={error.pct > error.threshold * 100} data-testid="plate-results-error">
          {tp('plates.resultsError', { pct: error.pct.toFixed(1) })} <button class="pr-at" onclick={() => show(error!.at)}>{error.at}</button>
        </p>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .pr { margin: 6px 0 10px; padding: 8px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); background: var(--st-surface-2); font-size: 0.72rem; color: var(--st-text-2); display: flex; flex-direction: column; gap: 4px; }
  header { display: flex; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
  header strong { color: var(--st-text); }
  .pr-dim { color: var(--st-text-3); margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 2px 4px; text-align: left; border-bottom: 1px solid var(--st-hair); }
  th { color: var(--st-text-3); font-weight: 500; }
  td.num { text-align: right; font-family: var(--st-font-mono, monospace); color: var(--st-text); }
  .pr-warn { color: var(--st-warn, #d9a441); margin: 0; }
  .pr-at { background: none; border: none; padding: 0; color: var(--st-accent); font: inherit; cursor: pointer; text-decoration: underline dotted; }
</style>
