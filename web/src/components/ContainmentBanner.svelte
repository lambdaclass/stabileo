<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n';
  let { disposition, children, preserveModel = false }: { preserveModel?: boolean; disposition: { refused: boolean; messages: string[] }; children?: Snippet } = $props();
  let open = $state(false);
</script>

{#if disposition.messages.length}
  <div class="containment-notice" class:refused={disposition.refused} class:open role="alert" data-testid="containment-notice">
    <button class="cn-toggle" aria-expanded={open} onclick={() => (open = !open)} data-testid="containment-toggle">{open ? t('containment.less') : t('containment.more')}</button>
    {#each disposition.messages as message}<p>{message}</p>{/each}
  </div>
{/if}
{#if children && (preserveModel || !disposition.refused)}{@render children()}{/if}

<style>
  .containment-notice { position: absolute; top: 8px; left: 8px; right: 56px; z-index: 20; pointer-events: none; padding: 8px 12px; border: 2px solid #a65b00; background: #fff4db; color: #513000; font-size: 12px; }
  .containment-notice.refused { border-color: #b42318; background: #fff0ee; color: #7a1610; }
  p { margin: 4px 0; }
  .cn-toggle { display: none; }
  @media (max-width: 640px) {
    .containment-notice { display: flex; align-items: center; gap: 8px; padding: 2px 4px 2px 8px; }
    .containment-notice p { flex: 1; min-width: 0; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .containment-notice p + p { display: none; }
    .containment-notice.open { display: block; padding: 8px 12px; }
    .containment-notice.open p { white-space: normal; margin: 4px 0; }
    .containment-notice.open p + p { display: block; }
    .cn-toggle { display: block; order: 1; flex: none; pointer-events: auto; min-height: 40px; padding: 0 12px; border: 1px solid currentColor; border-radius: 4px; background: transparent; color: inherit; font-size: 12px; }
    .containment-notice.open .cn-toggle { float: right; margin: 0 0 4px 8px; }
  }
</style>
