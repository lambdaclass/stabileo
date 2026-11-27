<script lang="ts">
  import { trackUsage } from '../../lib/telemetry/usage';
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
  import { offered, ownerOfMethod } from '../../lib/advanced/catalog';
  import { advancedList } from '../../lib/advanced/panel-state.svelte';

  const say = (x: Txt) => tp(x.key, x.params);
  let help = $state<string | null>(null);
  let loading = $state<string | null>(null);

  const is3D = $derived(uiStore.is3DWorkspace);

  /* Opened at one topic (from its card in the list), the catalog shows that topic's methods alone. */
  const focus = $derived(explainedSteps.catalogFocus);
  const groups = $derived(focus && methodsIn(focus as (typeof GROUP_ORDER)[number]).length ? [focus as (typeof GROUP_ORDER)[number]] : GROUP_ORDER);


  /** The analysis that runs this method on the model, when there is one (not a step-by-step topic). */
  function analysisOf(m: ExplainedMethod) {
    const owner = ownerOfMethod(m.id);
    return owner && offered(owner) && !owner.stepsGroup ? owner : null;
  }

  function openFunction(id: string) {
    advancedList.pending = id;
    explainedSteps.close();
  }

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
    trackUsage('steps.open', { method: m.id });
    if (m.wizard === 'dsm') openStiffnessWizard();
    else if (m.wizard === 'fm') openFlexibilityWizard();
    else explainedSteps.openMethod(m.id);
  }

  async function example(m: ExplainedMethod) {
    loading = m.id;
    try {
      if (is3D && !m.wizard) uiStore.analysisMode = '2d';
      await modelStore.loadExample(m.example);
      // A new model, so a new framing: the one step of the catalog that re-frames.
      // Once now, and once when a switch from 3D has mounted the plane view.
      window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
      setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 100);
      open(m);
    } finally {
      loading = null;
    }
  }
</script>

