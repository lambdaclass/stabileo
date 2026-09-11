<script lang="ts">
  /**
   * The workspace's top bar: title, readiness, summary, and the four controls.
   *
   * ── Why this is its own file ───────────────────────────────────────
   *
   * `RebarWorkspace.svelte` has sat within a dozen lines of the 600-line ceiling for this whole
   * branch, and twice a COMMENT alone pushed it over — once in the typography change and once in
   * the close-button relabel. A file that cannot afford to be explained is a file that stops
   * being explained, which is the failure the ceiling exists to prevent rather than cause.
   *
   * The precedent is `FloorFamilyStateCard`, extracted from `FloorFamiliesPanel` at 607 lines
   * instead of raising the limit.
   *
   * ── What moved, and what did not ───────────────────────────────────
   *
   * Markup and styles only. No behaviour: every control calls back into the parent, `railOpen` is
   * bound so the parent still owns it, and the four `data-testid`s are unchanged — the specs that
   * read them do not know this file exists.
   *
   * This is a presentational component. It takes what it needs and decides nothing.
   */
  import { t, tp } from '../../../lib/i18n';
  import type { SceneSummary } from '../../../lib/engine/detailing/scene-model';

  interface Props {
    /** Readiness and revision, when a scene has been built. `null` while it has not. */
    readiness: string | null;
    revision: number | null;
    /** The bar tally, or `null` when there is nothing to summarise. */
    summary: SceneSummary | null;
    /** Locale-aware number formatting, passed in so this file holds no i18n state of its own. */
    fmt: (n: number, digits?: number) => string;
    /** Bound: the parent owns whether the rail is open, and persists it. */
    railOpen: boolean;
    /** Navigation history, not the way out — see `onClose`. */
    canGoBack: boolean;
    onBack: () => void;
    onFitView: () => void;
    onClose: () => void;
  }

  let {
    readiness, revision, summary, fmt,
    railOpen = $bindable(), canGoBack, onBack, onFitView, onClose,
  }: Props = $props();
</script>

<header class="topbar">
  <button
    class="rail-toggle"
    type="button"
    data-testid="rebar-rail-toggle"
    aria-expanded={railOpen}
    onclick={() => { railOpen = !railOpen; }}
  >☰</button>
  <h2>{t('detailing.scene.workspace.title')}</h2>
  {#if readiness}
    <span class="badge" data-testid="rebar-workspace-readiness">
      {t(`detailing.doc.readiness.${readiness}`)}
    </span>
    <span class="rev">{tp('detailing.doc.revision', { n: revision ?? 0 })}</span>
  {/if}
  {#if summary}
    <span class="sum" data-testid="rebar-workspace-summary">
      {tp('detailing.scene.summary', {
        bars: summary.barCount,
        length: fmt(summary.totalLength),
        mass: fmt(summary.massKg, 1),
      })}
    </span>
  {/if}
  <span class="spacer"></span>
  <!--
    `Previous`, and NOT the way out.

    `canGoBack` is the selection HISTORY — `history.length > 0` in the store — so this appears
    once the user has moved between members and steps back through those. Naming it apart from
    the close button matters: an audit of this workspace recorded "there is no Back" from a fresh
    overlay, where the history is empty and this is correctly absent.
  -->
  {#if canGoBack}
    <button type="button" data-testid="rebar-back" onclick={onBack}>
      ← {t('detailing.scene.back')}
    </button>
  {/if}
  <button type="button" data-testid="rebar-fit-view" onclick={onFitView}>
    {t('detailing.scene.reset')}
  </button>
  <!-- WORKFLOW, not model: it returns to the design stage this was opened from. -->
  <button class="close" type="button" data-testid="rebar-workspace-close" onclick={onClose}>
    ✕ {t('detailing.scene.workspace.close')}
  </button>
</header>

<style>
  .topbar {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.45rem 0.75rem;
    border-bottom: 1px solid var(--st-hair);
    background: var(--st-surface);
    flex: 0 0 auto;
    flex-wrap: wrap;
  }
  /* The same heading weight the panel headers use, so the two read as one hierarchy. */
  .topbar h2 { margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--st-text); }
  .spacer { flex: 1 1 auto; }
  /* The same pill the design surface uses for a state, not a lookalike. */
  .badge {
    font-size: 0.7rem; padding: 0.1rem 0.45rem; border-radius: 3px; font-weight: 600;
    background: var(--st-surface-3); color: var(--st-text);
  }
  .rev, .sum { font-size: 0.74rem; color: var(--st-text-2); }
  .topbar button {
    font-size: 0.76rem; padding: 0.25rem 0.6rem; cursor: pointer;
    background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: 4px;
    font-family: inherit;
  }
  .topbar button:hover { background: var(--st-hair-strong); }
  .topbar button:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  /* Leaving is the one action here that changes where you are, so it carries the accent border. */
  .topbar button.close { border-color: var(--st-interactive); }
  .rail-toggle { display: none; }

  /*
     Mobile: the toggle appears and the two long figures step aside.

     Carried over verbatim from the parent's media query. `font-family: inherit` above is carried
     too — the parent's `:global()` control rule is scoped to `.workspace` and Svelte scopes a
     selector to the component that declares it, so a button in THIS file needs its own.
  */
  @media (max-width: 860px) {
    .rail-toggle { display: inline-block; }
    .topbar h2 { font-size: 0.85rem; }
    .rev, .sum { display: none; }
  }
</style>
