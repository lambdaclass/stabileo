<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t, tp } from '../lib/i18n';
  import { uiStore } from '../lib/store/ui.svelte';
  import { containmentDismissal } from '../lib/store/containment-dismissal.svelte';
  import { noticePrefs } from '../lib/store/notice-prefs.svelte';
  import { knownIssueMessage } from '../lib/engine/known-issue-message';
  import { boardNotices, groupKnownIssues, topLevel, visibleNotices, type NoticeKind, type ResultNotice } from '../lib/store/result-notices';
  import NoticeRow from './notices/NoticeRow.svelte';

  type Finding = { code: string; severity: string; phase?: string; value?: number; message: string };
  let { disposition, diagnostics = [], children, preserveModel = false, extra = [], actions, onDiagnostics }: {
    preserveModel?: boolean; disposition: { refused: boolean; messages: string[] }; diagnostics?: readonly Finding[]; children?: Snippet;
    /** The app's own notices beside the engine's: results out of date, features under review. */
    extra?: readonly ResultNotice[];
    /** What a notice of the app's own lets the reader do, below its text. */
    actions?: Snippet<[NoticeKind]>;
    /** Opens the diagnostics, where every notice stays once this is closed. */
    onDiagnostics?: () => void;
  } = $props();

  const grouped = $derived(diagnostics.length || !disposition.messages.length ? groupKnownIssues(diagnostics, knownIssueMessage)
    : [{ kind: disposition.refused ? 'withheld' as const : 'limitation' as const, level: disposition.refused ? 'blocking' as const : 'warning' as const, details: disposition.messages }]);
  const notices = $derived(visibleNotices(boardNotices(grouped, extra), (k) => noticePrefs.isHidden(k)));
  const messages = $derived([...disposition.messages, ...extra.filter((n) => notices.includes(n)).flatMap((n) => [n.summary ?? n.kind, ...n.details])]);
  const level = $derived(topLevel(notices));
  const refused = $derived(level === 'blocking');
  const summaryOf = (n: ResultNotice) => n.summary ?? t(`notices.kind.${n.kind}`);
  const headline = $derived(notices.length === 1 ? summaryOf(notices[0]!) : tp('notices.count', { n: notices.length }));
  let open = $state(false);
  let shown = '';
  $effect(() => {
    const now = messages.join('\n');
    if (now !== shown) { shown = now; open = false; }
  });
</script>

{#if notices.length && !containmentDismissal.isDismissed(messages)}
  <div class="containment-notice lvl-{level}" class:refused class:open role="alert" data-testid="containment-notice" data-level={level}>
    <div class="cn-line">
      <span class="cn-dot" aria-hidden="true"></span>
      <span class="cn-headline" data-testid="containment-headline">{headline}</span>
      <button class="cn-toggle" aria-expanded={open} onclick={() => (open = !open)} data-testid="containment-toggle">{open ? t('containment.less') : notices.length > 1 ? `${t('containment.more')} (${notices.length})` : t('containment.more')}</button>
      <button class="cn-close" aria-label={t('toast.dismiss')} title={t(uiStore.analysisMode === 'pro' ? 'containment.dismissHintPro' : 'containment.dismissHintBasic')} onclick={() => containmentDismissal.dismiss(messages)} data-testid="containment-dismiss">×</button>
    </div>
    <div class="cn-list" hidden={!open}>
      {#each notices as notice (notice.kind)}
        <NoticeRow kind={notice.kind} level={notice.level} summary={summaryOf(notice)} details={notice.details} testid="containment-row">
          {#if actions && extra.some((x) => x.kind === notice.kind)}{@render actions(notice.kind)}{/if}
        </NoticeRow>
      {/each}
      {#if onDiagnostics}<button class="cn-diag" onclick={onDiagnostics} data-testid="containment-diagnostics">{t('containment.toDiagnostics')}</button>{/if}
    </div>
  </div>
{/if}
{#if children && (preserveModel || !disposition.refused)}{@render children()}{/if}

<style>
  .containment-notice { position: absolute; top: 8px; left: 8px; right: 56px; z-index: 20; pointer-events: none; display: flex; flex-direction: column; gap: 6px; padding: 2px 4px 2px 8px; border: 1px solid var(--st-hair-strong); border-left: 3px solid var(--st-info); border-radius: 4px; background: var(--st-surface); color: var(--st-text); font-size: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); }
  .containment-notice.lvl-warning { border-left-color: var(--st-warn); }
  .containment-notice.refused { border-left-color: var(--st-danger); }
  .cn-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .cn-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--st-info); }
  .lvl-warning .cn-dot { background: var(--st-warn); }
  .refused .cn-dot { background: var(--st-danger); }
  .cn-headline { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .containment-notice.open { padding: 6px 8px; max-height: 60vh; overflow-y: auto; pointer-events: auto; }
  .containment-notice.open .cn-headline { white-space: normal; }
  .cn-list { display: flex; flex-direction: column; gap: 4px; }
  .cn-list[hidden] { display: none; }
  .cn-toggle { flex: none; pointer-events: auto; cursor: pointer; min-height: 26px; padding: 0 10px; border: 1px solid var(--st-hair-strong); border-radius: 4px; background: transparent; color: inherit; font-size: 12px; }
  .cn-diag { align-self: flex-start; pointer-events: auto; cursor: pointer; min-height: 30px; padding: 0 10px; border: 1px solid var(--st-hair-strong); border-radius: 4px; background: transparent; color: inherit; font-size: 12px; }
  .cn-close { flex: none; pointer-events: auto; cursor: pointer; min-width: 26px; min-height: 26px; padding: 0 6px; border: none; background: transparent; color: inherit; font-size: 18px; line-height: 1; }
  @media (max-width: 640px) {
    .cn-toggle { min-height: 40px; padding: 0 12px; }
    .cn-close { min-width: 40px; min-height: 40px; }
  }
</style>
