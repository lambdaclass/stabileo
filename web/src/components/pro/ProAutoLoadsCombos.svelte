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
  <section class="al-sec" class:off={!generate}>
    <div class="al-sec-head">
      <label class="al-check al-sec-title"><input type="checkbox" bind:checked={generate} data-testid="al-gen-combos" /> {t('autoLoad.genCombos')}</label>
    </div>
    {#if generate}
      <div class="al-sec-body">
        <div class="ac-source" role="radiogroup" aria-label={t('autoLoad.comboSource')}>
          <span class="al-label">{t('autoLoad.comboSource')}</span>
          <label class="al-check">
            <input type="radio" name="al-combo-source" value="regulation" bind:group={source} data-testid="al-combo-source-regulation" />
            {t('autoLoad.comboSource.regulation')}
          </label>
          {#if source === 'regulation'}
            <div class="al-row ac-sub" role="radiogroup" aria-label={t('autoLoad.comboSet')} data-testid="al-combo-set">
              {#each ['ultimate', 'service', 'both'] as const as k (k)}
                <label class="al-check"><input type="radio" name="al-combo-set" value={k} bind:group={set} data-testid="al-combo-set-{k}" /> {t(`autoLoad.comboSet.${k}`)}</label>
              {/each}
            </div>
            {#if set !== 'ultimate'}<p class="al-hint ac-sub">{t('autoLoad.comboSetServiceHint')}</p>{/if}
          {/if}
          <label class="al-check">
            <input type="radio" name="al-combo-source" value="project" bind:group={source} disabled={rules.length === 0} data-testid="al-combo-source-project" />
            {tp('autoLoad.comboSource.project', { n: rules.length })}
          </label>
          {#if rules.length === 0}<p class="al-hint ac-sub">{t('autoLoad.comboSourceProjectEmpty')}</p>{/if}
        </div>
        <label class="al-check"><input type="checkbox" bind:checked={bothSenses} data-testid="al-both-senses" /> {t('autoLoad.seismicBothSenses')}</label>
        <p class="al-hint">{t('autoLoad.seismicBothSensesHint')}</p>
      </div>
    {/if}
  </section>

  <section class="al-sec">
    <div class="al-sec-head"><span class="al-sec-title">{tp('combos.rules.title', { n: rules.length })}</span></div>
    <div class="al-sec-body"><ProCombinationRules /></div>
  </section>
</div>

<style>
  /* The dialog's sections, fields and text (`ProAutoLoadsDialog`); only the indents are here. */
  .ac { display: flex; flex-direction: column; gap: 10px; }
  .ac-source { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
  .ac-sub { padding-left: 1.4rem; }
</style>
