<script lang="ts">
  /** An inline link in the article that drives the app pane: shows a step or sets parameters. */
  import type { Snippet } from 'svelte';
  import { useExperiment } from './context';

  let { step, params, children }: { step?: number; params?: Record<string, number | string | boolean>; children: Snippet } = $props();
  const exp = useExperiment();

  function go() {
    if (params) exp?.setParams(params);
    if (step !== undefined) exp?.goToStep(step);
    const pane = document.querySelector('.rs-shell-app');
    if (pane && window.innerWidth < 1100) pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
