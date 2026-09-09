<script lang="ts">
  /**
   * "This is a proposal, and a proposal is not documentation."
   *
   * ── Why a banner and not only a colour ─────────────────────────
   *
   * The violet steel in the viewport says WHICH bars are a proposal. It does not say that a
   * proposal may not be issued, and that sentence has to be unmissable and permanent while
   * the model holds one: the whole risk of drawing provisional steel is that it looks exactly
   * like the real thing from across a desk.
   *
   * ── Why its own component ──────────────────────────────────────
   *
   * The same warning belongs on the drawing sheets, the schedule and the report, and each of
   * those is rendered by a different module. This is the workspace's copy of it, kept small
   * and separate so the four cannot drift into saying four different things.
   *
   * ── The fold, and why it does not contradict the paragraph above ───
   *
   * F6 asks for these notices to be compact and closable. "Permanent" above is a claim about
   * the SENTENCE, not about 48 px of chrome: folded, the label and the count stay at full
   * contrast and only the explanation goes away, so the drawing can never come to look finished.
   * The mechanism is `RebarNotice.svelte`; the state is session-scoped and keyed on the count,
   * so a regeneration that changes the number re-opens this by itself.
   */
  import { t, tp } from '../../../lib/i18n';
  import RebarNotice from './RebarNotice.svelte';

  interface Props {
    /** How many members carry a proposal. Zero renders nothing. */
    count: number;
  }
  const { count }: Props = $props();
</script>

{#if count > 0}
  <!--
    The violet band is declared HERE and not in `RebarNotice`, because the colour is this
    notice's meaning: it is the one the 3-D view paints provisional steel with, and a shared
    shell that owned it would have to know which fact it was wearing.
  -->
  <div class="provisional-band">
    <RebarNotice
      kind="provisional"
      {count}
      testid="rebar-provisional-banner"
      label={t('design.provisional.notForConstruction')}
      detail={tp('detailing.scene.provisionalBanner', { n: count })}
    />
  </div>
{/if}

<style>
  /*
    The same violet the 3-D view paints provisional steel with. One colour, one meaning —
    and now one definition. The three literals here were the values the token was derived
    FROM, so adopting it changes no pixel except the body copy, which goes from `#e2d3f5`
    (11.98 on this band) to `--st-text` (13.00): the sentence at full contrast, the emphasis
    carrying the state. The same shape `FootingMatPhysicalPanel` measured its way into.

    ── On the NOTICE, not on this wrapper ──────────────────────────────

    F6 first put these two declarations on `.provisional-band` and left `data-testid` on the
    notice inside it. The band still looked right — `.notice` has `margin: 0` and fills the
    wrapper, so the same pixels were painted — but the specs read `getComputedStyle` of the
    element carrying the testid, and that element had no background of its own: the guard for
    this colour went on reporting `rgba(0, 0, 0, 0)` against a violet nobody had removed.

    So the state goes on the element that is measured. `:global(.notice)` for the same reason
    the `<strong>` rule below needs it — the markup belongs to `RebarNotice` and Svelte scopes
    styles to the component that declares them. The wrapper stays as the scoping anchor, which
    is the only job it ever had.
  */
  .provisional-band :global(.notice) {
    background: var(--st-provisional-bg);
    border-bottom: 1px solid var(--st-provisional);
  }
  /* The claim's own colour. `:global` because the `<strong>` belongs to `RebarNotice`'s markup
     and Svelte scopes styles to the component that declares them — the alternative is a `tone`
     prop that would put this notice's palette inside the shared shell. */
  .provisional-band :global(strong) { color: var(--st-provisional-text); }
</style>
