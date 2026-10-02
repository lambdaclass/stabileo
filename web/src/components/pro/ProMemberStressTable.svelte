<script lang="ts">
  /**
   * Signed normal stress along the members of the result set on screen: at each station, the
   * largest tension and the largest compression on the cross-section (`engine/member-stresses.ts`).
   * Sorted by the largest magnitude, narrowed to the selection if wanted, exportable.
   */
  import { memberSectionAt } from '../../lib/section/variable';
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { downloadText } from '../../lib/store/file';
  import { toCsv } from '../../lib/engine/result-tables';
  import { sectionStressModel, memberStationStresses, type StationStress, type SectionStressModel } from '../../lib/engine/member-stresses';

  const ROW_CAP = 2000;
  let stations = $state(5);
  let onlySelection = $state(false);

  const rows = $derived.by(() => {
    const r = resultsStore.results3D;
    if (!r) return [];
    const models = new Map<number, SectionStressModel | null>();
    const sel = onlySelection ? uiStore.selectedElements : null;
    const out: StationStress[] = [];
    for (const ef of r.elementForces) {
      if (sel && !sel.has(ef.elementId)) continue;
      const e = modelStore.elements.get(ef.elementId);
      if (!e) continue;
      if (e.variableSection) {
        // Each station with the section it has there.
        out.push(...memberStationStresses(ef, (t: number) => { const s = memberSectionAt(modelStore.sections, e, t); return s ? sectionStressModel(s as never) : null; }, stations));
        continue;
      }
      if (!models.has(e.sectionId)) {
        const s = modelStore.sections.get(e.sectionId);
        models.set(e.sectionId, s ? sectionStressModel(s as never) : null);
      }
      const m = models.get(e.sectionId);
      if (m) out.push(...memberStationStresses(ef, m, stations));
    }
    return out.sort((a, b) => Math.max(Math.abs(b.sigmaMax), Math.abs(b.sigmaMin)) - Math.max(Math.abs(a.sigmaMax), Math.abs(a.sigmaMin)));
  });
  const unread = $derived.by(() => {
    const r = resultsStore.results3D;
    if (!r) return 0;
    const read = new Set(rows.map((x) => x.elementId));
    return r.elementForces.filter((f) => (!onlySelection || uiStore.selectedElements.has(f.elementId)) && !read.has(f.elementId)).length;
  });

  const fmt = (v: number) => (Math.abs(v) < 5e-4 ? '0' : v.toFixed(2));
  function csv() {
    downloadText(toCsv([t('pro.elemLabel'), 'x (m)', `${t('mstress.tension')} (MPa)`, `${t('mstress.compression')} (MPa)`, t('mstress.basis')],
      rows.map((r) => [r.elementId, r.x, r.sigmaMax, r.sigmaMin, r.basis])), 'member-stresses.csv', 'text/csv;charset=utf-8');
  }
  function pick(id: number) { uiStore.selectMode = 'elements'; uiStore.selectElement(id, false); }
</script>

<div class="ms-bar" data-testid="member-stress">
  <label>{t('tables.stations')}
    <select bind:value={stations} data-testid="ms-stations">{#each [3, 5, 9, 17] as n (n)}<option value={n}>{n}</option>{/each}</select>
  </label>
  <label><input type="checkbox" bind:checked={onlySelection} /> {t('tables.range.selection')}</label>
  <button class="pk-btn ms-csv" onclick={csv}>CSV</button>
</div>
<div class="pro-res-table-wrap">
  <table class="pro-res-table" data-testid="ms-table">
    <thead><tr><th>{t('pro.elemLabel')}</th><th>x (m)</th><th>{t('mstress.tension')} (MPa)</th><th>{t('mstress.compression')} (MPa)</th></tr></thead>
    <tbody>
      {#each rows.slice(0, ROW_CAP) as r, i (i)}
        <tr onclick={() => pick(r.elementId)} style="cursor:pointer" title={r.basis === 'bounds' ? t('mstress.boundsHint') : undefined}>
          <td class="col-id">{r.elementId}{r.basis === 'bounds' ? ' *' : ''}</td>
          <td class="col-num">{r.x.toFixed(2)}</td>
          <td class="col-num ms-t">{fmt(Math.max(0, r.sigmaMax))}</td>
          <td class="col-num ms-c">{fmt(Math.min(0, r.sigmaMin))}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if rows.length > ROW_CAP}<p class="ms-note">{tp('tables.capped', { shown: ROW_CAP, total: rows.length })}</p>{/if}
  {#if unread > 0}<p class="ms-note">{tp('mstress.unread', { n: unread })}</p>{/if}
  <p class="ms-note">{t('mstress.note')}</p>
</div>

<style>
  .ms-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 4px 0 6px; font-size: 0.62rem; color: var(--st-text-2); }
  .ms-bar label { display: inline-flex; gap: 4px; align-items: center; }
  .ms-csv { margin-left: auto; min-height: 22px; padding: 0.1rem 0.5rem; font-size: 0.62rem; }
  .ms-note { margin: 4px 0; font-size: 0.6rem; color: var(--st-text-3); }
</style>
