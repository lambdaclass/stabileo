<script lang="ts">
  /**
   * One method's explained solution: the set-up, then its numbered steps, one
   * at a time with a row to jump between them. "Explanations" shows or hides
   * the paragraphs that say why (a full reading or just the working).
   */
  import StepBlocks from './StepBlocks.svelte';
  import { t, tp } from '../../lib/i18n';
  import { explainedSteps } from '../../lib/store/explained-steps.svelte';
  import type { Txt } from '../../lib/engine/steps/doc';

  const doc = $derived(explainedSteps.doc);
  const step = $derived(explainedSteps.step);
  let detail = $state(true);
  let body: HTMLElement | undefined = $state();

  const say = (x: Txt) => tp(x.key, x.params);
  function go(k: number) {
    explainedSteps.step = k;
    body?.scrollTo({ top: 0 });
  }
</script>

<div class="sd" data-testid="steps-doc">
  <header class="sd-head">
    <button class="sd-back" onclick={() => explainedSteps.back()} data-testid="steps-back">‹ {t('steps.view.back')}</button>
    <button class="sd-close" onclick={() => explainedSteps.close()} aria-label={t('steps.view.close')} title={t('steps.view.close')} data-testid="steps-close">×</button>
  </header>

  {#if explainedSteps.error}
    <p class="sd-error" data-testid="steps-error">{say(explainedSteps.error)}</p>
  {:else if doc}
    <div class="sd-title">
      <h3>{say(doc.title)}</h3>
      {#if doc.subtitle}<span class="sd-sub">{say(doc.subtitle)}</span>{/if}
    </div>

    {#if explainedSteps.stale}
      <div class="sd-stale">
        <span>{t('steps.view.stale')}</span>
        <button onclick={() => explainedSteps.refresh()} data-testid="steps-refresh">{t('steps.view.refresh')}</button>
      </div>
    {/if}

    <nav class="sd-nav" aria-label={t('steps.catalog.title')}>
      <button class:on={step === 0} onclick={() => go(0)}>{t('steps.view.intro')}</button>
      {#each doc.steps as _, k}
        <button class:on={step === k + 1} onclick={() => go(k + 1)} data-testid="steps-tab">{k + 1}</button>
      {/each}
      <label class="sd-detail"><input type="checkbox" bind:checked={detail} /> {t('steps.view.detail')}</label>
    </nav>

    <div class="sd-body" bind:this={body}>
      {#if step === 0}
        <StepBlocks blocks={doc.intro} {detail} />
      {:else}
        {@const s = doc.steps[step - 1]}
        <h4 class="sd-step"><span class="sd-num">{tp('steps.view.step', { n: step })}</span> {say(s.title)}</h4>
        <StepBlocks blocks={s.blocks} {detail} />
      {/if}
    </div>

    <footer class="sd-foot">
      <button disabled={step === 0} onclick={() => go(step - 1)} data-testid="steps-prev">‹ {t('steps.view.prev')}</button>
      <span class="sd-pos">{step} / {doc.steps.length}</span>
      <button disabled={step >= doc.steps.length} onclick={() => go(step + 1)} data-testid="steps-next">{t('steps.view.next')} ›</button>
    </footer>
  {/if}
</div>

<style>
  .sd { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--st-text); }
  .sd-head { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--st-hair); }
  .sd-back, .sd-close, .sd-foot button, .sd-stale button {
    background: transparent; border: 1px solid var(--st-hair-strong); border-radius: 4px;
    color: var(--st-text-2); font-size: 0.74rem; padding: 0.2rem 0.55rem; cursor: pointer;
  }
  .sd-back:hover, .sd-close:hover, .sd-foot button:hover:not(:disabled) { color: var(--st-text); background: var(--st-surface-2); }
  .sd-close { border: none; font-size: 1.1rem; line-height: 1; }
  .sd-title { padding: 0.5rem 0.75rem 0.2rem; }
  .sd-title h3 { margin: 0; font-size: 1rem; color: var(--st-text); }
  .sd-sub { font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--st-text-3); }
  .sd-stale { display: flex; align-items: center; gap: 0.5rem; margin: 0.3rem 0.75rem; padding: 0.3rem 0.5rem; font-size: 0.74rem; border: 1px solid color-mix(in srgb, #f59e0b 60%, transparent); border-radius: var(--st-radius); }
  .sd-nav { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; padding: 0.3rem 0.75rem; border-bottom: 1px solid var(--st-hair); }
  .sd-nav button {
    min-width: 1.9rem; padding: 0.15rem 0.45rem; font-size: 0.72rem; cursor: pointer;
    border: 1px solid var(--st-hair-strong); border-radius: 4px; background: var(--st-surface-2); color: var(--st-text-2);
  }
  .sd-nav button.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .sd-detail { margin-left: auto; font-size: 0.72rem; color: var(--st-text-2); display: flex; align-items: center; gap: 0.25rem; cursor: pointer; }
  .sd-body { flex: 1 1 auto; overflow-y: auto; padding: 0.3rem 0.75rem 0.8rem; min-height: 0; }
  .sd-step { margin: 0.5rem 0 0.3rem; font-size: 0.92rem; }
  .sd-num { display: inline-block; padding: 0.05rem 0.45rem; margin-right: 0.3rem; border-radius: 3px; background: color-mix(in srgb, var(--st-accent) 85%, #000); color: #fff; font-size: 0.72rem; font-weight: 600; }
  .sd-foot { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.75rem; border-top: 1px solid var(--st-hair); }
  .sd-foot button:disabled { opacity: 0.4; cursor: default; }
  .sd-pos { font-size: 0.72rem; color: var(--st-text-3); font-variant-numeric: tabular-nums; }
  .sd-error { margin: 1rem 0.75rem; font-size: 0.82rem; color: var(--st-text-2); }
</style>
