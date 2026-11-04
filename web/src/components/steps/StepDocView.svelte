<script lang="ts">
  /**
   * One method's explained solution: the set-up, then its numbered steps, one
   * at a time. "Explanations" shows or hides the paragraphs that say why (a
   * full reading or just the working). The frame, tabs and footer are the
   * ones the stiffness and flexibility wizards use (StepFrame).
   */
  import Prose from './Prose.svelte';
  import StepBlocks from './StepBlocks.svelte';
  import StepsHeader from './StepsHeader.svelte';
  import StepFrame from './StepFrame.svelte';
  import { t, tp } from '../../lib/i18n';
  import { explainedSteps } from '../../lib/store/explained-steps.svelte';
  import type { Txt } from '../../lib/engine/steps/doc';
  import { methodById } from '../../lib/engine/steps/methods';

  const method = $derived(explainedSteps.methodId ? methodById(explainedSteps.methodId) : undefined);
  let optHelp = $state<string | null>(null);

  const doc = $derived(explainedSteps.doc);
  const step = $derived(explainedSteps.step);
  let detail = $state(true);
  let narrow = $state(false);

  const say = (x: Txt) => tp(x.key, x.params);
</script>

<div class="sd" data-testid="steps-doc">
  <StepsHeader backLabel={t('steps.view.back')} backTitle={t('steps.view.backToCatalog')} onBack={() => explainedSteps.back()}
    name={t('steps.catalog.title')} backTestid="steps-back" />

  {#if explainedSteps.error}
    <p class="sd-error" data-testid="steps-error"><Prose text={say(explainedSteps.error)} /></p>
  {:else if doc}
    <StepFrame title={say(doc.title)} subtitle={doc.subtitle ? say(doc.subtitle) : undefined} {step} first={0} last={doc.steps.length}
      onGo={(k) => (explainedSteps.step = k)} stepTitle={step > 0 ? say(doc.steps[step - 1].title) : undefined} bind:narrow>
      {#snippet top()}
        {#if method?.options?.length}
          <!-- The method's assumptions, each switchable, each with what it changes. -->
          <div class="sd-opts" data-testid="steps-options">
            {#each method.options as o}
              <div class="sd-opt">
                <label>
                  <input type="checkbox" checked={explainedSteps.options[o.id]}
                    onchange={(e) => explainedSteps.setOption(o.id, e.currentTarget.checked)} data-testid={`steps-opt-${o.id}`} />
                  {t(`steps.m.${method.id}.opt.${o.id}.label`)}
                </label>
                <button class="sd-opt-help" class:on={optHelp === o.id} onclick={() => (optHelp = optHelp === o.id ? null : o.id)}
                  aria-expanded={optHelp === o.id} title={t('steps.catalog.help')} data-testid={`steps-opt-help-${o.id}`}>?</button>
              </div>
              {#if optHelp === o.id}<p class="sd-opt-text"><Prose text={t(`steps.m.${method.id}.opt.${o.id}.help`)} /></p>{/if}
            {/each}
          </div>
        {/if}
        {#if explainedSteps.stale}
          <div class="sd-stale">
            <span>{t('steps.view.stale')}</span>
            <button onclick={() => explainedSteps.refresh()} data-testid="steps-refresh">{t('steps.view.refresh')}</button>
          </div>
        {/if}
      {/snippet}
      {#snippet tabsEnd()}
        <label class="sd-detail"><input type="checkbox" bind:checked={detail} /> {t('steps.view.detail')}</label>
      {/snippet}
      {#if step === 0}
        <StepBlocks blocks={doc.intro} {detail} {narrow} />
      {:else}
        <StepBlocks blocks={doc.steps[step - 1].blocks} {detail} {narrow} />
      {/if}
    </StepFrame>
  {/if}
</div>

<style>
  .sd { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--st-text); }
  .sd-opts { margin: 0.2rem 0.75rem 0.3rem; padding: 0.3rem 0.5rem; border: 1px solid var(--st-hair); border-radius: var(--st-radius); flex: none; }
  .sd-opt { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; }
  .sd-opt label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.76rem; color: var(--st-text); cursor: pointer; }
  .sd-opt-help {
    width: 20px; height: 20px; flex: none; border-radius: 50%; cursor: pointer; font-size: 0.68rem; font-weight: 700;
    border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text-2);
  }
  .sd-opt-help.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .sd-opt-text { margin: 0.25rem 0 0.1rem; font-size: 0.74rem; line-height: 1.45; color: var(--st-text-2); }
  @media (pointer: coarse) { .sd-opt-help { width: 28px; height: 28px; } .sd-opt label { min-height: 32px; } }
  .sd-stale { display: flex; align-items: center; gap: 0.5rem; margin: 0.3rem 0.75rem; padding: 0.3rem 0.5rem; font-size: 0.74rem; border: 1px solid color-mix(in srgb, #f59e0b 60%, transparent); border-radius: var(--st-radius); flex: none; }
  .sd-stale button { background: transparent; border: 1px solid var(--st-hair-strong); border-radius: 4px; color: var(--st-text-2); font-size: 0.72rem; padding: 0.15rem 0.5rem; cursor: pointer; }
  .sd-detail { font-size: 0.72rem; color: var(--st-text-2); display: flex; align-items: center; gap: 0.25rem; cursor: pointer; }
  .sd-error { margin: 1rem 0.75rem; font-size: 0.82rem; color: var(--st-text-2); }
</style>
