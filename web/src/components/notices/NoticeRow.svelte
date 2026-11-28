<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n';
  import { noticePrefs } from '../../lib/store/notice-prefs.svelte';
  import type { NoticeKind, NoticeLevel } from '../../lib/store/result-notices';

  let { kind, level, summary, details = [], open = $bindable(false), testid, children, actions }: {
    kind: NoticeKind; level: NoticeLevel; summary: string; details?: string[]; open?: boolean; testid?: string; children?: Snippet;
    /** What the notice lets the reader do, shown under it whether its details are open or not. */
    actions?: Snippet;
  } = $props();
</script>

<div class="notice-row" data-testid={testid ?? 'notice-row'} data-kind={kind} data-level={level}>
<details class="notice lvl-{level}" bind:open>
  <summary data-testid="notice-summary"><span class="dot" aria-hidden="true"></span><span class="text">{summary}</span></summary>
  <!-- Keyboard users must be able to focus and scroll the bounded details. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="notice-details warning-details" role="region" aria-label={summary} tabindex="0">
    {#each details as line}<p>{line}</p>{/each}
    {@render children?.()}
    {#if __PUBLIC_FEATURES__.proPlatesUnified && level !== 'blocking'}
      <button type="button" class="hide" onclick={() => noticePrefs.hide(kind)} data-testid="notice-hide-kind">{t('notices.hideKind')}</button>
    {/if}
  </div>
</details>
{#if actions}<div class="notice-actions" data-testid="notice-actions">{@render actions()}</div>{/if}
</div>

<style>
  .notice-row { min-width: 0; }
  .notice-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 8px 2px 24px; }
  .notice { min-width: 0; border: 1px solid var(--st-hair); border-left: 3px solid var(--st-info); border-radius: 4px; background: var(--st-surface); color: var(--st-text); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
  .notice.lvl-warning { border-left-color: var(--st-warn); }
  .notice.lvl-blocking { border-left-color: var(--st-danger); }
  summary { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 8px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: '▸'; margin-left: auto; color: var(--st-text-3); }
  details[open] > summary::after { content: '▾'; }
  .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--st-info); }
  .lvl-warning .dot { background: var(--st-warn); }
  .lvl-blocking .dot { background: var(--st-danger); }
  .text { min-width: 0; }
  .notice-details { max-height: 160px; overflow: auto; padding: 0 8px 6px 24px; color: var(--st-text-2); }
  p { margin: 4px 0; }
  .hide { margin-top: 4px; min-height: 32px; padding: 0 8px; border: 1px solid var(--st-hair); border-radius: 4px; background: transparent; color: var(--st-text-2); font: inherit; cursor: pointer; }
  .hide:hover { color: var(--st-text); border-color: var(--st-hair-strong); }
</style>
