<script lang="ts">
  /**
   * The warning that has to sit above any metallic number this app displays.
   *
   * ── The defect it closes ───────────────────────────────────────────
   *
   * `ProVerificationTab` renders a CIRSOC 301 table with a green tick per row. Behind it is
   * `codes/argentina/cirsoc301.ts`: 769 lines with zero tests, no clause map, no capability
   * matrix and no entry in the maturity model. It is invoked with the unbraced length set
   * to the whole member, and it fabricates web and flange thicknesses and an ultimate
   * strength when the section or material does not state them.
   *
   * A green tick over that is the app claiming a verification it cannot support. The
   * numbers are not deleted — an engineer who can see the inputs and the assumptions is
   * better served by a labelled provisional figure than by a blank, which is the same
   * argument `maturity.ts` already makes for concrete — but they arrive with this above
   * them.
   *
   * ── Kept as its own component on purpose ───────────────────────────
   *
   * So that adding it to an existing screen is one import and one tag. PR #125 is rewriting
   * `ProVerificationTab` heavily, and the smaller the footprint here, the less of this
   * there is to reconcile.
   */
  import { t } from '../../../lib/i18n';
  import { CIRSOC301_JS_ASSUMPTIONS } from '../../../lib/engine/design/adapters/cirsoc301-capabilities';

  interface Props {
    /** Show the assumption list. Off where space is tight and the list is elsewhere. */
    detailed?: boolean;
  }
  const { detailed = true }: Props = $props();
</script>

<div class="banner" role="note" data-testid="steel-checker-experimental-banner">
  <p class="lead">
    <span aria-hidden="true">⚗</span>
    <strong>{t('steel.checker.experimentalTitle')}</strong>
  </p>
  <p class="body">{t('steel.checker.experimentalBody')}</p>
  {#if detailed}
    <ul>
      {#each CIRSOC301_JS_ASSUMPTIONS as key (key)}
        <li>{t(key)}</li>
      {/each}
    </ul>
    <p class="promotion">{t('steel.promotion.needsClauseMapAndBenchmark')}</p>
  {/if}
</div>

<style>
  /* Hatched, not merely amber: the pattern survives a monochrome print of a report. */
  .banner {
    margin: 6px 0;
    padding: 8px 10px;
    border: 1px solid var(--st-warn);
    border-radius: 4px;
    background: repeating-linear-gradient(45deg,
      rgba(221, 170, 0, 0.14) 0 6px, rgba(120, 92, 0, 0.14) 6px 12px);
    color: var(--st-warn);
  }
  .lead { margin: 0; display: flex; gap: 6px; align-items: baseline; font-size: 0.76rem; }
  .body { margin: 4px 0 0; font-size: 0.7rem; line-height: 1.45; }
  ul { margin: 6px 0 0; padding-left: 18px; font-size: 0.68rem; line-height: 1.45; }
  .promotion { margin: 6px 0 0; font-size: 0.68rem; font-style: italic; color: var(--st-warn); }
</style>
