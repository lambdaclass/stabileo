<script lang="ts">
  /**
   * The concrete code the design is produced under, as a read-out, with the reason and the way
   * to bind it when none is in force. Shown where the numbers are read (the overview) and where
   * the commands that use it are (the member list), so both say the same code in the same words.
   */
  import { t } from '../../../lib/i18n';
  import { te } from '../../../lib/i18n/engine-text';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import { bindingLabel } from '../../../lib/codes/roles';

  interface Props {
    /** Open the project regulations and put the caret in their selector. */
    onOpenRegulations: () => void;
    /** Also offer the way to change it while a code is in force (the member list). */
    changeable?: boolean;
  }
  const { onOpenRegulations, changeable = false }: Props = $props();

  const concreteProblem = $derived(regulationsStore.concreteDesignProblem());
  const concreteReady = $derived(regulationsStore.concreteDesignCode() !== null);
  // The same labeller Project Regulations uses, so the read-out and the selector can never print
  // the regulation differently.
  const concreteLabel = $derived(te(bindingLabel(regulationsStore.binding('concrete'))));
</script>

<div class="code-line">
  <span class="code-indicator" data-testid="active-concrete-code" class:unbound={!concreteReady}>
    <span class="code-role">{t('design.code.role')}</span>
    <span class="code-name">{concreteLabel}</span>
  </span>
  {#if !concreteReady && concreteProblem}
    <span class="code-gate" role="alert" data-testid="concrete-code-gate">
      {te(concreteProblem)}
      <button type="button" class="code-gate-link" data-testid="goto-project-regulations"
              onclick={onOpenRegulations}>{t('design.code.openRegulations')}</button>
    </span>
  {:else if changeable}
    <button type="button" class="code-change" data-testid="desk-list-code"
            onclick={onOpenRegulations}>{t('design.code.openRegulations')}</button>
  {/if}
</div>

<style>
  .code-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; }
  .code-indicator { display: inline-flex; align-items: baseline; gap: 0.35rem; font-size: 0.72rem; }
  .code-role { color: var(--st-text-2); }
  .code-name { font-weight: 600; color: var(--st-text); }
  .code-indicator.unbound .code-name { color: var(--st-warn); }
  .code-gate { font-size: 0.68rem; color: var(--st-warn); display: inline-flex; gap: 0.35rem; flex-wrap: wrap; }
  .code-gate-link {
    background: none; border: 0; padding: 0;
    color: var(--st-interactive); text-decoration: underline; cursor: pointer;
    font-size: 0.68rem;
  }
  .code-change {
    font-size: 0.68rem; padding: 2px 8px; border-radius: 4px; cursor: pointer;
    border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text);
  }
  .code-gate-link:focus-visible, .code-change:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
</style>
