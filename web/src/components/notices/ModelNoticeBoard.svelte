<script lang="ts">
  import type { Snippet } from 'svelte';
  import ContainmentBanner from '../ContainmentBanner.svelte';
  import { t } from '../../lib/i18n';
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { deskUi } from '../../lib/store/design-desk-ui.svelte';
  import { rebarWorkspace } from '../../lib/store/rebar-workspace.svelte';
  import { recheckBanner, boardCovered } from '../../lib/store/recheck-banner.svelte';
  import type { ResultNotice } from '../../lib/store/result-notices';
  import { verificationStore } from '../../lib/store/verification.svelte';
  import { modelAuditFeatures, underAudit, UNDER_AUDIT_URL } from '../../lib/provenance/under-audit';

  let { children }: { children: Snippet } = $props();
  const appNotices = $derived.by((): ResultNotice[] => {
    const out: ResultNotice[] = [];
    if (recheckBanner.text && !boardCovered()) out.push({ kind: 'outdated', level: recheckBanner.alert ? 'blocking' : 'warning', details: [], key: `${recheckBanner.alert ? 'advisory' : 'stale'}:${recheckBanner.text}` });
    if (!deskUi.open && !rebarWorkspace.open && underAudit([...modelAuditFeatures(modelStore.model), ...(verificationStore.concrete.length ? ['rc-design' as const] : [])])) out.push({ kind: 'underReview', level: 'info', details: [] });
    return out;
  });
</script>

{#snippet noticeActions(kind: string)}
  {#if kind === 'outdated'}
    <span class="notice-actions" data-testid="recheck-stale-banner" role={recheckBanner.alert ? 'alert' : 'status'}>
      <span class="notice-text" data-testid={recheckBanner.alert ? 'recheck-advisory-banner' : undefined}>{recheckBanner.text}</span>
      <button type="button" onclick={() => recheckBanner.review()} data-testid="recheck-banner-details">{t('recheck.bannerDetails')}</button>
      {#if recheckBanner.canRerun}<button type="button" class="primary" disabled={recheckBanner.busy} onclick={() => recheckBanner.rerun()} data-testid="recheck-banner-rerun">{t('recheck.bannerRerun')}</button>{/if}
    </span>
  {:else if kind === 'underReview'}
    <a href={UNDER_AUDIT_URL} target="_blank" rel="noopener noreferrer" data-testid="under-audit-notice">{t('notices.underReviewMore')}</a>
  {/if}
{/snippet}

<ContainmentBanner preserveModel extra={appNotices} actions={noticeActions} onDiagnostics={uiStore.appMode === 'pro' ? () => (uiStore.proActiveTab = 'diagnostics') : undefined} disposition={uiStore.is3DWorkspace ? resultsStore.knownIssues3D : resultsStore.knownIssues} diagnostics={uiStore.is3DWorkspace ? resultsStore.knownIssueDiagnostics3D : resultsStore.knownIssueDiagnostics} {children} />

<style>
  .notice-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 2px; }
  .notice-text { flex-basis: 100%; }
  .notice-actions button { min-height: 44px; padding: 0 10px; border: 1px solid var(--st-hair-strong); border-radius: 4px; background: transparent; color: var(--st-text); font: inherit; cursor: pointer; }
  .notice-actions button.primary { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .notice-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
