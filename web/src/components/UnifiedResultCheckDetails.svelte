<script module lang="ts">
  import { noticePrefs } from '../lib/store/notice-prefs.svelte';
  export const discretizationVisible = () => !noticePrefs.isHidden('discretization');
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n';
  let { open = $bindable(false), warn, notCertified, summary, children }: {
    open?: boolean; warn: boolean; notCertified: boolean; summary: string; children: Snippet;
  } = $props();
</script>

<details class="rc" class:flagged={warn} class:warn={notCertified} bind:open data-testid="result-checks" data-flagged={warn} data-flag-level={notCertified ? 'warn' : warn ? 'info' : undefined}>
    <summary data-testid="result-checks-toggle">
      <span class="rc-title">{t('resultChecks.title')}</span>
      {#if summary}<span class="rc-summary">{summary}</span>{/if}
    </summary>
    {@render children()}
  </details>

<style>
  .rc { margin-top: 8px; border-top: 1px solid var(--st-hair); padding-top: 6px; }
  summary { display: flex; align-items: center; min-height: 44px; flex-wrap: wrap; gap: 8px; cursor: pointer; list-style: none; font-size: 12px; color: var(--st-text-2); }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: '▸'; color: var(--st-text-3); font-size: 12px; }
  details[open] > summary::before { content: '▾'; }
  .rc-title { font-weight: 500; }
  .rc-summary { min-width: 0; overflow-wrap: anywhere; color: var(--st-text-3); font-size: 12px; }
  .flagged > summary { border-left: 3px solid var(--st-info); padding-left: 6px; }
  .flagged .rc-summary { color: var(--st-info); }
  .flagged.warn > summary { border-left-color: var(--st-warn); }
  .flagged.warn .rc-summary { color: var(--st-warn); }
</style>
