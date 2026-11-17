<script lang="ts">
  /**
   * What regenerating is about to replace — before it runs.
   *
   * ── Why there is anything to warn about ────────────────────────────
   *
   * `runDetailing` carries a LOCKED member's bars through untouched and re-details every other
   * member from the design outcomes. So a hand edit on an unlocked member IS replaced by a
   * regeneration — correctly; that is what regenerating means — and until now nobody was told
   * before it happened. A warning that arrives after the work is gone is not a warning.
   *
   * ── Why it is not a confirmation dialog ────────────────────────────
   *
   * Because a confirmation a user dismisses every time stops being read, and this is a fact
   * about their project they should be able to see while deciding whether to press. It sits
   * beside the command, as text rather than a `title` — the same rule the blockers sentence in
   * `RcStageTimeline` already follows: a tooltip is reachable by a mouse and by a screen reader
   * and by nothing else.
   *
   * ── The three states ───────────────────────────────────────────────
   *
   *   nothing to say      no hand edits, or every one of them locked. Silent.
   *   n will be replaced  named, so the user can lock the ones they meant to keep first.
   *   we do not know      a project opened from a file that never recorded its hand edits.
   *                       "Nothing will be lost" would be a claim on no evidence.
   *
   * Its own component because `RcStageTimeline` is at its 600-line ceiling — the same decision
   * `RcBarList`, `RcTitleBlockFields`, `RcBendingSchedule` and `RcEditNotice` were extracted on.
   */
  import { t, tp } from '../../../lib/i18n';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { rcRegenerationWarns } from '../../../lib/flow/rc-selection';

  const impact = $derived(detailingStore.regenerationImpact);
</script>

{#if rcRegenerationWarns(impact)}
  <p class="regen-warn" data-testid="regen-warning" role="status">
    {#if impact.unknown}
      {t('detailing.regen.unknownRetouches')}
    {:else}
      {tp('detailing.regen.willReplace', {
        n: impact.replaced.length,
        ids: impact.replaced.slice(0, 8).join(', '),
      })}
      {#if impact.kept.length > 0}
        <span class="regen-kept" data-testid="regen-warning-kept">
          {tp('detailing.regen.willKeep', {
            n: impact.kept.length, ids: impact.kept.slice(0, 8).join(', '),
          })}
        </span>
      {/if}
    {/if}
  </p>
{/if}

<style>
  /*
    Amber tint and a rule, never an opaque fill — the form every state on this surface uses, and
    the contrast reason `--st-warn-bg` exists for. It is a WARNING and not an error: regenerating
    over an unlocked edit is a legitimate thing to do, and colouring it as a fault would train
    people to press through it.
  */
  .regen-warn {
    flex-basis: 100%;
    margin: 0.35rem 0 0;
    padding: 0.3rem 0.5rem;
    border-left: 3px solid var(--st-warn);
    border-radius: 4px;
    background: var(--st-warn-bg);
    font-size: 0.7rem;
    line-height: 1.4;
    color: var(--st-text);
  }
  /* What survives, after what does not: the reassurance is secondary to the warning. */
  .regen-kept { color: var(--st-text-2); }
</style>
