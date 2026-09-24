<script lang="ts">
  /**
   * Member deflections relative to the chord: under service loads, or for the result set on
   * screen.
   *
   * "Service" is what the deflection check reads (`store/service-deflection.ts`), so this table
   * and the verification never disagree. "On screen" answers the question for whatever case,
   * combination or envelope member the viewport shows.
   */
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { downloadText } from '../../lib/store/file';
  import { serviceSets, serviceDeflections } from '../../lib/store/service-deflection';
  import { deflectionChecks, DEFLECTION_LIMIT } from '../../lib/store/serviceability';
  import { toCsv } from '../../lib/engine/result-tables';

  let source = $state<'service' | 'shown'>('service');
  const ROW_CAP = 2000;

  const svc = $derived(serviceSets());
  const rows = $derived.by(() => {
    const ids = [...modelStore.elements.values()].filter((e) => e.type === 'frame').map((e) => e.id);
    const shown = resultsStore.results3D;
    const sets = source === 'service' ? svc.sets : shown ? [{ id: 0, name: '', results: shown }] : [];
    return [...serviceDeflections(ids, sets)].map(([id, d]) => ({ id, ...d })).sort((a, b) => b.max / b.L - a.max / a.L);
  });

  // The check, for the beams, when reading service loads — the same one the verification runs.
  const checks = $derived(source === 'service' ? deflectionChecks().rows : new Map());
  const mm = (m: number) => (m * 1000).toFixed(2);
  const spanOver = (L: number, d: number) => (d > 0 ? `L/${Math.round(L / d)}` : 'L/∞');

  function csv() {
    downloadText(toCsv(
      [t('pro.elemLabel'), 'L (m)', 'δ (mm)', 'x (m)', 'L/δ', 'δy (mm)', 'δz (mm)', t('tables.source')],
      rows.map((r) => [r.id, r.L, r.max * 1000, r.x, r.max > 0 ? r.L / r.max : '', r.maxV * 1000, r.maxW * 1000, r.setName]),
    ), 'deflections.csv', 'text/csv;charset=utf-8');
  }
</script>

<div class="dt-bar">
  <div class="pk-tabs">
  <button class:on={source === 'service'} onclick={() => (source = 'service')} data-testid="defl-src-service">{t('defl.service')}</button>
  <button class:on={source === 'shown'} onclick={() => (source = 'shown')} data-testid="defl-src-shown">{t('tables.mode.current')}</button>
  </div>
  {#if source === 'service'}
    <span class="dt-basis">{svc.basis === 'service' ? tp('pro.deflBasisService', { names: svc.names.join(', ') }) : t(`pro.deflBasis.${svc.basis}`)}</span>
  {/if}
  <button class="pk-btn dt-csv" onclick={csv}>CSV</button>
</div>
<div class="pro-res-table-wrap">
  <table class="pro-res-table" data-testid="defl-table">
    <thead><tr><th>{t('pro.elemLabel')}</th><th>L (m)</th><th>δ (mm)</th><th>x (m)</th><th>L/δ</th><th>δy (mm)</th><th>δz (mm)</th>{#if source === 'service'}<th>{t('tables.source')}</th><th title={t('defl.checkHint')}>{DEFLECTION_LIMIT}</th>{/if}</tr></thead>
    <tbody>
      {#each rows.slice(0, ROW_CAP) as r (r.id)}
        <tr onclick={() => { uiStore.selectMode = 'elements'; uiStore.selectElement(r.id, false); }} style="cursor:pointer">
          <td class="col-id">{r.id}</td>
          <td class="col-num">{r.L.toFixed(2)}</td>
          <td class="col-num">{mm(r.max)}</td>
          <td class="col-num">{r.x.toFixed(2)}</td>
          <td class="col-num">{spanOver(r.L, r.max)}</td>
          <td class="col-num">{mm(r.maxV)}</td>
          <td class="col-num">{mm(r.maxW)}</td>
          {#if source === 'service'}
            {@const c = checks.get(r.id)}
            <td class="dt-src">{r.setName || '—'}</td>
            <td class={c ? `dt-${c.check.status}` : 'dt-src'} title={c ? `${c.family} · δ total ${mm(c.check.deltaTotal)} mm / ${mm(c.check.limit)} mm` : t('defl.notBeam')}>{c ? `${(c.check.ratio * 100).toFixed(0)} %` : '—'}</td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="dt-note">{t('defl.note')}</p>
</div>

<style>
  .dt-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 4px 0 6px; }
  .dt-basis { font-size: 0.6rem; color: var(--st-text-3); }
  .dt-csv { margin-left: auto; min-height: 22px; padding: 0.1rem 0.5rem; font-size: 0.62rem; }
  .dt-src { font-size: 0.6rem; color: var(--st-text-3); white-space: nowrap; }
  .dt-note { margin: 4px 0; font-size: 0.6rem; color: var(--st-text-3); }
  .dt-ok { color: var(--st-ok); }
  .dt-warn { color: var(--st-warn); }
  .dt-fail { color: var(--st-danger); }
</style>
