<script lang="ts">
  /**
   * Section-change approval.
   *
   * A section change alters stiffness, self-weight and force distribution, so it is
   * NEVER applied silently: this dialog is the explicit approval step, and applying
   * bumps the model version (which clears results) so the user MUST re-solve before
   * anything can be certified again. Iteration is bounded by `checkIterationGuard`.
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import {
    checkIterationGuard, MAX_SECTION_ITERATIONS, type IterationGuardState,
  } from '../../../lib/engine/design/section-advice';
  import type { MemberDesignOutcome } from '../../../lib/engine/design/outcome';

  interface Props {
    outcome: MemberDesignOutcome;
    guard: IterationGuardState;
    onClose: () => void;
    onApplied: (elementId: number) => void;
  }
  let { outcome, guard, onClose, onApplied }: Props = $props();

  const advice = $derived(outcome.sectionAdvice!);
  const elem = $derived(modelStore.elements.get(outcome.elementId));
  const section = $derived(elem ? modelStore.sections.get(elem.sectionId) : undefined);
  /** How many other elements share this section — a change affects all of them. */
  const shared = $derived.by(() => {
    if (!elem) return 0;
    let n = 0;
    for (const [, e] of modelStore.elements) if (e.sectionId === elem.sectionId) n++;
    return n;
  });

  const verdict = $derived(checkIterationGuard(
    guard,
    advice.proposedB * advice.proposedH,
    outcome.provisional?.worstUtilization ?? 0,
    advice.capReached,
  ));

  function apply() {
    if (!verdict.ok || !elem || !section) return;
    // Routed through the normal section-update path, so modelVersion bumps and the
    // mutation hook clears results + invalidates the analysis revision. That is
    // exactly what forces the mandatory re-solve.
    modelStore.updateSection(elem.sectionId, { b: advice.proposedB, h: advice.proposedH });
    onApplied(outcome.elementId);
    onClose();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label={t('design.advice.title')}
     data-testid="section-advice-dialog"
     onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} tabindex="-1">
  <h2>{t('design.advice.title')} — {t('design.table.element')} {outcome.elementId}</h2>
  <p class="prelim" data-testid="advice-preliminary">{t('design.advice.preliminary')}</p>

  <div class="grid">
    <span>{t('design.advice.current')}</span>
    <span class="mono">{(advice.currentB * 1000).toFixed(0)} × {(advice.currentH * 1000).toFixed(0)} mm</span>
    <span>{t('design.advice.proposed')}</span>
    <span class="mono strong" data-testid="advice-proposed">
      {(advice.proposedB * 1000).toFixed(0)} × {(advice.proposedH * 1000).toFixed(0)} mm
    </span>
    <span>{t('design.advice.driver')}</span>
    <span class="mono">{advice.driver}</span>
    {#if advice.screenedUtilization !== undefined}
      <span>screen u</span><span class="mono">≈ {advice.screenedUtilization.toFixed(2)}</span>
    {/if}
  </div>

  {#each advice.rationale as r}
    <p class="reason" data-testid="advice-reason">{tp(r.key, r.params)}</p>
  {/each}

  {#if section && shared > 1}
    <p class="shared" data-testid="advice-shared-warning">
      ⚠ {section.name} is used by {shared} elements — all of them change.
    </p>
  {/if}

  <p class="guard" data-testid="advice-guard">
    {#if verdict.ok}
      Iteration {guard.iterations + 1} / {MAX_SECTION_ITERATIONS}
    {:else}
      {t(`design.advice.guard.${verdict.reason}`)}
    {/if}
  </p>

  <div class="actions">
    <button class="btn" onclick={onClose} data-testid="advice-dismiss">{t('design.advice.dismiss')}</button>
    <button class="btn btn-primary" onclick={apply} disabled={!verdict.ok}
            data-testid="advice-apply">{t('design.advice.apply')}</button>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 900; }
  .dialog { position: fixed; z-index: 901; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(92vw, 560px); background: var(--st-surface); border: 1px solid var(--st-warn);
    border-radius: 6px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); padding: 12px 14px;
    display: flex; flex-direction: column; gap: 7px; }
  h2 { margin: 0; font-size: 0.9rem; color: var(--st-text); }
  .prelim { margin: 0; font-size: 0.7rem; color: var(--st-warn); font-style: italic; }
  .grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 0.72rem; color: var(--st-text-2); }
  .mono { font-family: monospace; }
  .strong { font-weight: 700; color: var(--st-text); }
  .reason { margin: 0; font-size: 0.7rem; color: var(--st-text-2); }
  .shared { margin: 0; font-size: 0.7rem; color: var(--st-text); }
  .guard { margin: 0; font-size: 0.68rem; color: var(--st-text-2); }
  .actions { display: flex; gap: 7px; justify-content: flex-end; }
  .btn { padding: 4px 11px; background: var(--st-surface-3); border: 1px solid var(--st-info);
    border-radius: 4px; color: var(--st-text); font-size: 0.74rem; font-weight: 600; cursor: pointer; }
  .btn-primary { background: var(--st-hair-strong); border-color: var(--st-warn); color: var(--st-text); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
</style>
