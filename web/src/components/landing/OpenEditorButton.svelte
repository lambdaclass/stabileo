<script lang="ts">
  import type { Snippet } from 'svelte';
  import { enterApp, prefetchApp } from './landing-utils';

  let { children, class: className }: { children: Snippet; class?: string } = $props();
  let pending = $state(false);

  function open() {
    if (pending) return;
    pending = true;
    enterApp();
  }
</script>

<svelte:window onpopstate={() => { pending = false; }} />

<button
  type="button"
  class={className}
  class:pending
  aria-busy={pending || undefined}
  aria-disabled={pending || undefined}
  onclick={open}
  onpointerenter={(event) => { if (event.pointerType === 'mouse') prefetchApp(); }}
  onfocus={prefetchApp}
>{@render children()}</button>

<style>
  .pending {
    position: relative;
    cursor: progress;
  }

  .pending::after {
    content: '';
    position: absolute;
    inset: auto 0.5em 0.2em;
    height: 2px;
    background: currentColor;
  }
</style>
