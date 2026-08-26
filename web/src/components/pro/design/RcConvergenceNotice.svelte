<script lang="ts">
  /**
   * What pressing Generate will PRODUCE, and for which families — beside the command.
   *
   * ── Why this is a label and not a second condition on the button ───
   *
   * The command is gated by `detailingStore.readiness` — is there anything to draw — and that is
   * the right gate for it. Detailing a partly designed frame is an ordinary operation: it is how
   * an engineer sees what the refused members do to the rest of the cage, and
   * `h1e-refused-state` asserts the button stays enabled with eight refused columns in the model
   * for exactly that reason. Disabling it would not make the design converge; it would take away
   * the tool used to converge it.
   *
   * What must not survive the gap is the CLAIM. `selectedScopeDetailed` — the sixteenth
   * constructibility condition — is where that is withheld, and this is where it is said out
   * loud before the run rather than discovered afterwards in a document that will not issue.
   *
   * ── Why the claim names its families ───────────────────────────────
   *
   * Because convergence is measured over the SELECTED families, so "converged" on its own is a
   * sentence about a scope the reader cannot see. "Design converged for beams and columns" and
   * "design converged" are different claims, and only the first is true of a building with
   * undesigned slabs in it. `out-of-scope` carries the other half: the families the model HAS
   * and this run does not answer for.
   *
   * ── The four states ────────────────────────────────────────────────
   *
   *   CONVERGED    every member of every selected family drawn and verified.
   *   PROPOSAL     every member drawn, some carrying a proposal rather than a certificate.
   *   INCOMPLETE   members of a selected family are outside the drawing, named with their
   *                remedy and their family.
   *   EMPTY_SCOPE  nothing selected, or nothing selected exists. Not a vacuous success.
   *
   * See `design-convergence.ts` for why these are four claims and not four severities.
   *
   * Its own component because `RcStageTimeline` is at its 600-line ceiling — the same decision
   * `RcBarList`, `RcTitleBlockFields`, `RcBendingSchedule`, `RcEditNotice` and
   * `RcRegenerationWarning` were extracted on.
   */
  import { t, tp } from '../../../lib/i18n';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import type { DesignFamily } from '../../../lib/engine/design/design-families';

  const readiness = $derived(detailingStore.readiness);
  const convergence = $derived(readiness.convergence);

  const STATE_KEY = {
    CONVERGED: 'converged', PROPOSAL: 'proposal',
    INCOMPLETE: 'incomplete', EMPTY_SCOPE: 'emptyScope',
  } as const;

  /** Families as words, in `DESIGN_FAMILIES` order, so two runs read the same way round. */
  const families = (fs: readonly DesignFamily[]) =>
    fs.map((f) => t(`detailing.convergence.family.${f}`)).join(', ');

  const claim = $derived(tp(`detailing.convergence.${STATE_KEY[convergence.state]}`, {
    families: families(convergence.scope),
    applicable: convergence.applicable,
    detailed: convergence.detailed,
    provisional: convergence.provisional.length,
  }));

  /**
   * The families the model has and this run does not cover.
   *
   * Rendered as its own line rather than folded into the claim, because it qualifies EVERY
   * state including the passing one — and a qualifier buried inside a sentence that begins
   * "Construction documentation" is a qualifier that will not be read.
   */
  const outOfScope = $derived(convergence.outOfScope.length === 0
    ? ''
    : tp('detailing.convergence.outOfScope', { families: families(convergence.outOfScope) }));

  /**
   * The gaps, named with their members, so "not construction documentation" is actionable.
   *
   * Six ids and then nothing, like `detailing-prerequisites` above it: the count is the figure
   * that matters and a list of forty element numbers is not a sentence anyone reads.
   */
  const gaps = $derived(convergence.gaps
    .map((g) => tp(g.key, { n: g.count, ids: g.elementIds.slice(0, 6).join(', ') }))
    .join(' '));
</script>

<!--
  Rendered only when the command can be pressed.

  On a project with nothing designed there is no detailing to characterise, and
  `detailing-prerequisites` already says why the command is unavailable. A second sentence about
  the same absence, calling it "0 of 0 members", is the fabricated-zero shape this branch removes
  everywhere else.
-->
{#if readiness.ready}
  <p class="convergence" data-state={convergence.state.toLowerCase()}
     data-testid="detailing-convergence">
    {claim}
    {#if outOfScope}
      <span class="out" data-testid="detailing-convergence-out-of-scope">{outOfScope}</span>
    {/if}
    {#if gaps}
      <span class="gaps" data-testid="detailing-convergence-gaps">{gaps}</span>
    {/if}
  </p>
{/if}

<style>
  /*
    The claim the next run will support, in the same register as the blockers beside it.

    The states differ by a rule on the leading edge and NOT by the colour of the text. Which
    claim this is has to survive a monochrome screen and a reader who cannot tell amber from
    green, and the sentence itself already names it — the rule is a second, redundant channel,
    which is the only kind this branch adds.
  */
  .convergence {
    flex-basis: 100%;
    margin: 0.25rem 0 0;
    padding-left: 0.4rem;
    border-left: 2px solid var(--st-hair-strong);
    font-size: 0.7rem;
    line-height: 1.35;
    color: var(--st-text-2);
  }

  .convergence[data-state='converged'] { border-left-color: var(--st-ok); }
  .convergence[data-state='proposal'] { border-left-color: var(--st-provisional-text); }
  .convergence[data-state='incomplete'] { border-left-color: var(--st-warn); }
  .convergence[data-state='empty_scope'] { border-left-color: var(--st-warn); }

  /* Both qualifiers on their own lines, so the claim reads first. */
  .out,
  .gaps {
    display: block;
    margin-top: 0.15rem;
    color: var(--st-text-2);
  }
</style>
