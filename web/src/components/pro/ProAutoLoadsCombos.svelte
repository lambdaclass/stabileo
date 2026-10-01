<script lang="ts">
  /**
   * The regulation dialog's Combinations tab: whether applying makes combinations, and from
   * what. Either CIRSOC 101-2025 (strength, service or both) or the project's own rules, which
   * are edited here too (`ProCombinationRules`). Both are expanded over the cases the plan
   * makes, one wind or seismic case at a time (`combination-cases.ts`).
   */
  import { t, tp } from '../../lib/i18n';
  import { modelStore } from '../../lib/store';
  import ProCombinationRules from './ProCombinationRules.svelte';

  export type ComboSource = 'regulation' | 'project';
  interface Props {
    generate: boolean;
    source: ComboSource;
    set: 'ultimate' | 'service' | 'both';
    bothSenses: boolean;
  }
  let { generate = $bindable(), source = $bindable(), set = $bindable(), bothSenses = $bindable() }: Props = $props();
  const rules = $derived(modelStore.combinationRules);
  // A source with nothing in it is not a choice: the last rule removed falls back to the regulation.
  $effect(() => { if (source === 'project' && rules.length === 0) source = 'regulation'; });
</script>

<div class="ac" data-testid="al-combos">
  <label class="al-check"><input type="checkbox" bind:checked={generate} data-testid="al-gen-combos" /> {t('autoLoad.genCombos')}</label>
  {#if generate}
    <div class="ac-source" role="radiogroup" aria-label={t('autoLoad.comboSource')}>
      <label class="ac-opt">
        <input type="radio" name="al-combo-source" value="regulation" bind:group={source} data-testid="al-combo-source-regulation" />
        <span>{t('autoLoad.comboSource.regulation')}</span>
      </label>
      {#if source === 'regulation'}
        <div class="ac-sub" role="radiogroup" aria-label={t('autoLoad.comboSet')} data-testid="al-combo-set">
          {#each ['ultimate', 'service', 'both'] as const as k (k)}
            <label><input type="radio" name="al-combo-set" value={k} bind:group={set} data-testid="al-combo-set-{k}" /> {t(`autoLoad.comboSet.${k}`)}</label>
          {/each}
        </div>
        {#if set !== 'ultimate'}<p class="ac-hint">{t('autoLoad.comboSetServiceHint')}</p>{/if}
      {/if}
      <label class="ac-opt">
        <input type="radio" name="al-combo-source" value="project" bind:group={source} disabled={rules.length === 0} data-testid="al-combo-source-project" />
        <span>{tp('autoLoad.comboSource.project', { n: rules.length })}</span>
      </label>
      {#if rules.length === 0}<p class="ac-hint">{t('autoLoad.comboSourceProjectEmpty')}</p>{/if}
    </div>
    <label class="al-check"><input type="checkbox" bind:checked={bothSenses} data-testid="al-both-senses" /> {t('autoLoad.seismicBothSenses')}</label>
    <p class="ac-hint">{t('autoLoad.seismicBothSensesHint')}</p>
  {/if}

  <section class="ac-rules">
    <h4 class="ac-heading">{tp('combos.rules.title', { n: rules.length })}</h4>
    <ProCombinationRules />
  </section>
</div>

<style>
  .ac { display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: var(--st-text-2); }
  .al-check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .ac-source { display: flex; flex-direction: column; gap: 4px; padding-left: 1.3rem; }
  .ac-opt { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .ac-sub { display: flex; gap: 10px; flex-wrap: wrap; padding-left: 1.3rem; }
  .ac-sub label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .ac-hint { margin: 0 0 0 1.3rem; font-size: 0.62rem; color: var(--st-text-3); }
  .ac-rules { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--st-surface-3); display: flex; flex-direction: column; gap: 4px; }
  .ac-heading { margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--st-text-2); }
</style>
