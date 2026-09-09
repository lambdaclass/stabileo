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
   */
  import { t, tp } from '../../../lib/i18n';

  interface Props {
    /** How many members carry a proposal. Zero renders nothing. */
    count: number;
  }
  const { count }: Props = $props();
</script>

{#if count > 0}
  <p class="provisional-banner" data-testid="rebar-provisional-banner" data-count={count}>
    <strong>{t('design.provisional.notForConstruction')}</strong>
    {tp('detailing.scene.provisionalBanner', { n: count })}
  </p>
{/if}

<style>
  .provisional-banner {
    margin: 0;
    padding: 0.4rem 0.75rem;
    /* The same violet the 3-D view paints provisional steel with. One colour, one meaning —
       and now one definition. The three literals here were the values the token was derived
       FROM, so adopting it changes no pixel except the body copy, which goes from `#e2d3f5`
       (11.98 on this band) to `--st-text` (13.00): the sentence at full contrast, the emphasis
       carrying the state. The same shape `FootingMatPhysicalPanel` measured its way into. */
    background: var(--st-provisional-bg);
    border-bottom: 1px solid var(--st-provisional);
    color: var(--st-text);
    font-size: 0.76rem;
    line-height: 1.4;
  }
  .provisional-banner strong { color: var(--st-provisional-text); letter-spacing: 0.02em; }
</style>
