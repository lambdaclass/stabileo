<script lang="ts">
  /**
   * What a running advanced function opens with, the same for every one: the panel's header names
   * it, goes back to the list and says what it does (`panel-trail`); here, the step-by-step methods
   * that explain it.
   */
  import { t, tp } from '../../lib/i18n';
  import type { AdvFunction } from '../../lib/advanced/catalog';
  import { openStepMethod, stepBlockedReason } from '../../lib/advanced/open-step';
  import { panelTrail } from '../../lib/advanced/panel-trail.svelte';
  import Prose from '../steps/Prose.svelte';

  let { fn, onBack }: { fn: AdvFunction; onBack: () => void } = $props();
  const steps = $derived(fn.stepsInPanel ? [] : fn.steps);

  $effect(() => panelTrail.publish({
    crumbs: [{ label: t(fn.titleKey) }],
    back: { run: onBack, title: t('adv.backToList'), testid: 'adv-close' },
    home: onBack,
    help: fn.helpKey ? t(fn.helpKey) : undefined,
    running: fn.id,
  }));
</script>

{#if steps.length}
  <details class="afh-steps" data-testid="adv-related-steps">
    <summary><span>{t('advCat.related')}</span><span class="afh-n" aria-label={tp('advCat.stepsBadge', { n: steps.length })}>{steps.length}</span></summary>
    <div class="afh-list">
      {#each steps as m (m)}
        <button class="afh-step" disabled={!!stepBlockedReason(m)} title={stepBlockedReason(m) ? t(stepBlockedReason(m)!) : undefined} onclick={() => openStepMethod(m)} data-testid="adv-related-{m}"><Prose text={t(`steps.m.${m}.title`)} /> <span aria-hidden="true">›</span></button>
      {/each}
    </div>
  </details>
{/if}

<style>
  .afh-steps { font-size: 0.72rem; color: var(--st-text-2); padding-bottom: 0.4rem; margin-bottom: 0.3rem; border-bottom: 1px solid var(--st-hair); }
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
    .afh-steps summary { min-height: 44px; }
    .afh-step { min-height: 44px; }
  }
</style>
