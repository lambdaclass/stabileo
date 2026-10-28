<script lang="ts">
  /**
   * Converting part of a template into members (`model/underlay-convert.ts`): the layers that hold
   * members and columns, the sections they take, the tolerance; then the plan, what it adds, what
   * it leaves out and why, before anything changes. Applied as one undo step.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { planConversion } from '../../../lib/model/underlay-convert';
  import { applyConversion } from '../../../lib/store/underlay-convert';
  import type { Underlay } from '../../../lib/model/underlay';
  import type { Level } from '../../../lib/model/grid';

  let { u, levels, onclose }: { u: Underlay; levels: Level[]; onclose: () => void } = $props();
  const layers = u.layers ?? [];
  const guess = (re: RegExp) => layers.filter((l) => re.test(l));
  let memberLayers = $state<string[]>(guess(/VIG|BEAM|STB_BEAM/i));
  let columnLayers = $state<string[]>(guess(/COL|PIL|STB_COLUMN/i));
  let tolMm = $state(20);
  let maxColumn = $state(1.0);
  const sections = $derived([...modelStore.sections.values()]);
  const materials = $derived([...modelStore.materials.values()]);
  let beamSection = $state([...modelStore.sections.keys()][0] ?? 1);
  let columnSection = $state([...modelStore.sections.keys()][0] ?? 1);
  let materialId = $state([...modelStore.materials.keys()][0] ?? 1);
  const below = $derived([...levels].filter((l) => l.z < u.z - 1e-6).sort((a, b) => b.z - a.z)[0] ?? null);
  let result = $state<string | null>(null);

  const plan = $derived.by(() => {
    void modelStore.modelVersion;
    return planConversion(u, { memberLayers, columnLayers, tol: tolMm / 1000, maxColumn, columnFootZ: below?.z ?? null }, modelStore.model as never);
  });
  const toggle = (list: string[], l: string) => (list.includes(l) ? list.filter((x) => x !== l) : [...list, l]);
  const adds = $derived(plan.beams.length + plan.arcs.length + plan.columns.length);

  function apply() {
    const r = applyConversion(u, plan, { beamSection, columnSection, materialId, tol: tolMm / 1000, columnFootZ: below?.z ?? null, memberLayers, columnLayers });
    result = tp('convert.applied', { members: r.members, arcs: r.arcs, columns: r.columns });
  }
  const pt = (p: [number, number]) => `(${p[0].toFixed(2)}; ${p[1].toFixed(2)})`;
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<div class="cv-overlay" onclick={onclose} role="presentation">
  <div class="cv" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" aria-label={t('convert.title')} data-testid="underlay-convert-dialog">
    <h3>{tp('convert.titleOf', { name: u.name })}</h3>
    <p class="cv-hint">{tp('convert.where', { level: levels.find((l) => l.id === u.levelId)?.name ?? `z = ${u.z}`, below: below?.name ?? t('convert.noLevelBelow') })}</p>
    <div class="cv-cols">
      <fieldset><legend>{t('convert.memberLayers')}</legend>
        {#each layers as l (l)}<label><input type="checkbox" checked={memberLayers.includes(l)} onchange={() => (memberLayers = toggle(memberLayers, l))} data-testid="convert-member-{l}" /> {l}</label>{/each}
      </fieldset>
      <fieldset><legend>{t('convert.columnLayers')}</legend>
        {#each layers as l (l)}<label><input type="checkbox" checked={columnLayers.includes(l)} onchange={() => (columnLayers = toggle(columnLayers, l))} data-testid="convert-column-{l}" /> {l}</label>{/each}
      </fieldset>
    </div>
    <div class="cv-row">
      <label>{t('convert.beamSection')} <select bind:value={beamSection}>{#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select></label>
      <label>{t('convert.columnSection')} <select bind:value={columnSection}>{#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select></label>
      <label>{t('pro.thMaterial')} <select bind:value={materialId}>{#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select></label>
    </div>
    <div class="cv-row">
      <label>{t('convert.tolerance')} <input type="number" min="1" max="200" bind:value={tolMm} data-testid="convert-tol" /> mm</label>
      <label>{t('convert.maxColumn')} <input type="number" min="0.1" max="3" step="0.1" bind:value={maxColumn} /> m</label>
    </div>

    <table class="cv-plan" data-testid="convert-plan">
      <tbody>
        <tr><td>{t('convert.members')}</td><td>{plan.beams.length}</td></tr>
        <tr><td>{t('convert.curved')}</td><td>{plan.arcs.length}</td></tr>
        <tr><td>{t('convert.columns')}</td><td>{plan.columns.length}{plan.columnsWithoutFoot ? ` · ${tp('convert.noFoot', { n: plan.columnsWithoutFoot })}` : ''}</td></tr>
        <tr><td>{t('convert.existing')}</td><td>{plan.existing}</td></tr>
        <tr><td>{t('convert.duplicates')}</td><td>{plan.duplicates}</td></tr>
        <tr><td>{t('convert.welded')}</td><td>{plan.welded}</td></tr>
        <tr><td>{t('convert.tees')}</td><td>{plan.tees.length}</td></tr>
        <tr class:warn={plan.loose.length > 0}><td>{t('convert.loose')}</td><td>{plan.loose.length}{plan.loose.length ? `: ${plan.loose.slice(0, 6).map(pt).join(', ')}${plan.loose.length > 6 ? '…' : ''}` : ''}</td></tr>
      </tbody>
    </table>
    {#if Object.keys(plan.skipped).length || u.leftOut}
      <p class="cv-hint">{tp('convert.notConverted', { list: Object.entries({ ...(u.leftOut ?? {}), ...plan.skipped }).map(([k, n]) => `${k} ${n}`).join(', ') })}</p>
    {/if}
    <p class="cv-hint">{t('convert.labelsNote')}</p>
    {#if result}<p class="cv-msg" data-testid="convert-result">{result}</p>{/if}
    <div class="cv-actions">
      <button class="cv-btn" onclick={onclose}>{t('plates.close')}</button>
      <button class="cv-btn primary" disabled={adds === 0} onclick={apply} data-testid="convert-apply">{tp('convert.apply', { n: adds })}</button>
    </div>
  </div>
</div>

<style>
  .cv-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 16px; }
  .cv { width: min(560px, 100%); max-height: 90vh; overflow: auto; background: var(--st-surface); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); padding: 14px; display: flex; flex-direction: column; gap: 8px; font-size: 0.75rem; }
  h3 { margin: 0; font-size: 0.9rem; color: var(--st-text); }
  .cv-hint { margin: 0; color: var(--st-text-3); font-size: 0.7rem; }
  .cv-cols { display: flex; gap: 10px; flex-wrap: wrap; }
  fieldset { flex: 1 1 200px; border: 1px solid var(--st-hair); border-radius: var(--st-radius); display: flex; flex-direction: column; gap: 2px; max-height: 9rem; overflow: auto; }
  legend { color: var(--st-text-2); }
  .cv-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .cv-row input[type='number'] { width: 4rem; }
  .cv-plan { border-collapse: collapse; }
  .cv-plan td { padding: 2px 8px 2px 0; border-bottom: 1px solid var(--st-hair); }
  .cv-plan tr.warn td { color: var(--st-warn, #d9a441); }
  .cv-msg { margin: 0; color: var(--st-text); }
  .cv-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .cv-btn { padding: 4px 12px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; }
  .cv-btn.primary { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .cv-btn:disabled { opacity: 0.5; cursor: default; }
</style>
