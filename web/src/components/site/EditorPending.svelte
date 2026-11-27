<script lang="ts">
  import { publicI18n, tPublic as t } from '../../lib/i18n/store.svelte';
  import BrandMark from '../landing/BrandMark.svelte';

  let { failed = false }: { failed?: boolean } = $props();
</script>

<main data-editor-loading lang={publicI18n.locale}>
  <div class="mark" class:pulse={!failed} aria-hidden="true"><BrandMark /></div>
  {#if failed}
    <p role="alert">{t('landing.loadFailed')}</p>
    <button type="button" onclick={() => location.reload()}>{t('landing.reload')}</button>
  {:else}
    <p role="status">{t('landing.openingEditor')}</p>
  {/if}
</main>

<style>
  main {
    position: fixed;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.75rem;
    padding: 1rem;
    text-align: center;
    background: #0c1620;
    color: #d8e2e9;
  }

  .mark {
    width: 3rem;
    color: #8fa3b3;
  }

  .mark :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  .pulse {
    animation: pulse 1.5s ease-in-out infinite alternate;
  }

  @keyframes pulse {
    from { opacity: 0.6; }
    to { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse { animation: none; }
  }
</style>
