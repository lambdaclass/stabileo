<script lang="ts">
  import type { Snippet } from 'svelte';
  import { knownIssueResultDisposition } from '../lib/engine/known-issues';
  import { t } from '../lib/i18n';
  import { noticePrefs } from '../lib/store/notice-prefs.svelte';
  import NoticeRow from './notices/NoticeRow.svelte';
  let { result, children }: { result: unknown; children: Snippet } = $props();
  const disposition = $derived(knownIssueResultDisposition(result));
  const kind = $derived(disposition.refused ? 'withheld' as const : 'limitation' as const);
</script>

{#if disposition.messages.length && (disposition.refused || !noticePrefs.isHidden(kind))}
  <div role="alert">
    <NoticeRow {kind} level={disposition.refused ? 'blocking' : 'warning'} summary={t(`notices.kind.${kind}`)} details={disposition.messages} open={disposition.refused} />
  </div>
{/if}
{#if !disposition.refused}{@render children()}{/if}
