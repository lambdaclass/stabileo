<script module lang="ts">
  import { knownIssueDiagnosticsIn, knownIssueDisposition, knownIssueMessage } from '../lib/engine/known-issues';
  import { noticePrefs } from '../lib/store/notice-prefs.svelte';
  import { groupKnownIssues, visibleNotices, type ResultNotice } from '../lib/store/result-notices';

  export function review(result: unknown) {
    const diagnostics = knownIssueDiagnosticsIn(result);
    return {
      ...knownIssueDisposition(diagnostics),
      notices: visibleNotices(groupKnownIssues(diagnostics, knownIssueMessage), kind => noticePrefs.isHidden(kind)),
    };
  }
</script>

<script lang="ts">
  import { t } from '../lib/i18n';
  import NoticeRow from './notices/NoticeRow.svelte';
  let { disposition }: { disposition: { refused: boolean; notices?: ResultNotice[] } } = $props();
</script>

{#if disposition.notices?.length}
  <div role="alert" data-testid="known-issue-result">
    {#each disposition.notices as notice (notice.kind)}
      <NoticeRow kind={notice.kind} level={notice.level} summary={t(`notices.kind.${notice.kind}`)} details={notice.details} open={notice.level === 'blocking'} />
    {/each}
  </div>
{/if}
