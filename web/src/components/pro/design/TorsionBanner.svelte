<script lang="ts">
  /**
   * "The analysis says there is torsion here, and nothing in this app checked it."
   *
   * ── Why a banner, and why a separate one ───────────────────────
   *
   * Separate from `ProvisionalBanner` because they are different facts about different
   * members. A proposal is steel whose SECONDARY BENDING was never checked; this is steel whose
   * TORSION was never checked. A member can be either, both, or neither, and one banner
   * covering both would tell the reader neither which members nor which action.
   *
   * ── Why it does not hide the geometry ──────────────────────────
   *
   * Because the geometry is the point. A member with unevaluated torsion keeps its concrete,
   * its cage and its proposal, and it stays selectable — turning it into a failure would take
   * away the very picture the engineer needs in order to make the judgement the application is
   * declining to make for them. What must be impossible is mistaking the picture for a
   * completed verification, and that is what this sentence is for.
   *
   * The same warning is on the sheets, in the schedule and in the report, each rendered by a
   * different module. This is the workspace's copy, kept small and separate so the four cannot
   * drift into saying four different things.
   */
  import { t, tp } from '../../../lib/i18n';
  import RebarNotice from './RebarNotice.svelte';

  interface Props {
    /** How many members carry unevaluated torsion. Zero renders nothing. */
    count: number;
  }
  const { count }: Props = $props();
</script>

{#if count > 0}
  <!--
    Folding leaves the label and the count. The missing VERIFICATION is the whole content of this
    notice, so a fold that removed the words would remove the fact — see `RebarNotice.svelte`.
  -->
  <div class="torsion-band">
    <RebarNotice
      kind="torsion"
      {count}
      testid="rebar-torsion-banner"
      label={t('detailing.scene.torsionLabel')}
      detail={tp('detailing.scene.torsionBanner', { n: count })}
    />
  </div>
{/if}

<style>
  .torsion-band {
    /* Amber, which is neither the violet of a proposal nor the red of a conflict: this is an
       unverified action, not an unbuildable bar and not a clash. One colour, one meaning. */
    background: var(--st-surface-3);
    border-bottom: 1px solid var(--st-warn);
  }
  /* `--st-warn`, not the `#d4762a` the scene paints unreinforced bars with: a torsion
     advisory and an unreinforced bar are unrelated states that happened to share an orange.
     `:global` for the reason `ProvisionalBanner` states: the `<strong>` is the shared shell's
     markup, and the tone is this notice's meaning rather than the shell's business. */
  .torsion-band :global(strong) { color: var(--st-warn); }
</style>
