<script lang="ts">
  /** The steel of the model by profile: members, length, kg/m and kg, and the total. */
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { steelTakeoff } from '../../../../lib/engine/steel/takeoff';
  import { materialFamilyOf } from '../../../../lib/engine/steel/material-family';
  import { catalogueGradeFamily } from '../../../../lib/engine/steel/grade-family';
  import { memberMeanArea } from '../../../../lib/section/variable';

  const take = $derived.by(() => {
    const members = [];
    for (const e of modelStore.model.elements.values()) {
      const m = modelStore.model.materials.get(e.materialId), s = modelStore.model.sections.get(e.sectionId);
      if (!m || !s || materialFamilyOf(m as never, catalogueGradeFamily).family !== 'steel') continue;
      const a = modelStore.model.nodes.get(e.nodeI), b = modelStore.model.nodes.get(e.nodeJ);
      if (!a || !b) continue;
      const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
      members.push({ id: e.id, L, sectionName: s.name, area: memberMeanArea(modelStore.model.sections as never, e as never) ?? s.a, rho: (m as { rho?: number }).rho });
    }
    return steelTakeoff({ members });
  });
</script>

{#if take.rows.length}
  <section class="st" data-testid="steel-takeoff">
    <h5>{t('steel.takeoff.title')}</h5>
    <table>
      <thead><tr><th>{t('steel.takeoff.profile')}</th><th class="num">n</th><th class="num">L (m)</th><th class="num">kg/m</th><th class="num">kg</th></tr></thead>
      <tbody>
        {#each take.rows as r (r.profile)}<tr><td>{r.profile}</td><td class="num">{r.members}</td><td class="num">{r.length.toFixed(2)}</td><td class="num">{r.kgPerM.toFixed(2)}</td><td class="num">{r.kg.toFixed(1)}</td></tr>{/each}
        <tr class="sum"><td>{t('steel.takeoff.total')}</td><td class="num">{take.rows.reduce((s, r) => s + r.members, 0)}</td><td class="num">{take.totalLength.toFixed(2)}</td><td></td><td class="num">{take.totalKg.toFixed(1)}</td></tr>
      </tbody>
    </table>
    <p class="st-n">{tp('steel.takeoff.note', { t: (take.totalKg / 1000).toFixed(2) })}</p>
  </section>
{/if}

<style>
  .st { margin-top: 10px; font-size: 0.72rem; }
  h5 { margin: 0 0 4px; font-size: 0.74rem; color: var(--st-info); }
  table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { padding: 1px 6px; border-top: 1px solid var(--st-hair); text-align: left; font-weight: 400; }
  .num { text-align: right; }
  .sum td { font-weight: 600; }
  .st-n { color: var(--st-text-3); font-size: 0.64rem; margin: 3px 0 0; }
</style>
