<script lang="ts">
  import Prose from './Prose.svelte';
  import StepsHeader from './StepsHeader.svelte';
  /**
   * The "Explained step by step" catalog: the methods by group, each with
   * what it does (behind its ?), what the structure must be to try it,
   * whether the model on screen is, and an example that is.
   *
   * Whether the model qualifies is worked out from the model itself (the same
   * test the method runs before building its document), so the list says
   * why a method is not available instead of greying it out silently.
   */
  import { t, tp } from '../../lib/i18n';
  import { modelStore, uiStore } from '../../lib/store';
  import { explainedSteps, methodContext } from '../../lib/store/explained-steps.svelte';
  import { GROUP_ORDER, methodsIn, type ExplainedMethod } from '../../lib/engine/steps/methods';
  import type { Applicability, Txt } from '../../lib/engine/steps/doc';
  import { tx } from '../../lib/engine/steps/doc';
  import { openStiffnessWizard, openFlexibilityWizard } from '../../lib/actions/step-wizards';

  const say = (x: Txt) => tp(x.key, x.params);
  let help = $state<string | null>(null);
  let loading = $state<string | null>(null);

  const is3D = $derived(uiStore.analysisMode === '3d');

  // Re-read when the model, the mode or the selection changes.
  const verdicts = $derived.by(() => {
    void modelStore.modelVersion; void uiStore.analysisMode;
    void uiStore.selectedElements; void uiStore.selectedNodes;
    const out = new Map<string, Applicability>();
    const empty = modelStore.elements.size === 0;
    const ctx = empty || is3D ? null : methodContext();
    for (const g of GROUP_ORDER) {
      for (const m of methodsIn(g)) {
        if (empty) { out.set(m.id, { ok: false, reason: tx('steps.catalog.emptyModel') }); continue; }
        if (is3D) {
          // The two wizards work in 3D and check the model when opened; the rest are plane methods.
          out.set(m.id, m.wizard ? { ok: true } : { ok: false, reason: tx('steps.req.is2D') });
          continue;
        }
        try { out.set(m.id, ctx ? m.applies(ctx) : { ok: false, reason: tx('steps.catalog.emptyModel') }); }
        catch { out.set(m.id, { ok: false, reason: tx('steps.view.failed') }); }
      }
    }
    return out;
  });

  function open(m: ExplainedMethod) {
    if (m.wizard === 'dsm') openStiffnessWizard();
    else if (m.wizard === 'fm') openFlexibilityWizard();
    else explainedSteps.openMethod(m.id);
  }

  async function example(m: ExplainedMethod) {
    loading = m.id;
    try {
      if (is3D && !m.wizard) uiStore.analysisMode = '2d';
      await modelStore.loadExample(m.example);
      window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
      open(m);
    } finally {
      loading = null;
    }
  }
</script>

<div class="sc" data-testid="steps-catalog">
  <StepsHeader backLabel={t('adv.back')} backTitle={t('adv.backToList')} onBack={() => explainedSteps.close()}
    name={t('steps.catalog.title')} backTestid="steps-catalog-back" />
  <p class="sc-intro">{t('steps.catalog.intro')}</p>

  <div class="sc-body">
    {#each GROUP_ORDER as g}
      {@const list = methodsIn(g)}
      {#if list.length}
        <section class="sc-group" data-testid={`steps-group-${g}`}>
          <h4>{t(`steps.group.${g}`)}</h4>
          {#each list as m}
            {@const v = verdicts.get(m.id)}
            <article class="sc-method" data-testid={`steps-method-${m.id}`}>
              <div class="sc-row">
                <span class="sc-name">{t(`steps.m.${m.id}.title`)}</span>
                <button class="sc-help" class:on={help === m.id} onclick={() => (help = help === m.id ? null : m.id)}
                  aria-expanded={help === m.id} title={t('steps.catalog.help')} data-testid={`steps-help-${m.id}`}>?</button>
              </div>
              {#if help === m.id}<p class="sc-helptext"><Prose text={t(`steps.m.${m.id}.help`)} /></p>{/if}
              <p class="sc-req"><span>{t('steps.catalog.requiresLead')}</span> <Prose text={t(`steps.m.${m.id}.requires`)} /></p>
              {#if v}
                {#if v.ok}
                  <p class="sc-state ok">✓ {t('steps.catalog.ready')}</p>
                {:else}
                  <p class="sc-state no">{t('steps.catalog.notReady')} <Prose text={say(v.reason)} /></p>
                {/if}
              {/if}
              <div class="sc-actions">
                <button class="sc-open" disabled={!v?.ok} onclick={() => open(m)} data-testid={`steps-open-${m.id}`}>{t('steps.catalog.open')}</button>
                <button class="sc-example" disabled={loading !== null} onclick={() => example(m)} data-testid={`steps-example-${m.id}`}>
                  {loading === m.id ? t('steps.catalog.loading') : t('steps.catalog.example')}
                </button>
              </div>
            </article>
          {/each}
        </section>
      {/if}
    {/each}
  </div>
</div>

<style>
  .sc { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--st-text); }
  .sc-intro { margin: 0.55rem 0.75rem 0.4rem; font-size: 0.78rem; color: var(--st-text-2); line-height: 1.4; }
  .sc-body { flex: 1 1 auto; overflow-y: auto; padding: 0 0.75rem 0.8rem; min-height: 0; }
  .sc-group { margin-top: 0.7rem; }
  .sc-group h4 {
    margin: 0 0 0.35rem; font-size: 0.72rem; letter-spacing: 0.07em; text-transform: uppercase;
    color: var(--st-accent); border-bottom: 1px solid var(--st-hair); padding-bottom: 0.2rem;
  }
  .sc-method { padding: 0.45rem 0.55rem; margin-bottom: 0.4rem; border: 1px solid var(--st-hair); border-radius: var(--st-radius); background: color-mix(in srgb, var(--st-surface-2) 45%, transparent); }
  .sc-row { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; }
  .sc-name { font-size: 0.84rem; font-weight: 600; }
  .sc-help {
    width: 22px; height: 22px; flex: none; border-radius: 50%; cursor: pointer; font-size: 0.72rem; font-weight: 700;
    border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text-2);
  }
  .sc-help.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .sc-helptext { margin: 0.35rem 0 0.2rem; font-size: 0.76rem; line-height: 1.45; color: var(--st-text); }
  .sc-req { margin: 0.3rem 0 0.2rem; font-size: 0.74rem; line-height: 1.4; color: var(--st-text-2); }
  .sc-req span { color: var(--st-text); }
  .sc-state { margin: 0.2rem 0; font-size: 0.72rem; }
  .sc-state.ok { color: #2fb36b; }
  .sc-state.no { color: var(--st-text-3); }
  .sc-actions { display: flex; gap: 0.4rem; margin-top: 0.35rem; }
  .sc-actions button { font-size: 0.74rem; padding: 0.25rem 0.7rem; border-radius: 4px; cursor: pointer; border: 1px solid var(--st-hair-strong); }
  .sc-open { background: var(--st-accent); border-color: var(--st-accent) !important; color: #fff; }
  .sc-open:disabled { opacity: 0.4; cursor: default; }
  .sc-example { background: var(--st-surface-2); color: var(--st-text-2); }
  .sc-example:hover:not(:disabled) { color: var(--st-text); }
  @media (pointer: coarse) { .sc-actions button { min-height: 36px; } .sc-help { width: 30px; height: 30px; } }
</style>
