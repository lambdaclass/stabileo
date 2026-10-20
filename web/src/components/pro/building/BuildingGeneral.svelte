<script lang="ts">
  /**
   * The building's general data, stated once before any element is placed: the concrete it is
   * built in, the reinforcing steel, the structural steel for steel typologies, and the codes in
   * force. Every tool below places with these. Covers, exposure and the diameters the design may
   * use are the project's design data, opened here in place (`ProDesignDataPanel`, the same panel
   * the design desk shows).
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { te } from '../../../lib/i18n/engine-text';
  import { buildingUi } from '../../../lib/store/building-ui.svelte';
  import { familyOfMaterial } from '../../../lib/model/building/typology-defaults';
  import { REBAR_GRADES } from '../../../lib/model/design-data';
  import { designData, patchDesignData } from '../../../lib/store/design-data';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import { proNav } from '../../../lib/store/pro-nav.svelte';
  import { assignConcrete } from '../../../lib/model/building/assign-concrete';
  import { physicalGroups } from '../../../lib/store/physical';
  import ProDesignDataPanel from '../ProDesignDataPanel.svelte';

  const materials = $derived([...modelStore.materials.values()]);
  const concretes = $derived(materials.filter((m) => familyOfMaterial(m) === 'concrete'));
  const steels = $derived(materials.filter((m) => familyOfMaterial(m) === 'steel'));
  const d = $derived.by(() => { void modelStore.designData; return designData(); });
  const codes = $derived(regulationsStore.stamps.map((s) => `${te(s.label)} ${s.edition}`.trim()).join(' · '));
  /** What is placed already in another concrete: offered to take the building's. */
  const others = $derived(physicalGroups().filter((g) => ['column', 'beam', 'slab', 'wall'].includes(g.physical.kind)
    && [...(g.members.elements ?? []).map((id) => modelStore.elements.get(id)?.materialId), ...(g.members.quads ?? []).map((id) => modelStore.quads.get(id)?.materialId)]
      .some((m) => m !== undefined && m !== buildingUi.concreteId && concretes.some((c) => c.id === m))).length);
  let applied = $state<number | null>(null);
  function applyConcrete() {
    const id = buildingUi.concreteId;
    applied = (['column', 'beam', 'slab', 'wall'] as const).reduce((n, k) => n + assignConcrete(k, id), 0);
  }
  function grade(name: string) {
    const g = REBAR_GRADES.find((x) => x.name === name);
    if (g) patchDesignData({ rebarGrade: g.name, rebarFy: g.fy });
  }
</script>

<section class="pk-card bg" data-testid="building-general">
  <div class="bg-grid">
    <label>{t('building.general.concrete')}
      <select value={buildingUi.concreteId} onchange={(e) => (buildingUi.concreteId = Number(e.currentTarget.value))} data-testid="building-material">
        {#if concretes.length === 0}<option value={0}>{t('building.general.noConcrete')}</option>{/if}
        {#each concretes as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
      </select>
    </label>
    <label>{t('building.general.rebar')}
      <select value={d.rebarGrade} onchange={(e) => grade(e.currentTarget.value)} data-testid="building-rebar-grade">
        {#each REBAR_GRADES as g (g.name)}<option value={g.name}>{g.name}</option>{/each}
        {#if !REBAR_GRADES.some((g) => g.name === d.rebarGrade)}<option value={d.rebarGrade}>{d.rebarGrade}</option>{/if}
      </select>
    </label>
    {#if steels.length > 0}
      <label>{t('building.general.steel')}
        <select value={buildingUi.steelId} onchange={(e) => (buildingUi.steelId = Number(e.currentTarget.value))} data-testid="building-steel">
          {#each steels as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
        </select>
      </label>
    {/if}
  </div>
  <div class="bg-codes">
    <span class="bg-label">{t('building.general.codes')}</span>
    <span class="bg-val" data-testid="building-codes">{codes || t('building.general.noCodes')}</span>
    <button class="pk-btn" onclick={() => proNav.openRegulations()} data-testid="building-codes-edit">{t('building.general.codesEdit')}</button>
  </div>
  {#if others > 0}
    <div class="bg-codes">
      <span class="bg-val">{tp('building.general.otherConcrete', { n: others })}</span>
      <button class="pk-btn" onclick={applyConcrete} data-testid="building-apply-concrete">{t('building.general.applyConcrete')}</button>
    </div>
  {/if}
  {#if applied !== null}<p class="pk-hint" role="status">{tp('building.general.applied', { n: applied })}</p>{/if}
  <details class="bg-more" data-testid="building-general-more">
    <summary>{t('building.general.more')} <span class="pk-hint">· {tp('building.general.moreSummary', { c: Math.round(d.covers.beam * 1000), e: t(`designData.exp.${d.exposure.beam}`) })}</span></summary>
    <ProDesignDataPanel />
  </details>
</section>

<style>
  .bg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 6px; }
  .bg-grid label { display: flex; flex-direction: column; gap: 2px; font-size: 0.7rem; color: var(--st-text-2); }
  .bg-grid select { font-size: 0.72rem; }
  .bg-codes { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-top: 6px; font-size: 0.7rem; }
  .bg-label { color: var(--st-text-2); }
  .bg-val { color: var(--st-text); min-width: 0; }
  .bg-more { margin-top: 6px; }
  .bg-more summary { cursor: pointer; font-size: 0.7rem; color: var(--st-text-2); }
</style>
