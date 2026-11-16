<script lang="ts">
  import type { Snippet } from 'svelte';
  import { knownIssueDiagnosticsIn, knownIssueMessage } from '../lib/engine/known-issues';
  import { groupKnownIssues, visibleNotices } from '../lib/store/result-notices';
  import { t } from '../lib/i18n';
  import { noticePrefs } from '../lib/store/notice-prefs.svelte';
  import NoticeRow from './notices/NoticeRow.svelte';
  let { result, children }: { result: unknown; children: Snippet } = $props();
  const notices = $derived(visibleNotices(groupKnownIssues(knownIssueDiagnosticsIn(result), knownIssueMessage), (k) => noticePrefs.isHidden(k)));
  const refused = $derived(notices.some((n) => n.level === 'blocking'));
</script>

{#if notices.length}
  <div role="alert" data-testid="known-issue-result">
    {#each notices as notice (notice.kind)}
      <NoticeRow kind={notice.kind} level={notice.level} summary={t(`notices.kind.${notice.kind}`)} details={notice.details} open={notice.level === 'blocking'} />
    {/each}
  </div>
{/if}
{#if !refused}{@render children()}{/if}
