<script lang="ts">
  /**
   * The Stabileo criteria in the design data: the numbers the sheets take where the code leaves
   * room, by family, each with its unit and what it does; closed, the section says how many differ
   * from their defaults.
   */
  import Hint from '../Hint.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { designData } from '../../../lib/store/design-data';
  import { resetCriteria, setCriterion } from '../../../lib/store/rc-sheets.svelte';
  import { CRITERION_FAMILIES, criteriaOfFamily, criterionSpec, type CriteriaValues, type CriterionId } from '../../../lib/rc-sheets/criteria';

  const stated = $derived.by((): CriteriaValues => { void modelStore.designData; return designData().designOptions?.criteria ?? {}; });
  const changed = $derived(Object.keys(stated).length);
  const valueOf = (id: CriterionId) => stated[id] ?? criterionSpec(id).value;
  const shown = (id: CriterionId) => Number(valueOf(id).toFixed(criterionSpec(id).digits ?? 0));

  function commit(id: CriterionId, input: HTMLInputElement) {
    const s = criterionSpec(id);
    const raw = input.value.trim();
    if (raw === '') { setCriterion(id, null); return; }
    const v = Number(raw.replace(',', '.'));
    if (Number.isFinite(v) && v >= s.min && v <= s.max && (!s.integer || Number.isInteger(v))) setCriterion(id, v);
    else input.value = String(shown(id));
  }
</script>

<details class="pk-card cr" data-testid="design-options-criteria">
  <summary><span class="cr-h">{t('designData.criteria')}</span> <span class="cr-sum" data-testid="design-options-criteria-summary">{changed ? tp('designData.criteria.changed', { n: changed }) : t('designData.criteria.defaults')}</span></summary>
  <Hint text={t('designData.criteria.hint')} />
  {#each CRITERION_FAMILIES as f (f)}
    <fieldset class="cr-fam" data-testid="criteria-{f}">
      <legend>{t(`rcSheets.family.${f}`)}</legend>
      {#each criteriaOfFamily(f) as id (id)}
        {@const s = criterionSpec(id)}
        <div class="cr-opt" class:changed={stated[id] !== undefined}>
          <label class="cr-row">
            <span class="cr-name">{t(`designData.crit.${id}`)}</span>
            <span class="cr-val">
              {#if s.prefix}<span class="cr-unit">{s.prefix}</span>{/if}
              <input type="number" min={s.min} max={s.max} step={s.step} value={shown(id)} onchange={(e) => commit(id, e.currentTarget)} data-testid="criterion-{id}" />
              {#if s.unit}<span class="cr-unit">{s.unit}</span>{/if}
            </span>
          </label>
          <Hint text={t(`designData.crit.${id}.hint`)} />
        </div>
      {/each}
    </fieldset>
  {/each}
  <button type="button" class="cr-reset" disabled={!changed} onclick={() => resetCriteria()} data-testid="criteria-reset">{t('designData.criteria.reset')}</button>
</details>

<style>
  .cr > summary { cursor: pointer; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .cr-h { font-size: 0.78rem; font-weight: 500; }
  .cr-sum { font-size: 0.68rem; color: var(--st-text-2); }
  .cr-fam { border: 1px solid var(--st-hair); border-radius: 4px; padding: 2px 6px 4px; margin: 6px 0 0; }
  .cr-fam legend { font-size: 0.68rem; color: var(--st-text-2); padding: 0 2px; }
  .cr-opt { display: flex; flex-direction: column; gap: 1px; margin: 4px 0 2px; }
  .cr-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 0.72rem; color: var(--st-text-2); }
  .cr-opt.changed .cr-name { color: var(--st-text); font-weight: 500; }
  .cr-val { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
  .cr-val input { width: 4.5rem; font-size: 0.72rem; }
  .cr-unit { font-size: 0.66rem; font-family: var(--st-mono); color: var(--st-text-2); }
  .cr-reset { margin-top: 6px; font-size: 0.7rem; }
</style>