<div class="sc" data-testid="steps-catalog">
  <StepsHeader fromCatalog={false} backTitle={t('adv.backToList')} onBack={() => explainedSteps.close()}
    backTestid="steps-catalog-back" help={t('steps.catalog.intro')} />

  <div class="sc-body">
    {#each groups as g}
      {@const list = methodsIn(g)}
      {#if list.length}
        {@const scoped = groups.length === 1 && g === focus}
        {@const isOpen = scoped || advancedList.stepsOpen.includes(g)}
        <section class="sc-group" class:open={isOpen} class:scoped data-testid={`steps-group-${g}`}>
          {#if !scoped}
          <button type="button" class="sc-ghead" aria-expanded={isOpen} onclick={() => advancedList.toggleSteps(g)} data-testid={`steps-group-toggle-${g}`}>
            <span class="sc-chev" aria-hidden="true">›</span>
            <span class="sc-gtext">
              <span class="sc-gname">{t(`steps.group.${g}`)}</span>
              <span class="sc-gsum">{list.map((m) => t(`steps.m.${m.id}.title`).replace(/_/g, '')).join(' · ')}</span>
            </span>
            <span class="sc-gcount" title={tp('advCat.catalog.methods', { n: list.length })} aria-label={tp('advCat.catalog.methods', { n: list.length })}>{list.length}</span>
          </button>
          {/if}
          {#if isOpen}
          <div class="sc-gbody">
          {#each list as m}
            {@const v = verdicts.get(m.id)}
            {@const fn = analysisOf(m)}
            <article class="sc-method" data-testid={`steps-method-${m.id}`}>
              <div class="sc-row">
                <span class="sc-name"><Prose text={t(`steps.m.${m.id}.title`)} /></span>
                <button class="sc-help" class:on={help === m.id} onclick={() => (help = help === m.id ? null : m.id)}
                  aria-expanded={help === m.id} title={t('steps.catalog.help')} aria-label={t('steps.catalog.help')} data-testid={`steps-help-${m.id}`}>?</button>
              </div>
              {#if help === m.id}<p class="sc-helptext"><Prose text={t(`steps.m.${m.id}.help`)} /></p>{/if}
              <p class="sc-req"><span>{t('steps.catalog.requiresLead')}</span> <Prose text={t(`steps.m.${m.id}.requires`)} /></p>
              {#if v}
                {#if v.ok}
                  <p class="sc-state ok">✓ {t('steps.catalog.ready')}</p>
                {:else}
                  <p class="sc-state no" role={v.issue ? 'alert' : undefined} data-testid={v.issue ? `steps-withheld-${m.id}` : undefined}>{t('steps.catalog.notReady')} <Prose text={say(v.reason)} />
                    {#if v.issue}<a class="sc-issue" href="https://github.com/lambdaclass/stabileo/issues/{v.issue}" target="_blank" rel="noopener noreferrer">{t('plastic.withheldIssue').replace('{issue}', String(v.issue))}</a>{/if}</p>
                {/if}
              {/if}
              <div class="sc-actions">
                <button class="sc-open" disabled={!v?.ok} onclick={() => open(m)} data-testid={`steps-open-${m.id}`}>{t('steps.catalog.open')}</button>
                <button class="sc-example" disabled={loading !== null} onclick={() => example(m)} data-testid={`steps-example-${m.id}`}>
                  {loading === m.id ? t('steps.catalog.loading') : t('steps.catalog.example')}
                </button>
                {#if fn && !(fn.requires.plane && is3D)}
                  <button class="sc-fn" onclick={() => openFunction(fn.id)} title={t('advCat.catalog.partOfTitle')} data-testid={`steps-function-${m.id}`}>{tp('advCat.catalog.partOf', { name: t(fn.titleKey) })} ›</button>
                {/if}
              </div>
            </article>
          {/each}
          </div>
          {/if}
        </section>
      {/if}
    {/each}
  </div>
</div>

<style>
  .sc { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--st-text); }
  .sc-body { flex: 1 1 auto; overflow-y: auto; padding: 0.6rem 0.75rem 0.8rem; min-height: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .sc-group { border: 1px solid var(--st-hair); border-radius: var(--st-radius-lg, 8px); }
  .sc-group.open { border-color: var(--st-hair-strong); }
  .sc-group.scoped { border: none; }
  .sc-group.scoped .sc-gbody { padding: 0; }
  .sc-ghead {
    display: flex; align-items: center; gap: 0.5rem; width: 100%; min-height: 46px; padding: 0.4rem 0.6rem;
    background: none; border: none; color: var(--st-text); font: inherit; text-align: left; cursor: pointer; border-radius: inherit;
  }
  .sc-ghead:hover { background: var(--st-surface-3); }
  .sc-ghead:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: -2px; }
  .sc-chev { flex: none; width: 12px; color: var(--st-text-3); font-size: 1rem; transition: transform 0.15s; }
  .open .sc-chev { transform: rotate(90deg); }
  .sc-gtext { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .sc-gname { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--st-accent); }
  .sc-gsum { font-size: 0.7rem; color: var(--st-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sc-gcount { flex: none; min-width: 1.4rem; padding: 1px 6px; box-sizing: border-box; text-align: center; border: 1px solid var(--st-hair-strong); border-radius: 999px; font-size: 0.66rem; color: var(--st-text-3); }
  .sc-gbody { padding: 0 0.45rem 0.1rem; }
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
  .sc-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.35rem; }
  .sc-fn { background: none; color: var(--st-interactive); border-color: var(--st-hair) !important; }
  .sc-fn:hover { color: var(--st-text); }
  .sc-actions button { font-size: 0.74rem; padding: 0.25rem 0.7rem; border-radius: 4px; cursor: pointer; border: 1px solid var(--st-hair-strong); }
  .sc-open { background: var(--st-accent); border-color: var(--st-accent) !important; color: #fff; }
  .sc-open:disabled { opacity: 0.4; cursor: default; }
  .sc-example { background: var(--st-surface-2); color: var(--st-text-2); }
  .sc-example:hover:not(:disabled) { color: var(--st-text); }
  @media (pointer: coarse), (max-width: 767px) { .sc-actions button { min-height: 44px; } .sc-help { width: 44px; height: 44px; } .sc-ghead { min-height: 48px; } }
</style>
