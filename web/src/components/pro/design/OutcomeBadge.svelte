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
    // `◐` for a proposal: half-filled, which is what it is — one axis designed and verified,
    // the other not evaluated. Distinct from `✗` and from `○` at a glance and by name, because
    // every state here carries a glyph AND text and may never rely on colour alone.
    ok: '✓', warn: '⚠', fail: '✗', provisional: '◐', unavailable: '○', stale: '⌛',
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
  .badge-ok { background: rgba(34, 204, 102, 0.16); color: var(--st-ok); border-color: var(--st-ok); }
  .badge-warn { background: var(--st-warn-bg); color: var(--st-warn); border-color: var(--st-warn); }
  /* `--st-danger`, not `--st-accent`. The accent is the brand and the fill this application
     puts on destructive BUTTONS; a failed verification is a status, and reading it in the
     same vermillion made a result look like an action. */
  .badge-fail { background: var(--st-danger-bg); color: var(--st-danger); border-color: var(--st-danger); }
  /* The same violet the 3-D view paints provisional steel and the detailing panel gives
     the state row. One colour, one meaning, on every surface that names it — and the token
     that was owed here now exists, held equal to `three/rebar-scene.ts` by value rather than
     by hope.

     The fill and the label are the values this badge already had; they are what the token was
     derived from. The BORDER is a real change and a fix: `#6b4a8f` measured 1.76–2.17 against
     the band it outlines, well under the 3:1 §1.4.11 asks of a control boundary. The token is
     3.13–3.86. */
  .badge-provisional {
    background: var(--st-provisional-bg); color: var(--st-provisional-text);
    border-color: var(--st-provisional);
  }
  .badge-unavailable { background: rgba(136, 136, 136, 0.16); color: var(--st-text-2); border-color: var(--st-text-3); }
  /* Stale = desaturated + hatch, so it is distinguishable without hue. */
  .badge-stale {
    color: var(--st-text); border-color: var(--st-text-3);
    background: repeating-linear-gradient(45deg, rgba(138,143,122,0.30) 0 4px, rgba(93,97,84,0.30) 4px 8px);
  }
  .badge-outcome { background: rgba(60, 90, 140, 0.18); color: var(--st-text); border-color: var(--st-info); }
  .badge-outcome-VERIFIED { background: rgba(34, 204, 102, 0.16); color: var(--st-ok); border-color: var(--st-ok); }
  /* Three hues in one chip became two, and NOT the obvious two.
     `--st-danger` as the label on `--st-warn-bg` measures 4.09 over `--st-surface-3` — it
     fails AA on the darkest ground this badge can sit on, which is exactly what rule 1 of
     `shared-status-tokens.test.ts` forbids. So the severity rides the BORDER and the words
     stay at full contrast, which also keeps it distinct from `.badge-warn` above (warn on
     warn) and from `.badge-fail` (danger throughout). */
  .badge-outcome-SECTION_INADEQUATE {
    background: var(--st-warn-bg); color: var(--st-text); border-color: var(--st-danger);
  }
  .badge-outcome-SEARCH_EXHAUSTED { background: rgba(180, 120, 220, 0.16); color: var(--st-text); border-color: var(--st-text-3); }
  .badge-flag { background: rgba(70, 80, 100, 0.35); color: var(--st-text); border-color: var(--st-hair-strong); }
  .badge-flag-edited { color: var(--st-text); border-color: var(--st-info); }
  .badge-flag-provisional { color: var(--st-text); border-color: var(--st-text-3); }
  .badge-flag-sloped { color: var(--st-warn); border-color: var(--st-hair-strong); }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
</style>
