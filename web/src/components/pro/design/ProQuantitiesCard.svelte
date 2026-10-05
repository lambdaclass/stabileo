<script lang="ts">
  import { plainNumber } from '../../../lib/utils/units';
  /**
   * The project's quantities (`engine/quantities.ts`): concrete and structural steel from the
   * geometry, reinforcement from the bar schedule of the detailing, steel per cubic metre over the
   * detailed members. The report's quantities section is the same numbers.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { projectQuantities } from '../../../lib/engine/quantities';
  import { downloadText } from '../../../lib/store/file';
  import { exportToExcel } from '../../../lib/export/excel';
  import { toCsv } from '../../../lib/engine/result-tables';

  const q = $derived(projectQuantities(
    { nodes: modelStore.nodes, elements: modelStore.elements, sections: modelStore.sections, materials: modelStore.materials, plates: modelStore.plates, quads: modelStore.quads } as never,
    detailingStore.assemblies.flatMap((a) => a.marks),
  ));

  function rows(): Array<Array<string | number>> {
    const out: Array<Array<string | number>> = [[t('report.material'), t('report.qty.volume') + ' (m³)', t('report.qty.weight') + ' (kN)']];
    for (const m of q.model.byMaterial) out.push([m.name, m.volume, m.weight]);
    out.push([]);
    if (q.reinforcement) {
      out.push(['Ø (mm)', t('report.qty.bars'), t('report.qty.length') + ' (m)', t('report.qty.mass') + ' (kg)']);
      for (const d of q.reinforcement.byDiameter) out.push([d.diameterMm, d.quantity, d.lengthM, d.massKg]);
      out.push([t('report.steelTotal'), '', '', q.reinforcement.totalKg]);
      if (q.kgPerM3 !== null) out.push([t('report.steelRatio') + ' (kg/m³)', q.kgPerM3]);
    }
    return out;
  }
  const csv = () => { const [h, ...r] = rows(); downloadText(toCsv(h!.map(String), r), 'quantities.csv', 'text/csv;charset=utf-8'); };
  const xlsx = () => exportToExcel({ filename: 'quantities.xlsx', onlyExtras: true, extraSheets: [{ name: t('report.quantities').slice(0, 31), rows: rows() }] });
  const f = (v: number, d = 2) => plainNumber(v, d);
</script>

<section class="qty pk-card" data-testid="quantities">
  <h4 class="pk-heading">{t('report.quantities')}</h4>
  <table class="qty-t">
    <thead><tr><th>{t('report.material')}</th><th>m³</th><th>kN</th></tr></thead>
    <tbody>
      {#each q.model.byMaterial as m (m.materialId)}<tr><td>{m.name}</td><td class="num">{f(m.volume, 3)}</td><td class="num">{f(m.weight, 1)}</td></tr>{/each}
    </tbody>
  </table>
  <p class="qty-line" data-testid="qty-concrete">{t('report.concrete')}: <strong>{f(q.model.concreteVolume)} m³</strong> · {t('report.qty.structuralSteel')}: <strong>{f(q.model.steelWeight / 9.80665)} t</strong></p>
  {#if q.reinforcement}
    <table class="qty-t" data-testid="qty-rebar">
      <thead><tr><th>Ø</th><th>{t('report.qty.bars')}</th><th>m</th><th>kg</th></tr></thead>
      <tbody>
        {#each q.reinforcement.byDiameter as d (d.diameterMm)}<tr><td class="num">{d.diameterMm}</td><td class="num">{d.quantity}</td><td class="num">{f(d.lengthM, 1)}</td><td class="num">{f(d.massKg, 1)}</td></tr>{/each}
      </tbody>
    </table>
    <p class="qty-line">{t('report.steelTotal')}: <strong>{f(q.reinforcement.totalKg, 0)} kg</strong>{#if q.kgPerM3 !== null} · {t('report.steelRatio')}: <strong data-testid="qty-ratio">{f(q.kgPerM3, 0)} kg/m³</strong>{/if}</p>
    <p class="qty-hint">{tp('report.qty.coverage', { n: q.reinforcement.members.length, v: f(q.detailedConcreteVolume), total: f(q.model.concreteVolume) })}</p>
  {:else}
    <p class="qty-hint">{t('report.qty.noDetailing')}</p>
  {/if}
  <div class="qty-actions">
    <button class="pk-btn" onclick={csv} data-testid="qty-csv">CSV</button>
    <button class="pk-btn" onclick={xlsx} data-testid="qty-xlsx">Excel</button>
  </div>
</section>

<style>
  .qty { margin: 8px 0; font-size: 0.66rem; color: var(--st-text-2); }
  .qty-t { border-collapse: collapse; margin: 4px 0; }
  .qty-t th, .qty-t td { padding: 2px 8px; text-align: left; border-bottom: 1px solid var(--st-surface-2); }
  .qty-t .num { text-align: right; font-variant-numeric: tabular-nums; }
  .qty-line { margin: 4px 0; }
  .qty-hint { margin: 2px 0; font-size: 0.6rem; color: var(--st-text-2); }
  .qty-actions { display: flex; gap: 6px; }
</style>
