<script lang="ts">
  import type { Snippet } from 'svelte';
  import { knownIssueDiagnosticsIn, knownIssueMessage, knownIssueDisposition } from '../lib/engine/known-issues';
  import { groupKnownIssues, visibleNotices } from '../lib/store/result-notices';
  import { t } from '../lib/i18n';
  import { noticePrefs } from '../lib/store/notice-prefs.svelte';
  import NoticeRow from './notices/NoticeRow.svelte';
  let { result, children }: { result: unknown; children: Snippet } = $props();
  const diagnostics = $derived(knownIssueDiagnosticsIn(result));
  const notices = $derived(visibleNotices(groupKnownIssues(diagnostics, knownIssueMessage), (k) => noticePrefs.isHidden(k)));
  const disposition = $derived(knownIssueDisposition(diagnostics));
</script>

{#if __PUBLIC_FEATURES__.proPlatesUnified}
  {#if notices.length}
    <div role="alert" data-testid="known-issue-result">
      {#each notices as notice (notice.kind)}
        <NoticeRow kind={notice.kind} level={notice.level} summary={t(`notices.kind.${notice.kind}`)} details={notice.details} open={notice.level === 'blocking'} />
      {/each}
    </div>
  {/if}
{:else}
  {#each disposition.messages as message}<div role="alert">{message}</div>{/each}
{/if}
{#if !disposition.refused}{@render children()}{/if}
