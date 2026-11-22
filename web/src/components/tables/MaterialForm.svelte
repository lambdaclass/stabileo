<script lang="ts">
  import { untrack } from 'svelte';
  import { modelStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import QuantityInput from '../pro/loads/QuantityInput.svelte';
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';
  import { thermalAlphaOf } from '../../lib/engine/thermal-alpha';
  import {
    readCustomMaterial, customMaterialForm, saveCustomMaterial, type CustomMaterialForm,
  } from '../../lib/material/custom-material';

  interface Props {
    /** The material to edit; null makes a new one. */
    materialId: number | null;
    onDone: (savedId: number | null) => void;
  }
  const { materialId, onDone }: Props = $props();

  const stored = untrack(() => (materialId !== null ? modelStore.materials.get(materialId) : undefined));
  const form = $state<CustomMaterialForm>(
    stored ? customMaterialForm(stored) : { name: t('table.newMaterial'), e: 200000, nu: '0.3', rho: 78.5, fy: null, alpha: '' },
  );
  let badE = $state<string | null>(null);
  let badRho = $state<string | null>(null);
  let badFy = $state<string | null>(null);

  const read = $derived(readCustomMaterial({
    ...form,
    e: badE !== null ? null : form.e,
    rho: badRho !== null ? null : form.rho,
    fy: badFy !== null ? -1 : form.fy,
  }));
  const familyAlpha = $derived(String(+(thermalAlphaOf({ e: form.e ?? undefined, gradeId: stored?.gradeId }) * 1e6).toPrecision(3)));
  const extraSummary = $derived(
    `fy ${form.fy !== null ? `${fmtQ(form.fy, 'stress')} ${unitQ('stress')}` : '—'} · α ${form.alpha.trim() || familyAlpha}·10⁻⁶/°C`,
  );

  let nameEl: HTMLInputElement | undefined = $state();
  $effect(() => { if (matchMedia('(pointer: fine)').matches) { nameEl?.focus(); nameEl?.select(); } });

  function save() {
    if (!read.ok) return;
    const id = saveCustomMaterial(read.choice, materialId);
    if (materialId !== null) resultsStore.clear();
    onDone(id);
  }

  function keydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onDone(null); }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
  class="mat-form"
  data-testid="mat-form"
  aria-label={materialId === null ? t('prop.newMaterial') : t('prop.editMaterial')}
  onsubmit={(e) => { e.preventDefault(); save(); }}
  onkeydown={keydown}
>
  <h4>{materialId === null ? t('prop.newMaterial') : `${t('prop.editMaterial')} ${materialId}`}</h4>

  <label class="row">
    <span class="lbl">{t('matEdit.nameLabel')}</span>
    <input class="field name" type="text" bind:this={nameEl} bind:value={form.name} data-testid="mat-form-name" />
  </label>
  <label class="row">
    <span class="lbl">{t('matEdit.e')} <i>E</i></span>
    <QuantityInput nullable cls="field" wrap="q" testid="mat-form-e" quantity="stress" bind:value={form.e} bind:invalidText={badE} />
  </label>
  <label class="row">
    <span class="lbl">{t('matEdit.nu')} <i>ν</i></span>
    <span class="q"><input class="field" type="text" inputmode="decimal" bind:value={form.nu} data-testid="mat-form-nu" /><span class="unit"></span></span>
  </label>
  <label class="row">
    <span class="lbl">{t('matEdit.gamma')} <i>γ</i></span>
    <QuantityInput nullable cls="field" wrap="q" testid="mat-form-rho" quantity="density" bind:value={form.rho} bind:invalidText={badRho} />
  </label>

  <details class="extra" data-testid="mat-form-extra">
    <summary>
      <span>{t('matEdit.extra')}</span>
      <span class="sum" data-testid="mat-form-extra-summary">{extraSummary}</span>
    </summary>
    <label class="row">
      <span class="lbl">{t('matEdit.fy')} <i>f<sub>y</sub></i></span>
      <QuantityInput nullable cls="field" wrap="q" testid="mat-form-fy" quantity="stress" placeholder={t('matEdit.optional')} bind:value={form.fy} bind:invalidText={badFy} />
    </label>
    <p class="note">{t('matEdit.fyHelp')}</p>
    <label class="row">
      <span class="lbl">{t('matEdit.alpha')} <i>α</i></span>
      <span class="q"><input class="field" type="text" inputmode="decimal" placeholder={familyAlpha} bind:value={form.alpha} data-testid="mat-form-alpha" /><span class="unit">10⁻⁶/°C</span></span>
    </label>
    <p class="note">{t('materials.alphaHelp')}</p>
  </details>

  {#if !read.ok}
    <p class="problem" role="status" data-testid="mat-form-problem">{t(read.reasonKey)}</p>
  {/if}

  <div class="actions">
    <button type="button" class="btn" onclick={() => onDone(null)} data-testid="mat-form-cancel">{t('matEdit.cancel')}</button>
    <button type="submit" class="btn primary" disabled={!read.ok} data-testid="mat-form-save">{t('matEdit.save')}</button>
  </div>
</form>

<style>
  .mat-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    font-size: 0.76rem;
    color: var(--st-text-2);
  }
  h4 {
    margin: 0 0 2px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--st-text);
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }
  .lbl { text-align: right; line-height: 1.25; }
  .lbl i { font-family: var(--st-serif, serif); color: var(--st-text); }
  .row :global(.q) { display: inline-flex; align-items: center; gap: 4px; }
  .row :global(.qi-unit), .unit {
    width: 4.2rem;
    font-size: 0.68rem;
    color: var(--st-text-3);
    white-space: nowrap;
  }
  .row :global(input.field) {
    width: 6.5rem;
    padding: 4px 6px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.76rem;
    text-align: right;
  }
  .row input.name { width: calc(6.5rem + 4px + 4.2rem); text-align: left; }
  .row :global(input.field:focus-visible) { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .extra {
    border-top: 1px solid var(--st-hair, var(--st-surface-3));
    padding-top: 4px;
  }
  .extra[open] { display: flex; flex-direction: column; gap: 6px; }
  summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    min-height: 28px;
    padding: 4px 0;
    list-style: none;
    cursor: pointer;
    color: var(--st-text);
  }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: '▸'; color: var(--st-text-3); width: 0.8em; }
  .extra[open] > summary::before { content: '▾'; }
  .sum { color: var(--st-text-3); font-size: 0.7rem; }
  .note, .problem { margin: 0; font-size: 0.68rem; line-height: 1.35; color: var(--st-text-3); }
  .problem { color: var(--st-accent); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .btn {
    padding: 5px 12px;
    border-radius: 4px;
    border: 1px solid var(--st-surface-3);
    background: var(--st-surface-3);
    color: var(--st-text-2);
    font-size: 0.76rem;
    cursor: pointer;
  }
  .btn.primary { background: var(--st-value); border-color: var(--st-value); color: var(--st-bg); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (pointer: coarse), (max-width: 767px) {
    .mat-form { font-size: 0.85rem; }
    .row :global(input.field) { min-height: 44px; font-size: 16px; width: 7.5rem; }
    .row input.name { width: calc(7.5rem + 4px + 4.2rem); }
    summary { min-height: 44px; }
    .btn { min-height: 44px; min-width: 88px; font-size: 0.9rem; }
  }
</style>
