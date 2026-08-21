<script lang="ts">
  /**
   * One family's state, its reason, the scope of the last run and the next step.
   *
   * Extracted from `FloorFamiliesPanel` because that panel sits at the repo's 600-LOC ceiling
   * and `rc-design-gates.test.ts` enforces it. The split is also the honest one: everything
   * here is presentation over a value `floor-family-state.ts` already computed, and none of it
   * reads a store.
   *
   * Concrete-only. Nothing here is shared with the metallic surface.
   */
  import { t, tp } from '../../../lib/i18n';
  import type { FloorFamilyState } from '../../../lib/engine/detailing/floor-family-state';

  interface Props {
    state: FloorFamilyState;
    /** The store's error text, shown verbatim rather than paraphrased. */
    error: string | null;
    /** Shells classified as neither slab nor wall. `null` when no run has classified any. */
    offFamily: { inclined: number; degenerate: number; total: number } | null;
  }
  const { state, error, offFamily }: Props = $props();

  /** Glyph per state, so the state is never carried by colour alone. */
  const GLYPH: Record<FloorFamilyState['kind'], string> = {
    error: '\u2715', notRun: '\u00b7', noElements: '\u2014', skipped: '\u25cb',
    designed: '\u2713', refused: '\u2715', provisional: '\u2697',
  };
</script>

  <!--
    The state of the selected family, in words, with the reason and the next step.

    Four separate facts, deliberately not compressed into one line: WHAT the state is, WHY it
    is that, WHAT the last run actually covered, and WHAT to do next. The panel used to carry
    the first of those as a bare number in a tab and none of the other three.
  -->
  <section class="fam-state" data-state={state.kind} data-testid="floor-family-state">
    <p class="fam-state-head">
      <span class="st-badge" data-state={state.kind} data-testid="floor-state-badge">
        <span aria-hidden="true">{GLYPH[state.kind]}</span>
        {t(`design.floor.state.${state.kind}`)}
      </span>
      <span class="fam-state-why" data-testid="floor-state-why">{t(`design.floor.state.why.${state.kind}`)}</span>
    </p>

    <!-- The scope of the last run, or the statement that there was none. Never a row of zeros. -->
    <dl class="fam-scope">
      <dt>{t('design.floor.state.scopeTitle')}</dt>
      <dd data-testid="floor-state-scope">
        {#if state.countsUnavailable}
          {t('design.floor.state.scopeNone')}
        {:else}
          {tp('design.floor.state.scope', {
            classified: state.classified, designed: state.designed,
            refused: state.refused, skipped: state.skipped,
          })}
        {/if}
      </dd>
      <dt>{t('design.floor.state.nextTitle')}</dt>
      <dd data-testid="floor-state-next">{t(`design.floor.state.next.${state.kind}`)}</dd>
    </dl>

    <!-- The store's error text itself, when there is one. Not paraphrased. -->
    {#if state.kind === 'error' && error}
      <p class="fam-error" role="alert" data-testid="floor-state-error">{error}</p>
    {/if}
  </section>

  <!--
    Shells the run classified as neither slab nor wall.

    `ShellFamily` has four values and this panel had two tabs, so `inclined` and `degenerate`
    were classified by the pass and then appeared in no count anywhere — not in slabs, not in
    walls, and not in the refusals unless they happened to raise one. A shell the app cannot
    design is a fact an engineer needs; this is where it now lands.
  -->
  {#if offFamily && offFamily.total > 0}
    <section class="off-family" data-testid="floor-off-family">
      <p class="off-head">{t('design.floor.state.offFamilyTitle')}
        <span class="off-n" data-testid="floor-off-family-counts">{tp('design.floor.state.offFamily', {
          inclined: offFamily.inclined, degenerate: offFamily.degenerate,
        })}</span>
      </p>
      <p class="off-why">{t('design.floor.state.offFamilyWhy')}</p>
    </section>
  {/if}

  <!--
    Which pass owns which families.

    "Design all" and this command were two primary buttons two disclosures apart, both saying
    "design", neither saying over WHAT. That is the one sentence that makes the pipeline legible.
  -->
  <p class="scope-vs-all" data-testid="floor-scope-vs-all">{t('design.floor.state.scopeVsAll')}</p>


<style>
  /* ── H1 · estados de familia ─────────────────────────────────────── */
  .fam-state {
    margin: 8px 0; padding: 8px 10px; border-radius: 4px;
    background: var(--st-surface); border-left: 2px solid var(--st-hair-strong);
  }
  .fam-state[data-state='error'], .fam-state[data-state='refused'] { border-left-color: var(--st-danger); }
  /*
     Provisional is violet, not amber.
     It was `--st-warn` here while `ProvisionalBanner`, `RebarStatusPanel` and the 3-D scene
     all painted it `#a066d3` — one state with two visual meanings, which is worse than
     either. `--st-provisional` is that same violet, held equal to Three.js by value in
     `shared-status-tokens.test.ts`.
  */
  .fam-state[data-state='provisional'] { border-left-color: var(--st-provisional); }
  .fam-state[data-state='designed'] { border-left-color: var(--st-ok); }
  .fam-state-head { margin: 0 0 6px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
  .fam-state-why { font-size: 0.68rem; line-height: 1.45; color: var(--st-text-2); }
  /* Glifo + palabra: el estado se lee con el color quitado. */
  .st-badge {
    font-size: 0.66rem; font-weight: 600; white-space: nowrap;
    padding: 1px 6px; border-radius: 3px;
    background: var(--st-surface-3); color: var(--st-text);
  }
  .st-badge[data-state='error'], .st-badge[data-state='refused'] { color: var(--st-danger); }
  /*
     The BADGE takes `-text`, the rule above takes the plain token, and that is not a style
     preference. `--st-provisional` measures 4.30 on `--st-surface` and 3.77 on
     `--st-surface-3`: over the 3:1 WCAG 2.1 §1.4.11 asks of a rule, under the 4.5 a 0.7rem
     label needs. `--st-provisional-text` is 9.58 and 8.41 on the same two.
  */
  .st-badge[data-state='provisional'] { color: var(--st-provisional-text); }
  .st-badge[data-state='designed'] { color: var(--st-ok); }
  .fam-scope { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 0; font-size: 0.66rem; }
  .fam-scope dt { color: var(--st-text-3); font-weight: 600; white-space: nowrap; }
  .fam-scope dd { margin: 0; color: var(--st-text-2); line-height: 1.4; }
  .fam-error { margin: 6px 0 0; font-size: 0.66rem; color: var(--st-danger); line-height: 1.4; }
  /* Un guion, no un cero: la ausencia de dato no es una cantidad. */
  .no-n { font-size: 0.66rem; color: var(--st-text-3); margin-left: 3px; }
  .st { font-size: 0.6rem; margin-left: 4px; color: var(--st-text-3); white-space: nowrap; }
  .off-family {
    margin: 8px 0; padding: 7px 9px; border-radius: 4px;
    border: 1px solid var(--st-hair); background: var(--st-surface);
  }
  .off-head { margin: 0 0 4px; font-size: 0.68rem; font-weight: 600; color: var(--st-text); }
  .off-n { font-weight: 400; color: var(--st-text-2); margin-left: 6px; }
  .off-why { margin: 0; font-size: 0.64rem; line-height: 1.45; color: var(--st-text-2); }
  .scope-vs-all { margin: 8px 0; font-size: 0.66rem; line-height: 1.45; color: var(--st-text-2); }
</style>
