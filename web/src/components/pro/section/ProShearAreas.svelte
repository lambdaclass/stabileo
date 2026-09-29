<script lang="ts">
  /**
   * Whether a section's members deform in shear, and with what areas: none (flexural only, as
   * every section solved before), from the geometry (recomputed from the shape every solve), or
   * declared. `section/shear-areas.ts` says how each shape is read.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { geometricShearAreas } from '../../../lib/section/shear-areas';
  import type { Section } from '../../../lib/store/model.svelte';

  let { section }: { section: Section } = $props();

  const mode = $derived(section.shearAreas?.basis ?? 'none');
  const geo = $derived(geometricShearAreas(section));
  const cm2 = (v: number) => (v * 1e4).toLocaleString(undefined, { maximumFractionDigits: 2 });

  function setMode(m: string) {
    if (m === 'none') modelStore.updateSection(section.id, { shearAreas: undefined });
    else if (m === 'geometry') modelStore.updateSection(section.id, { shearAreas: { basis: 'geometry' } });
    else modelStore.updateSection(section.id, { shearAreas: { basis: 'declared', asY: geo?.asY ?? (5 / 6) * section.a, asZ: geo?.asZ ?? (5 / 6) * section.a } });
  }
  function setDeclared(which: 'asY' | 'asZ', cm2Value: number) {
    const cur = section.shearAreas;
    if (!cur || cur.basis !== 'declared' || !(cm2Value > 0)) return;
    modelStore.updateSection(section.id, { shearAreas: { ...cur, [which]: cm2Value / 1e4 } });
  }
</script>

<div class="sa" data-testid="sec-shear-{section.id}">
  <label class="sa-row">{t('shear.title')}
    <select value={mode} onchange={(e) => setMode(e.currentTarget.value)} data-testid="sec-shear-mode-{section.id}">
      <option value="none">{t('shear.none')}</option>
      <option value="geometry" disabled={!geo}>{t('shear.geometry')}</option>
      <option value="declared">{t('shear.declared')}</option>
    </select>
  </label>
  {#if mode === 'geometry' && geo}
    <p class="sa-hint">{tp('shear.values', { y: cm2(geo.asY), z: cm2(geo.asZ) })}</p>
  {:else if mode === 'declared' && section.shearAreas?.basis === 'declared'}
    <div class="sa-row">
      <label>A<sub>s,y</sub> <input type="number" min="0" step="1" value={Math.round(section.shearAreas.asY * 1e6) / 100} onchange={(e) => setDeclared('asY', Number(e.currentTarget.value))} /> cm²</label>
      <label>A<sub>s,z</sub> <input type="number" min="0" step="1" value={Math.round(section.shearAreas.asZ * 1e6) / 100} onchange={(e) => setDeclared('asZ', Number(e.currentTarget.value))} /> cm²</label>
    </div>
  {:else if !geo}
    <p class="sa-hint">{t('shear.noShape')}</p>
  {/if}
</div>

<style>
  .sa { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; font-size: 0.66rem; color: var(--st-text-2); }
  .sa-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .sa-row input { width: 64px; }
  .sa-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
</style>
