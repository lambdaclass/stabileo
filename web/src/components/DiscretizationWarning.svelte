<script lang="ts">
  import { t } from '../lib/i18n';
  import { noticePrefs } from '../lib/store/notice-prefs.svelte';

  let { unestimable, warn, threshold }: { unestimable?: string | null; warn: boolean; threshold: string } = $props();
</script>

{#if unestimable || (warn && !noticePrefs.isHidden('discretization'))}
  <div class="warning" data-testid="discretization-warning">
    {#if unestimable}
      {t(unestimable)}
    {:else}
      <strong>{t('notices.kind.discretization')}</strong>
      {t('discretization.warning').replace('{threshold}', threshold)}
      <button onclick={() => noticePrefs.hide('discretization')} data-testid="notice-hide-kind">{t('notices.hideKind')}</button>
    {/if}
  </div>
{/if}

<style>
  .warning { margin-top: 3px; padding-left: 6px; border-left: 3px solid var(--st-info); }
  strong { display: block; font-weight: 600; color: var(--st-text); }
  button { padding: 0; border: none; background: none; color: var(--st-accent); font: inherit; text-decoration: underline; cursor: pointer; }
</style>
