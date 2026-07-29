<script lang="ts">
  /**
   * Status / flag badges for the design table.
   *
   * Every state carries a GLYPH and TEXT, never colour alone — a11y requirement and
   * the reason "stale" and "unavailable" can never be mistaken for a pass.
   */
  import { t } from '../../../lib/i18n';
  import type { DisplayStatus } from '../../../lib/store/verification.svelte';
  import type { DesignOutcomeKind } from '../../../lib/engine/design/outcome';

  interface Props {
    status?: DisplayStatus;
    outcome?: DesignOutcomeKind;
    flag?: 'edited' | 'auto' | 'provisional' | 'noRebar' | 'certified' | 'sloped';
    compact?: boolean;
  }
  let { status, outcome, flag, compact = false }: Props = $props();

  const STATUS_GLYPH: Record<DisplayStatus, string> = {
    ok: '✓', warn: '⚠', fail: '✗', unavailable: '○', stale: '⌛',
  };
  const OUTCOME_GLYPH: Record<DesignOutcomeKind, string> = {
    VERIFIED: '✓', SECTION_INADEQUATE: '▣', DEMAND_UNAVAILABLE: '○',
    SEARCH_EXHAUSTED: '◌', UNSUPPORTED: '—',
  };
  const OUTCOME_KEY: Record<DesignOutcomeKind, string> = {
    VERIFIED: 'design.counts.verified',
    SECTION_INADEQUATE: 'design.counts.sectionInadequate',
    DEMAND_UNAVAILABLE: 'design.counts.unavailable',
    SEARCH_EXHAUSTED: 'design.counts.exhausted',
    UNSUPPORTED: 'design.counts.unsupported',
  };
  const FLAG_GLYPH = { edited: '✎', auto: '⚙', provisional: '◌', noRebar: '○', certified: '✓', sloped: '↗' } as const;
</script>

{#if status}
  <span class="badge badge-{status}" data-testid="status-badge" data-status={status}
        title={t(`design.status.${status}`)}>
    <span aria-hidden="true">{STATUS_GLYPH[status]}</span>
    {#if !compact}<span class="badge-text">{t(`design.status.${status}`)}</span>{/if}
    <span class="sr-only">{t(`design.status.${status}`)}</span>
  </span>
{/if}

{#if outcome}
  <span class="badge badge-outcome badge-outcome-{outcome}" data-testid="outcome-badge" data-outcome={outcome}
        title={t(OUTCOME_KEY[outcome])}>
    <span aria-hidden="true">{OUTCOME_GLYPH[outcome]}</span>
    {#if !compact}<span class="badge-text">{t(OUTCOME_KEY[outcome])}</span>{/if}
    <span class="sr-only">{t(OUTCOME_KEY[outcome])}</span>
  </span>
{/if}

{#if flag}
  <span class="badge badge-flag badge-flag-{flag}" data-testid="flag-badge" data-flag={flag}
        title={t(`design.badge.${flag}`)}>
    <span aria-hidden="true">{FLAG_GLYPH[flag]}</span>
    <span class="badge-text">{t(`design.badge.${flag}`)}</span>
  </span>
{/if}

<style>
  .badge {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 1px 5px; border-radius: 3px;
    font-size: 0.68rem; font-weight: 600; line-height: 1.4;
    white-space: nowrap; border: 1px solid transparent;
  }
  .badge-text { font-weight: 500; }
  .badge-ok { background: rgba(34, 204, 102, 0.16); color: #7ee2a8; border-color: #2a7a4a; }
  .badge-warn { background: rgba(221, 170, 0, 0.16); color: #f0cc66; border-color: #8a6a10; }
  .badge-fail { background: rgba(238, 34, 34, 0.16); color: #ff8a8a; border-color: #8a2a2a; }
  .badge-unavailable { background: rgba(136, 136, 136, 0.16); color: #aab; border-color: #445; }
  /* Stale = desaturated + hatch, so it is distinguishable without hue. */
  .badge-stale {
    color: #d8d4bb; border-color: #6a6a55;
    background: repeating-linear-gradient(45deg, rgba(138,143,122,0.30) 0 4px, rgba(93,97,84,0.30) 4px 8px);
  }
  .badge-outcome { background: rgba(60, 90, 140, 0.18); color: #b8cbe8; border-color: #2a4a7a; }
  .badge-outcome-VERIFIED { background: rgba(34, 204, 102, 0.16); color: #7ee2a8; border-color: #2a7a4a; }
  .badge-outcome-SECTION_INADEQUATE { background: rgba(255, 102, 0, 0.16); color: #ffb37a; border-color: #8a4a10; }
  .badge-outcome-SEARCH_EXHAUSTED { background: rgba(180, 120, 220, 0.16); color: #d3b0e8; border-color: #5a3a7a; }
  .badge-flag { background: rgba(70, 80, 100, 0.35); color: #ccd; border-color: #3a4356; }
  .badge-flag-edited { color: #9fd8ff; border-color: #2a5a7a; }
  .badge-flag-provisional { color: #d3b0e8; border-color: #5a3a7a; }
  .badge-flag-sloped { color: #ffcc66; border-color: #7a5a10; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
</style>
