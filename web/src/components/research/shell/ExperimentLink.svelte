<script lang="ts">
  /** An inline link in the article that drives the app pane: shows a step or sets parameters. */
  import type { Snippet } from 'svelte';
  import { useExperiment } from './context';

  let { step, params, tab, children }: { step?: number; params?: Record<string, number | string | boolean>; tab?: string; children: Snippet } = $props();
  const exp = useExperiment();

  function go() {
    if (tab) exp?.showTab(tab);
    if (params) exp?.setParams(params);
    if (step !== undefined) exp?.goToStep(step);
    const pane = document.querySelector('.rs-shell-app');
    const stacked = window.matchMedia('(max-width: 69.99rem)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (pane && stacked) pane.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
</script>

<button type="button" class="rs-xlink" onclick={go}>{@render children()}</button>

<style>
  .rs-xlink {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: var(--lp-accent, #e5482a);
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .rs-xlink:hover {
    text-decoration-style: solid;
  }
</style>
