<script lang="ts">
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { rs } from '../i18n';
  import { researchAssetBase } from './assets';
  /**
   * Stabileo's viewer on a research page: the app's ScalarFieldViewer from its own bundle
   * (research-wasm/viewer/, built by research/fracture/shauer-2025/wasm/build.sh), mounted here and
   * fed with this component's props. Takes the props of ScalarFieldViewer, plain data only.
   */
  import { viewerInteraction } from './viewer-interaction';
  import { onDestroy, onMount } from 'svelte';

  let { oninteract = () => {}, ...props }: Record<string, unknown> & { oninteract?: () => void } = $props();
  let host: HTMLDivElement;
  let handle: { update(p: Record<string, unknown>): void; destroy(): void } | null = null;
  let failed = $state(false);
  const BASE = `${researchAssetBase}viewer/`;

  onMount(() => {
    if (!document.querySelector(`link[data-research-viewer]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${BASE}viewer.css`;
      link.dataset.researchViewer = '';
      document.head.appendChild(link);
    }
    let cancelled = false;
    import(/* @vite-ignore */ `${BASE}viewer.js`)
      .then((m: { mountScalarFieldViewer: (el: HTMLElement, p: Record<string, unknown>) => typeof handle }) => {
        if (cancelled) return;
        handle = m.mountScalarFieldViewer(host, { ...props, locale: publicI18n.locale });
      })
      .catch((err) => {
        console.warn('research: the viewer bundle could not be loaded', err);
        failed = true;
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const next = { ...props, locale: publicI18n.locale };
    handle?.update(next);
  });

  onDestroy(() => handle?.destroy());
  const strings = $derived(rs());
</script>

<div class="rs-viewer-host" bind:this={host} use:viewerInteraction={() => oninteract()}>
  {#if failed}<p class="rs-viewer-failed">{strings.viewerUnavailable}</p>{/if}
</div>

<style>
  .rs-viewer-host :global(button), .rs-viewer-host :global(input) { min-width: 44px; min-height: 44px; }
  .rs-viewer-host :global(.sfv-wrap *) { font-size: max(12px, 0.75rem); }
  .rs-viewer-host :global(.sfv-toolbar) { flex-wrap: wrap; }
  .rs-viewer-host :global(.shell-legend) { max-width: calc(100% - 24px); }

  .rs-viewer-failed {
    color: var(--fg-2);
    font-size: 0.9rem;
    padding: 2rem 1rem;
    text-align: center;
    border: 1px dashed var(--hair);
  }
</style>
