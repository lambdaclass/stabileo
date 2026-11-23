<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { enterApp, prefetchApp } from './landing-utils';

  let { label, class: className }: { label: string; class?: string } = $props();
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
>{t(label)}</button>

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
