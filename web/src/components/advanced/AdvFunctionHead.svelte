<script lang="ts">
  /**
   * What a running advanced function opens with, the same for every one: "← Back" to the list,
   * its name, a ? that says what it does, and the step-by-step methods that explain it.
   */
  import { t, tp } from '../../lib/i18n';
  import type { AdvFunction } from '../../lib/advanced/catalog';
  import { openStepMethod } from '../../lib/advanced/open-step';
  import Prose from '../steps/Prose.svelte';

  let { fn, onBack }: { fn: AdvFunction; onBack: () => void } = $props();
  let help = $state(false);
  const steps = $derived(fn.stepsInPanel ? [] : fn.steps);
</script>

<div class="afh" data-testid="adv-running" data-adv={fn.id}>
  <div class="afh-row">
    <button class="afh-back" onclick={onBack} title={t('adv.backToList')} aria-label={t('adv.backToList')} data-testid="adv-close">← {t('adv.back')}</button>
    <span class="afh-name">{t(fn.titleKey)}</span>
    {#if fn.helpKey}
      <button class="afh-help" class:on={help} onclick={() => (help = !help)} aria-expanded={help}
        title={t('steps.catalog.help')} aria-label={t('steps.catalog.help')} data-testid="adv-help">?</button>
    {/if}
  </div>
  {#if help && fn.helpKey}<p class="afh-text" data-testid="adv-help-text">{t(fn.helpKey)}</p>{/if}
  {#if steps.length}
    <details class="afh-steps" data-testid="adv-related-steps">
      <summary><span>{t('advCat.related')}</span><span class="afh-n" aria-label={tp('advCat.stepsBadge', { n: steps.length })}>{steps.length}</span></summary>
      <div class="afh-list">
        {#each steps as m (m)}
          <button class="afh-step" onclick={() => openStepMethod(m)} data-testid="adv-related-{m}"><Prose text={t(`steps.m.${m}.title`)} /> <span aria-hidden="true">›</span></button>
        {/each}
      </div>
    </details>
  {/if}
</div>

<style>
  .afh { display: flex; flex-direction: column; gap: 0.35rem; padding: 0 0 0.45rem; margin-bottom: 0.3rem; border-bottom: 1px solid var(--st-hair); }
  .afh-row { display: flex; align-items: center; gap: 0.5rem; min-height: 30px; }
  .afh-back {
    flex: none; background: none; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); font-family: inherit;
    font-size: 0.66rem; line-height: 1; padding: 0.28rem 0.5rem; cursor: pointer; border-radius: var(--st-radius);
  }
  .afh-back:hover { border-color: var(--st-accent); color: var(--st-accent); }
  .afh-name {
    flex: 1; min-width: 0; font-family: var(--st-mono); font-size: 0.68rem; letter-spacing: 0.11em; text-transform: uppercase;
    color: var(--st-accent); overflow-wrap: anywhere;
  }
  .afh-help {
    flex: none; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 0.72rem; font-weight: 700;
    border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text-2);
  }
  .afh-help.on { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-text-on-accent, #fff); }
  .afh-text { margin: 0; font-size: 0.74rem; line-height: 1.45; color: var(--st-text-2); }
  .afh-steps { font-size: 0.72rem; color: var(--st-text-2); }
  .afh-steps summary { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; min-height: 28px; color: var(--st-text); }
  .afh-n { padding: 0 6px; border: 1px solid var(--st-hair-strong); border-radius: 999px; color: var(--st-text-3); font-size: 0.64rem; font-variant-numeric: tabular-nums; }
  .afh-list { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.2rem 0 0.1rem; }
  .afh-step {
    display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; width: 100%; padding: 0.35rem 0.55rem; min-height: 32px;
    background: var(--st-surface-2); border: 1px solid var(--st-hair); border-radius: var(--st-radius); color: var(--st-text);
    font: inherit; font-size: 0.74rem; text-align: left; cursor: pointer;
  }
  .afh-step:hover { border-color: var(--st-accent); }
  @media (max-width: 767px), (pointer: coarse) {
    .afh-back { min-height: 44px; padding: 0 0.8rem; font-size: 0.76rem; }
    .afh-help { width: 44px; height: 44px; }
    .afh-steps summary { min-height: 44px; }
    .afh-step { min-height: 44px; }
  }
</style>
